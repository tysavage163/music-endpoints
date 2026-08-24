import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

router.get("/", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Music API Tester</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #0f0f13;
      color: #e2e8f0;
      min-height: 100vh;
      padding: 24px 16px;
    }
    h1 { font-size: 1.5rem; font-weight: 700; color: #fff; margin-bottom: 4px; }
    .subtitle { color: #64748b; font-size: 0.85rem; margin-bottom: 28px; }
    .card {
      background: #1a1a24;
      border: 1px solid #2a2a38;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .card h2 { font-size: 1rem; font-weight: 600; color: #94a3b8; margin-bottom: 14px; letter-spacing: 0.05em; text-transform: uppercase; font-size: 0.75rem; }
    .row { display: flex; gap: 8px; }
    input[type="text"] {
      flex: 1;
      background: #0f0f13;
      border: 1px solid #2a2a38;
      border-radius: 8px;
      color: #e2e8f0;
      font-size: 0.9rem;
      padding: 10px 14px;
      outline: none;
      transition: border-color 0.15s;
    }
    input[type="text"]:focus { border-color: #6366f1; }
    button {
      background: #6366f1;
      border: none;
      border-radius: 8px;
      color: #fff;
      cursor: pointer;
      font-size: 0.9rem;
      font-weight: 600;
      padding: 10px 18px;
      transition: background 0.15s, opacity 0.15s;
      white-space: nowrap;
    }
    button:hover { background: #4f52cc; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .results { margin-top: 16px; }
    .track {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.12s;
      border: 1px solid transparent;
    }
    .track:hover { background: #23233a; border-color: #2a2a50; }
    .track img { width: 48px; height: 36px; border-radius: 4px; object-fit: cover; flex-shrink: 0; background: #2a2a38; }
    .track-info { flex: 1; min-width: 0; }
    .track-title { font-size: 0.88rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .track-meta { font-size: 0.75rem; color: #64748b; margin-top: 2px; }
    .track-btn {
      background: #22c55e;
      font-size: 0.78rem;
      padding: 6px 12px;
      border-radius: 6px;
      flex-shrink: 0;
    }
    .track-btn:hover { background: #16a34a; }
    .track-btn.loading { background: #d97706; }
    .status-bar {
      background: #0f172a;
      border: 1px solid #1e3a5f;
      border-radius: 8px;
      padding: 12px 14px;
      font-size: 0.82rem;
      color: #7dd3fc;
      margin-top: 14px;
      min-height: 42px;
      word-break: break-all;
      display: none;
    }
    .status-bar.visible { display: block; }
    .status-bar.error { border-color: #7f1d1d; color: #fca5a5; background: #1a0a0a; }
    .status-bar.success { border-color: #14532d; color: #86efac; background: #0a1a0f; }
    .download-row {
      display: flex;
      gap: 8px;
      margin-top: 10px;
      flex-wrap: wrap;
    }
    .dl-btn {
      background: #1d4ed8;
      font-size: 0.8rem;
      padding: 7px 14px;
      border-radius: 6px;
      text-decoration: none;
      color: #fff;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .dl-btn:hover { background: #1e40af; }
    .dl-btn.proxy { background: #7c3aed; }
    .dl-btn.proxy:hover { background: #6d28d9; }
    .audio-player { width: 100%; margin-top: 10px; border-radius: 8px; }
    .spinner {
      display: inline-block;
      width: 12px; height: 12px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      vertical-align: middle;
      margin-right: 4px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .tag { display: inline-block; background: #1e293b; border-radius: 4px; padding: 2px 6px; font-size: 0.7rem; color: #94a3b8; margin-right: 4px; }
    .no-results { color: #64748b; font-size: 0.85rem; padding: 12px 0; text-align: center; }
    hr { border: none; border-top: 1px solid #2a2a38; margin: 16px 0; }
    .endpoints { display: grid; gap: 6px; }
    .endpoint { font-size: 0.78rem; color: #94a3b8; font-family: monospace; background: #0f0f13; border-radius: 6px; padding: 8px 12px; }
    .endpoint span { color: #22d3ee; }
  </style>
</head>
<body>
  <h1>🎵 Music API</h1>
  <p class="subtitle">Test your music search &amp; download endpoints live</p>

  <!-- Search -->
  <div class="card">
    <h2>1 · Search</h2>
    <div class="row">
      <input type="text" id="searchInput" placeholder="e.g. NF HOME, Eminem Lose Yourself…" value="NF HOME" />
      <button id="searchBtn" onclick="doSearch()">Search</button>
    </div>
    <div id="searchResults" class="results"></div>
  </div>

  <!-- Download result -->
  <div class="card" id="downloadCard" style="display:none">
    <h2>2 · Download</h2>
    <div id="downloadStatus" class="status-bar visible"></div>
    <div id="downloadActions"></div>
  </div>

  <!-- API reference -->
  <div class="card">
    <h2>Endpoints</h2>
    <div class="endpoints">
      <div class="endpoint"><span>GET</span> /api/music/search?q=&lt;query&gt;</div>
      <div class="endpoint"><span>GET</span> /api/music/download?id=&lt;ytId&gt; &nbsp;<em style="color:#64748b">(blocking, ~5-30s)</em></div>
      <div class="endpoint"><span>GET</span> /api/music/init?id=&lt;ytId&gt; &nbsp;<em style="color:#64748b">(returns uuid)</em></div>
      <div class="endpoint"><span>GET</span> /api/music/status?uuid=&lt;uuid&gt;</div>
      <div class="endpoint"><span>GET</span> /api/music/proxy?url=&lt;encodedURL&gt; &nbsp;<em style="color:#64748b">(streams MP3)</em></div>
      <div class="endpoint"><span>GET</span> /api/music/auth &nbsp;<em style="color:#64748b">(returns key + convertURL)</em></div>
      <div class="endpoint"><span>GET</span> /api/music/convert?convertURL=&lt;url&gt;&amp;id=&lt;ytId&gt;&amp;format=&lt;128|320&gt;</div>
    </div>
  </div>

  <script>
    const BASE = '/api';

    async function doSearch() {
      const q = document.getElementById('searchInput').value.trim();
      if (!q) return;
      const btn = document.getElementById('searchBtn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>Searching…';
      document.getElementById('searchResults').innerHTML = '';

      try {
        const res = await fetch(BASE + '/music/search?q=' + encodeURIComponent(q));
        const data = await res.json();
        renderResults(data);
      } catch (e) {
        document.getElementById('searchResults').innerHTML =
          '<p class="no-results">Search failed: ' + e.message + '</p>';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Search';
      }
    }

    function renderResults(data) {
      const el = document.getElementById('searchResults');
      if (!data.youtube?.length && !data.soundcloud?.length) {
        el.innerHTML = '<p class="no-results">No results found.</p>';
        return;
      }
      let html = '';
      (data.youtube || []).forEach(t => {
        html += \`
          <div class="track" onclick="doDownload('\${t.id}', this)">
            <img src="\${t.thumbnail}" alt="" loading="lazy" onerror="this.style.display='none'" />
            <div class="track-info">
              <div class="track-title">\${esc(t.title)}</div>
              <div class="track-meta"><span class="tag">YouTube</span>\${t.duration}</div>
            </div>
            <button class="track-btn" onclick="event.stopPropagation();doDownload('\${t.id}', this.closest('.track'))">Download</button>
          </div>\`;
      });
      el.innerHTML = html;
    }

    async function doDownload(videoId, trackEl) {
      const card = document.getElementById('downloadCard');
      const statusEl = document.getElementById('downloadStatus');
      const actionsEl = document.getElementById('downloadActions');
      card.style.display = 'block';
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      statusEl.className = 'status-bar visible';
      statusEl.innerHTML = '<span class="spinner"></span> Starting conversion for video ID: <strong>' + videoId + '</strong>…';
      actionsEl.innerHTML = '';

      // Mark the clicked track
      document.querySelectorAll('.track').forEach(t => t.style.background = '');
      if (trackEl) trackEl.style.background = '#1e1e36';

      try {
        const res = await fetch(BASE + '/music/download?id=' + encodeURIComponent(videoId));
        const data = await res.json();

        if (data.error !== 0) {
          statusEl.className = 'status-bar visible error';
          statusEl.textContent = '✗ ' + (data.message || 'Download failed');
          return;
        }

        statusEl.className = 'status-bar visible success';
        statusEl.textContent = '✓ Ready: ' + data.title;

        const proxyURL = data.proxyURL;
        const directURL = data.downloadURL;

        actionsEl.innerHTML = \`
          <div class="download-row">
            <a href="\${proxyURL}" download class="dl-btn proxy">⬇ Download via Proxy</a>
            <a href="\${directURL}" target="_blank" class="dl-btn">↗ Direct Link</a>
          </div>
          <audio class="audio-player" controls>
            <source src="\${proxyURL}" type="audio/mpeg" />
          </audio>
          <hr />
          <div style="font-size:0.75rem;color:#64748b;margin-top:4px">
            <strong style="color:#94a3b8">proxyURL:</strong><br/>
            <code style="word-break:break-all;color:#7dd3fc">\${proxyURL}</code><br/><br/>
            <strong style="color:#94a3b8">downloadURL:</strong><br/>
            <code style="word-break:break-all;color:#7dd3fc">\${directURL}</code>
          </div>\`;
      } catch (e) {
        statusEl.className = 'status-bar visible error';
        statusEl.textContent = '✗ Error: ' + e.message;
      }
    }

    function esc(str) {
      return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    document.getElementById('searchInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') doSearch();
    });
  </script>
</body>
</html>`);
});

export default router;
