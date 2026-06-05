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

  // ── GET /api/browse?path=... → directory listing ───────────────────────
  if (url.pathname === '/api/browse' && req.method === 'GET') {
    const dirPath = url.searchParams.get('path') || '/mnt';
    let result;
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true })
        .filter(e => {
          if (e.name.startsWith('.')) return false;
          return e.isDirectory() || /\.(mp4|mov|mkv|avi|webm|m4v|mts|ts)$/i.test(e.name);
        })
        .map(e => ({ name: e.name, type: e.isDirectory() ? 'dir' : 'file', path: path.join(dirPath, e.name) }))
        .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
      const parent = dirPath !== '/' ? path.dirname(dirPath) : null;
      result = { path: dirPath, parent, entries };
    } catch (e) {
      result = { path: dirPath, parent: path.dirname(dirPath), entries: [], error: e.message };
    }
    res.writeHead(200, { 'Content-Type': 'application/json', ...CORS });
    return res.end(JSON.stringify(result));
  }

  // ── GET /api/video?path=... → stream a local video file (Range-aware) ──
  if (url.pathname === '/api/video' && req.method === 'GET') {
    const filePath = url.searchParams.get('path');
    if (!filePath) { res.writeHead(400); return res.end('path required'); }
    let stat;
    try { stat = fs.statSync(filePath); } catch { res.writeHead(404); return res.end('Not found'); }
    const total = stat.size;
    const ext   = path.extname(filePath).toLowerCase();
    const mime  = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska',
                    '.webm': 'video/webm', '.avi': 'video/x-msvideo' }[ext] || 'video/mp4';
    const rangeHeader = req.headers.range;
    if (rangeHeader) {
      const [startStr, endStr] = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(startStr, 10);
      const end   = endStr ? parseInt(endStr, 10) : total - 1;
      res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${total}`,
        'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Content-Type': mime, ...CORS });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { 'Content-Length': total, 'Content-Type': mime,
        'Accept-Ranges': 'bytes', ...CORS });
      fs.createReadStream(filePath).pipe(res);
    }
    return;
  }

  // ── POST /api/probe → ffprobe a file and stream results ───────────────
  if (url.pathname === '/api/probe' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      let params;
      try { params = JSON.parse(body); } catch { res.writeHead(400); return res.end('Bad JSON'); }
      const { file } = params;
      if (!file) { res.writeHead(400); return res.end('file required'); }
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', ...CORS });
      const send = text => res.write(`data: ${JSON.stringify({ type: 'log', text })}\n\n`);
      const done = () => { res.write(`data: ${JSON.stringify({ type: 'done', ok: true })}\n\n`); res.end(); };
      send(`Probing: ${file}\n\n`);
      const args = [
        '-v', 'error',
        '-select_streams', 'v:0,a:0',
        '-show_entries', 'format=duration:stream=codec_type,duration,nb_frames,r_frame_rate,avg_frame_rate',
        '-of', 'default',
        file,
      ];
      const p = spawn('ffprobe', args);
      p.stdout.on('data', d => send(d.toString()));
      p.stderr.on('data', d => send(d.toString()));
      p.on('close', () => done());
    });
    return;
  }

  // ── POST /api/trim-only → trim, probe result, keep file for inspection ─
  if (url.pathname === '/api/trim-only' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      let params;
      try { params = JSON.parse(body); } catch { res.writeHead(400); return res.end('Bad JSON'); }
      const { source, keeps } = params;
      if (!source) { res.writeHead(400); return res.end('source required'); }
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', ...CORS });
      const send = (type, text) => res.write(`data: ${JSON.stringify({ type, text })}\n\n`);
      const done = ok => { res.write(`data: ${JSON.stringify({ type: 'done', ok })}\n\n`); res.end(); };
      fs.writeFileSync(TMP_CUTS, JSON.stringify({ source: path.basename(source), keep: keeps }));
      send('log', '=== Trim only ===\n');
      const trim = spawn('bash', [TRIM_SH, '--cuts', TMP_CUTS, '--input', source, '--out', TMP_TRIM]);
      trim.stdout.on('data', d => send('log', d.toString()));
      trim.stderr.on('data', d => send('log', d.toString()));
      trim.on('close', code => {
        if (code !== 0) { send('error', `Trim failed (exit ${code})`); return done(false); }
        send('log', `\n=== ffprobe on trimmed file (${TMP_TRIM}) ===\n`);
        const p = spawn('ffprobe', [
          '-v', 'error', '-select_streams', 'v:0,a:0',
          '-show_entries', 'format=duration:stream=codec_type,duration,nb_frames,r_frame_rate',
          '-of', 'default', TMP_TRIM,
        ]);
        p.stdout.on('data', d => send('log', d.toString()));
        p.stderr.on('data', d => send('log', d.toString()));
        p.on('close', () => {
          send('log', `\nTrimmed file kept at: ${TMP_TRIM}\n`);
          done(true);
        });
      });
    });
    return;
  }

  // ── POST /api/assemble-test → assemble intro+outro only (no speaker) ──
  if (url.pathname === '/api/assemble-test' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      let params;
      try { params = JSON.parse(body); } catch { res.writeHead(400); return res.end('Bad JSON'); }
      const { output } = params;
      const out = output || '/tmp/dse-assemble-test.mp4';
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', ...CORS });
      const send = (type, text) => res.write(`data: ${JSON.stringify({ type, text })}\n\n`);
      const done = ok => { res.write(`data: ${JSON.stringify({ type: 'done', ok })}\n\n`); res.end(); };
      // Use a 5-second silent black video as a stand-in speaker
      const SILENT_SPEAKER = '/tmp/dse-silent-speaker.mp4';
      send('log', '=== Generating 5s silent speaker stand-in ===\n');
      const gen = spawn('ffmpeg', [
        '-hide_banner', '-loglevel', 'warning', '-y',
        '-f', 'lavfi', '-i', 'color=black:size=1920x1080:rate=30:duration=5',
        '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
        '-t', '5', '-c:v', 'libx264', '-c:a', 'aac', SILENT_SPEAKER,
      ]);
      gen.stderr.on('data', d => send('log', d.toString()));
      gen.on('close', code => {
        if (code !== 0) { send('error', 'Failed to generate silent speaker'); return done(false); }
        send('log', '\n=== Assembling intro + silent speaker + outro ===\n');
        const asm = spawn('bash', [ASSEMBLE_SH, '--speaker', SILENT_SPEAKER, '--out', out]);
        asm.stdout.on('data', d => send('log', d.toString()));
        asm.stderr.on('data', d => send('log', d.toString()));
        asm.on('close', code2 => {
          if (code2 !== 0) { send('error', `Assemble failed (exit ${code2})`); return done(false); }
          send('log', `\n=== ffprobe on assembled test file ===\n`);
          const p = spawn('ffprobe', [
            '-v', 'error', '-select_streams', 'v:0,a:0',
            '-show_entries', 'format=duration:stream=codec_type,duration',
            '-of', 'default', out,
          ]);
          p.stdout.on('data', d => send('log', d.toString()));
          p.on('close', () => { send('log', `\nTest file: ${out}\n`); done(true); });
        });
      });
    });
    return;
  }

  // ── POST /api/process → SSE pipeline ───────────────────────────────────
  if (url.pathname === '/api/process' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      let params;
      try { params = JSON.parse(body); } catch { res.writeHead(400); return res.end('Bad JSON'); }
      const { source, keeps, titleCard, output } = params;
      if (!source || !source.trim()) { res.writeHead(400); return res.end('source path is required'); }

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

        // Probe trimmed file so any V/A mismatch is visible in the log.
        const probe = spawn('ffprobe', [
          '-v', 'error', '-select_streams', 'v:0,a:0',
          '-show_entries', 'stream=codec_type,duration',
          '-of', 'default=noprint_wrappers=1', TMP_TRIM,
        ]);
        let probeOut = '';
        probe.stdout.on('data', d => { probeOut += d; });
        probe.stderr.on('data', d => { probeOut += d; });
        probe.on('close', () => {
          send('log', `\nTrimmed file stream durations:\n${probeOut}`);
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
