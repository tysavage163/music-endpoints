---
name: Music downloader architecture
description: How the music-ui/api-server downloads and streams audio/video from YouTube
---

## Core approach (as of 2026-06)

**Proxy route** (`/api/music/proxy`) uses `yt-dlp_linux` binary + `ffmpeg`:
- MP3: `yt-dlp -f bestaudio -o -` piped through `fluent-ffmpeg` → 192kbps mp3 stream
- MP4: `yt-dlp -f best[ext=mp4] -o -` piped directly
- WebM: `yt-dlp -f bestaudio -o -` piped directly (fastest, no conversion)

**yt-dlp binary location**: `artifacts/api-server/bin/yt-dlp` (auto-downloaded on startup if missing). Falls back to `/tmp/yt-dlp-linux` if already cached there. Downloaded from `yt-dlp_linux` GitHub release (standalone, no Python needed).

**ffmpeg**: Available at `/nix/store/.../ffmpeg` via `which ffmpeg`. Has `libmp3lame` for MP3.

## Why not other approaches
- `loader.to` conversion service: starts jobs but progress URL (`lto2.affadaffa.com`) stuck at "Initialising" indefinitely from Replit server IPs (IP blocked)
- `thetacloud.org` / `iotacloud.org`: dead (403/502)
- `@distube/ytdl-core`: fails with "Status code: 403" because YouTube broke cipher decryption parsing
- `yt-dlp` (Python script): no Python 3 in Replit Nix env; use `yt-dlp_linux` standalone instead

## Search sources
- MP3Juice (`mp3juice.sc/api/v1/search`) → works, returns YouTube IDs + metadata
- YouTube Music InnerTube API (`music.youtube.com/youtubei/v1/search`) → works, client: WEB_REMIX, params: `EgWKAQIIAWoKEAMQBBAJEAoQBQ==` for Songs

## Frontend
- Simplified: no polling. Click MP3/MP4 → `<audio src={proxyURL}>` or `<video src={proxyURL}>` streams directly
- Source switcher: MP3Juice | YouTube Music tabs
