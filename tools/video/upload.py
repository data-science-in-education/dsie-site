#!/usr/bin/env python3
"""
DSE — YouTube upload script

Uploads a finished talk video to the Data Science in Education
YouTube channel via the YouTube Data API v3.

First-time setup (do this once):

  1. Create a project at https://console.cloud.google.com/
  2. Enable "YouTube Data API v3" in that project.
  3. Create OAuth 2.0 credentials (Desktop app).
  4. Download the JSON, save as `tools/video/client_secrets.json`.
  5. Make sure you sign in with the Google account that OWNS the
     YouTube channel (or has manager access via a Brand Account).

First run opens a browser for consent. The refresh token is
cached in `tools/video/token.json` so subsequent runs are silent.

Usage:

  ./upload.py --video out/final.mp4 --metadata talk-meta.yaml

  or with inline flags:

  ./upload.py --video out/final.mp4 \\
      --title "Causal inference in edtech - Dr. Lena Park" \\
      --description "Recorded at DSE meetup, 4 June 2026." \\
      --tags "data science,education,edtech,causal inference" \\
      --privacy unlisted

Privacy: public | unlisted | private (default: unlisted).
"""

import argparse
import json
import os
import pathlib
import sys

try:
    import yaml
except ImportError:
    yaml = None

try:
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build
    from googleapiclient.errors import HttpError
    from googleapiclient.http import MediaFileUpload
except ImportError:
    print(
        "ERROR: missing Google API client libraries.\n"
        "Run:  pip install -r tools/video/requirements.txt",
        file=sys.stderr,
    )
    sys.exit(1)

SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]
HERE = pathlib.Path(__file__).resolve().parent
CLIENT_SECRETS = HERE / "client_secrets.json"
TOKEN_CACHE = HERE / "token.json"

# YouTube category IDs — full list: https://gist.github.com/dgp/1b24bf2961521bd75d6c
CATEGORY_EDUCATION = "27"


def get_youtube_client():
    """Return an authenticated YouTube Data API client."""
    creds = None
    if TOKEN_CACHE.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_CACHE), SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not CLIENT_SECRETS.exists():
                sys.exit(
                    f"ERROR: {CLIENT_SECRETS} not found.\n"
                    "Create OAuth credentials at https://console.cloud.google.com/ "
                    "and save the downloaded JSON to that path."
                )
            flow = InstalledAppFlow.from_client_secrets_file(
                str(CLIENT_SECRETS), SCOPES
            )
            creds = flow.run_local_server(port=0)
        TOKEN_CACHE.write_text(creds.to_json())
    return build("youtube", "v3", credentials=creds)


def load_metadata(args):
    """Build the upload body, merging YAML metadata + CLI overrides."""
    meta = {}
    if args.metadata:
        path = pathlib.Path(args.metadata)
        if not path.exists():
            sys.exit(f"ERROR: metadata file not found: {path}")
        text = path.read_text()
        if path.suffix in (".yaml", ".yml"):
            if yaml is None:
                sys.exit("ERROR: PyYAML not installed; use --metadata *.json instead")
            meta = yaml.safe_load(text) or {}
        else:
            meta = json.loads(text)

    # CLI flags override file values
    if args.title:       meta["title"] = args.title
    if args.description: meta["description"] = args.description
    if args.tags:        meta["tags"] = [t.strip() for t in args.tags.split(",") if t.strip()]
    if args.privacy:     meta["privacy"] = args.privacy
    if args.category:    meta["category"] = args.category

    # Required
    if not meta.get("title"):
        sys.exit("ERROR: title is required (--title or in metadata file)")

    return meta


def build_request_body(meta):
    return {
        "snippet": {
            "title": meta["title"][:100],  # YouTube limit
            "description": meta.get("description", ""),
            "tags": meta.get("tags", []),
            "categoryId": str(meta.get("category", CATEGORY_EDUCATION)),
        },
        "status": {
            "privacyStatus": meta.get("privacy", "unlisted"),
            "selfDeclaredMadeForKids": False,
        },
    }


def upload(youtube, video_path, body):
    media = MediaFileUpload(
        video_path, chunksize=8 * 1024 * 1024, resumable=True, mimetype="video/*"
    )
    request = youtube.videos().insert(
        part="snippet,status", body=body, media_body=media
    )
    response = None
    print(f"Uploading {video_path} ...")
    while response is None:
        try:
            status, response = request.next_chunk()
        except HttpError as e:
            sys.exit(f"YouTube API error: {e}")
        if status:
            print(f"  {int(status.progress() * 100)}%")
    print(f"Done. https://www.youtube.com/watch?v={response['id']}")
    return response


def main():
    parser = argparse.ArgumentParser(
        description="Upload a video to the DSE YouTube channel",
    )
    parser.add_argument("--video", required=True, help="Path to the MP4 to upload")
    parser.add_argument("--metadata", help="YAML or JSON file with title/description/tags/etc.")
    parser.add_argument("--title")
    parser.add_argument("--description")
    parser.add_argument("--tags", help="Comma-separated")
    parser.add_argument("--privacy", choices=["public", "unlisted", "private"])
    parser.add_argument("--category", help="YouTube category ID, default 27 (Education)")
    args = parser.parse_args()

    if not pathlib.Path(args.video).exists():
        sys.exit(f"ERROR: video not found: {args.video}")

    meta = load_metadata(args)
    body = build_request_body(meta)
    print("Metadata:")
    print(json.dumps(body, indent=2))
    print()

    youtube = get_youtube_client()
    upload(youtube, args.video, body)


if __name__ == "__main__":
    main()
