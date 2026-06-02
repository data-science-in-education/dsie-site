#!/usr/bin/env node
'use strict';

const http      = require('http');
const fs        = require('fs');
const path      = require('path');
const { spawn } = require('child_process');

const PORT        = 3737;
const ROOT        = path.resolve(__dirname, '../..');
const TRIM_SH     = path.join(__dirname, 'trim.sh');
const ASSEMBLE_SH = path.join(__dirname, 'assemble.sh');
const CARDS_DIR   = path.join(ROOT, 'images', 'video-cards');
const TMP_CUTS    = '/tmp/dse-cuts.json';
const TMP_TRIM    = '/tmp/dse-trimmed.mp4';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS); return res.end();
  }

  // ── GET / → trim.html ───────────────────────────────────────────────────
  if (url.pathname === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(path.join(__dirname, 'trim.html')));
  }

  // ── GET /api/talks → list title-card PNGs ──────────────────────────────
  if (url.pathname === '/api/talks' && req.method === 'GET') {
    let files = [];
    try { files = fs.readdirSync(CARDS_DIR).filter(f => /\.png$/i.test(f)).sort(); } catch {}
    res.writeHead(200, { 'Content-Type': 'application/json', ...CORS });
    return res.end(JSON.stringify(files));
  }

  // ── POST /api/process → SSE pipeline ───────────────────────────────────
  if (url.pathname === '/api/process' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      let params;
      try { params = JSON.parse(body); } catch { res.writeHead(400); return res.end('Bad JSON'); }
      const { source, keeps, titleCard, output } = params;

      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', ...CORS });

      const send = (type, text) => res.write(`data: ${JSON.stringify({ type, text })}\n\n`);
      const done = ok => { res.write(`data: ${JSON.stringify({ type: 'done', ok })}\n\n`); res.end(); };

      fs.writeFileSync(TMP_CUTS, JSON.stringify({ source: path.basename(source), keep: keeps }));

      send('log', '=== Step 1/2: Trimming ===\n');
      const trim = spawn('bash', [TRIM_SH, '--cuts', TMP_CUTS, '--input', source, '--out', TMP_TRIM]);
      trim.stdout.on('data', d => send('log', d.toString()));
      trim.stderr.on('data', d => send('log', d.toString()));
      trim.on('close', code => {
        if (code !== 0) { send('error', `Trim failed (exit ${code})`); return done(false); }

        send('log', '\n=== Step 2/2: Assembling ===\n');
        const args = [ASSEMBLE_SH, '--speaker', TMP_TRIM, '--out', output];
        if (titleCard) args.push('--title-card', path.join(CARDS_DIR, titleCard));
        const asm = spawn('bash', args);
        asm.stdout.on('data', d => send('log', d.toString()));
        asm.stderr.on('data', d => send('log', d.toString()));
        asm.on('close', code2 => {
          try { fs.unlinkSync(TMP_TRIM); } catch {}
          if (code2 !== 0) { send('error', `Assemble failed (exit ${code2})`); return done(false); }
          send('log', `\n✓ Done → ${output}\n`);
          done(true);
        });
      });
    });
    return;
  }

  res.writeHead(404); res.end('Not found');

}).listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\nDSE Video Studio → ${url}\n`);
  for (const cmd of ['wslview', 'xdg-open', 'open']) {
    try { require('child_process').execSync(`${cmd} ${url} 2>/dev/null`); break; } catch {}
  }
});
