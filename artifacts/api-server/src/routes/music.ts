import { Router, type IRouter, type Request, type Response } from "express";
import axios from "axios";
import ffmpegStatic from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import { execFileSync, spawn } from "child_process";
import { existsSync } from "fs";
import { chmod, mkdir, rm, writeFile } from "fs/promises";
import { createDecipheriv, randomUUID } from "crypto";
import { tmpdir } from "os";
import path from "path";

const router: IRouter = Router();

/* ── Tool paths ───────────────────────────────────────────── */

// Locate ffmpeg binary on both Unix and Windows.
let FFMPEG_PATH = ffmpegStatic || "ffmpeg";
try {
  const finder = process.platform === "win32" ? "where.exe" : "which";
  if (!ffmpegStatic) {
    FFMPEG_PATH = execFileSync(finder, ["ffmpeg"], { encoding: "utf8" })
      .split(/\r?\n/)[0]
      .trim();
  }
  ffmpeg.setFfmpegPath(FFMPEG_PATH);
} catch {
  // fall back to PATH
}

// yt-dlp binary — use the native executable for the current platform.
const isWindows = process.platform === "win32";
const YTDLP_BIN = path.resolve(
  process.cwd(),
  "bin",
  isWindows ? "yt-dlp.exe" : "yt-dlp",
);
const YTDLP_URL =
  isWindows
    ? "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
    : "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux";

async function ensureYtDlp(): Promise<string> {
  if (existsSync(YTDLP_BIN)) return YTDLP_BIN;
  // Fall back to /tmp if already cached there
  if (!isWindows && existsSync("/tmp/yt-dlp-linux")) return "/tmp/yt-dlp-linux";
  // Download
  console.log("[music] Downloading yt-dlp…");
  const dir = path.dirname(YTDLP_BIN);
  await mkdir(dir, { recursive: true });
  const download = await axios.get<ArrayBuffer>(YTDLP_URL, {
    responseType: "arraybuffer",
    timeout: 120000,
  });
  await writeFile(YTDLP_BIN, Buffer.from(download.data));
  if (!isWindows) await chmod(YTDLP_BIN, 0o755);
  console.log("[music] yt-dlp ready at", YTDLP_BIN);
  return YTDLP_BIN;
}

// Kick off the download in the background so first request is fast
let ytdlpPathPromise: Promise<string> = ensureYtDlp();

/* ── URL helpers ──────────────────────────────────────────── */

function baseURL(req: Request): string {
  const host =
    (req.headers["x-forwarded-host"] as string) ||
    (req.headers["host"] as string) ||
    "localhost";
  const proto =
    (req.headers["x-forwarded-proto"] as string) ||
    (req.secure ? "https" : "http");
  return `${proto}://${host}`;
}

function buildProxyURLs(
  req: Request,
  id: string,
  title: string,
  provider: "ytdlp" | "ytmp3" = "ytdlp",
): { mp3URL: string; mp4URL: string; webmURL: string } {
  const base = `${baseURL(req)}/api/music/proxy?id=${encodeURIComponent(id)}&title=${encodeURIComponent(title)}&provider=${provider}`;
  return {
    mp3URL: `${base}&format=mp3`,
    mp4URL: `${base}&format=mp4`,
    webmURL: `${base}&format=webm`,
  };
}

/* ── YTMP3 provider ────────────────────────────────────────── */

const YTMP3_KEY = Buffer.from("C5D58EF67A7584E4A29F6C35BBC4EB12", "hex");
const YTMP3_CDN_API = "https://media.savetube.vip/api/random-cdn";

async function ytmp3DownloadURL(youtubeURL: string): Promise<string> {
  const cdnResponse = await axios.get<{ cdn: string }>(YTMP3_CDN_API, {
    timeout: 15000,
  });
  const cdn = cdnResponse.data?.cdn;
  if (!cdn) throw new Error("YTMP3 did not return a CDN");

  const infoResponse = await axios.post<{ status: boolean; data: string; message?: string }>(
    `https://${cdn}/v2/info`,
    { url: youtubeURL },
    { headers: { "Content-Type": "application/json" }, timeout: 30000 },
  );
  if (!infoResponse.data?.status || !infoResponse.data.data) {
    throw new Error(infoResponse.data?.message || "YTMP3 metadata lookup failed");
  }

  const encrypted = Buffer.from(infoResponse.data.data, "base64");
  const iv = encrypted.subarray(0, 16);
  const decipher = createDecipheriv("aes-128-cbc", YTMP3_KEY, iv);
  const info = JSON.parse(
    Buffer.concat([decipher.update(encrypted.subarray(16)), decipher.final()]).toString("utf8"),
  ) as { key?: string };
  if (!info.key) throw new Error("YTMP3 metadata did not contain a conversion key");

  const downloadResponse = await axios.post<{ status: boolean; data?: { downloadUrl?: string }; message?: string }>(
    `https://${cdn}/download`,
    { downloadType: "audio", quality: "128", key: info.key },
    { headers: { "Content-Type": "application/json" }, timeout: 30000 },
  );
  const downloadURL = downloadResponse.data?.data?.downloadUrl;
  if (!downloadResponse.data?.status || !downloadURL) {
    throw new Error(downloadResponse.data?.message || "YTMP3 did not return a download URL");
  }
  return downloadURL;
}

/* ── Static headers ────────────────────────────────────────── */

const MP3JUICE_BASE = "https://mp3juice.sc";

const SEARCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Referer: MP3JUICE_BASE + "/",
  Origin: MP3JUICE_BASE,
};

const YTMUSIC_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Content-Type": "application/json",
  Origin: "https://music.youtube.com",
  Referer: "https://music.youtube.com/",
};

/* ── YouTube Music InnerTube search ──────────────────────── */

type YTMusicTrack = {
  id: string;
  source: "ytmusic";
  title: string;
  artist: string;
  album: string;
  duration: string;
  thumbnail: string;
  youtubeURL: string;
};

async function ytMusicSearch(query: string): Promise<YTMusicTrack[]> {
  const body = {
    context: {
      client: {
        clientName: "WEB_REMIX",
        clientVersion: "1.20240101.01.00",
        hl: "en",
        gl: "US",
      },
    },
    query,
    params: "EgWKAQIIAWoKEAMQBBAJEAoQBQ==", // Songs filter
  };

  const resp = await axios.post(
    "https://music.youtube.com/youtubei/v1/search?prettyPrint=false",
    body,
    { headers: YTMUSIC_HEADERS, timeout: 15000 }
  );

  const tracks: YTMusicTrack[] = [];

  try {
    const tabs =
      resp.data?.contents?.tabbedSearchResultsRenderer?.tabs ?? [];
    const sectionList =
      tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents ?? [];

    for (const section of sectionList) {
      const items = section?.musicShelfRenderer?.contents ?? [];
      for (const item of items) {
        const r = item?.musicResponsiveListItemRenderer;
        if (!r) continue;

        const videoId =
          r?.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer
            ?.text?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId;
        if (!videoId) continue;

        const title =
          r?.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer
            ?.text?.runs?.[0]?.text ?? "";

        const col2Runs: Array<{ text: string }> =
          r?.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer
            ?.text?.runs ?? [];
        const parts = col2Runs
          .map((x: { text: string }) => x.text)
          .filter((t: string) => t !== " • ");
        const artist = parts[0] ?? "";
        const album = parts.length >= 3 ? parts[1] : "";
        const duration = parts[parts.length - 1] ?? "";

        const thumbs =
          r?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ?? [];
        const rawThumb: string =
          (thumbs[thumbs.length - 1]?.url as string) ?? "";
        const thumbnail = rawThumb.replace(
          /=w\d+-h\d+.*/,
          "=w120-h120-l90-rj"
        );

        tracks.push({
          id: videoId,
          source: "ytmusic",
          title,
          artist,
          album,
          duration,
          thumbnail,
          youtubeURL: `https://music.youtube.com/watch?v=${videoId}`,
        });
      }
    }
  } catch {
    // return whatever was parsed
  }

  return tracks;
}

/* ── GET /api/music/search ────────────────────────────────── */

router.get("/music/search", async (req: Request, res: Response) => {
  const q = (req.query["q"] as string | undefined)?.trim();
  if (!q) {
    res.status(400).json({ error: 1, message: "Query parameter 'q' is required" });
    return;
  }

  try {
    const encoded = Buffer.from(encodeURIComponent(q)).toString("base64");
    const resp = await axios.get<{
      count: number;
      yt: Array<{ id: string; title: string; duration: string }>;
    }>(`${MP3JUICE_BASE}/api/v1/search`, {
      params: { y: "s", q: encoded, _: Date.now() },
      headers: {
        ...SEARCH_HEADERS,
        Accept: "application/json, */*",
        "X-Requested-With": "XMLHttpRequest",
      },
      timeout: 15000,
    });

    const data = resp.data;
    res.json({
      error: 0,
      query: q,
      total: data.count ?? 0,
      youtube: (data.yt ?? []).map((t) => ({
        id: t.id,
        source: "youtube",
        title: t.title,
        duration: t.duration,
        thumbnail: `https://i.ytimg.com/vi/${t.id}/mqdefault.jpg`,
        youtubeURL: `https://www.youtube.com/watch?v=${t.id}`,
        ...buildProxyURLs(req, t.id, t.title),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    req.log.error({ err }, "Music search failed");
    res.status(502).json({ error: 1, message: `Search failed: ${message}` });
  }
});

/* ── GET /api/music/ytmusic-search ───────────────────────── */

router.get("/music/ytmusic-search", async (req: Request, res: Response) => {
  const q = (req.query["q"] as string | undefined)?.trim();
  if (!q) {
    res.status(400).json({ error: 1, message: "Query parameter 'q' is required" });
    return;
  }

  try {
    const tracks = await ytMusicSearch(q);
    const tracksWithURLs = tracks.map((t) => ({
      ...t,
      ...buildProxyURLs(req, t.id, t.title),
    }));
    res.json({ error: 0, query: q, total: tracksWithURLs.length, tracks: tracksWithURLs });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    req.log.error({ err }, "YouTube Music search failed");
    res.status(502).json({ error: 1, message: `YouTube Music search failed: ${message}` });
  }
});

/* ── GET /api/music/ytmp3-search ───────────────────────────── */

router.get("/music/ytmp3-search", async (req: Request, res: Response) => {
  const q = (req.query["q"] as string | undefined)?.trim();
  if (!q) {
    res.status(400).json({ error: 1, message: "Query parameter 'q' is required" });
    return;
  }

  try {
    // YTMP3 converts YouTube URLs rather than providing a search index.
    // Use YouTube Music for discovery, then route conversion through YTMP3.
    const tracks = await ytMusicSearch(q);
    const tracksWithURLs = tracks.map((t) => ({
      ...t,
      source: "ytmp3" as const,
      ...buildProxyURLs(req, t.id, t.title, "ytmp3"),
    }));
    res.json({ error: 0, query: q, total: tracksWithURLs.length, tracks: tracksWithURLs });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    req.log.error({ err }, "YTMP3 search failed");
    res.status(502).json({ error: 1, message: `YTMP3 search failed: ${message}` });
  }
});

/* ── GET /api/music/proxy ─────────────────────────────────── */
//
// Streams audio (mp3) or video (mp4) directly from YouTube via yt-dlp + ffmpeg.
// No external conversion service — works reliably from any IP.
//
// Query params:
//   id     — YouTube video ID (required)
//   title  — download filename (optional, default: "track")
//   format — "mp3" (default) | "mp4" | "webm"
//
// mp3:  yt-dlp best audio → ffmpeg → 192kbps mp3 (piped to client)
// mp4:  yt-dlp best 360p combined mp4 → direct stream
// webm: yt-dlp best audio → direct webm stream (fastest, no conversion)

router.get("/music/proxy", async (req: Request, res: Response) => {
  const id = (req.query["id"] as string | undefined)?.trim();
  const title = (req.query["title"] as string | undefined)?.trim() || "track";
  const format = (req.query["format"] as string | undefined)?.trim() || "mp3";
  const provider = (req.query["provider"] as string | undefined)?.trim() || "ytdlp";
  const safeTitle =
    title
      .replace(/[^\w\s\-()[\]]/g, "")
      .replace(/\s+/g, " ")
      .trim() || "track";

  if (!id) {
    res.status(400).json({ error: 1, message: "Query parameter 'id' is required" });
    return;
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  const ytUrl = `https://www.youtube.com/watch?v=${id}`;

  if (provider === "ytmp3") {
    if (format !== "mp3") {
      res.status(400).json({ error: 1, message: "YTMP3 provides MP3 only" });
      return;
    }

    try {
      const downloadURL = await ytmp3DownloadURL(ytUrl);
      const upstream = await axios.get<import("stream").Readable>(downloadURL, {
        responseType: "stream",
        timeout: 120000,
        maxRedirects: 5,
      });
      const contentType = upstream.headers["content-type"];
      const contentLength = upstream.headers["content-length"];
      res.setHeader("Content-Type", typeof contentType === "string" ? contentType : "audio/mpeg");
      if (typeof contentLength === "string" || typeof contentLength === "number") {
        res.setHeader("Content-Length", contentLength);
      }
      res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}.mp3"`);
      upstream.data.pipe(res);
      req.on("close", () => upstream.data.destroy());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      req.log.error({ err }, "YTMP3 proxy failed");
      if (!res.headersSent) {
        res.status(502).json({ error: 1, message: `YTMP3 failed: ${message}` });
      } else {
        res.destroy(err instanceof Error ? err : undefined);
      }
    }
    return;
  }

  let ytdlpBin: string;
  try {
    ytdlpBin = await ytdlpPathPromise;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: 1, message: `yt-dlp unavailable: ${message}` });
    return;
  }

  const baseArgs = [
    "--quiet",
    "--no-warnings",
    "--no-playlist",
    "--ffmpeg-location", FFMPEG_PATH,
  ];

  try {
    if (format === "mp3") {
      // Stream raw audio (opus/aac) from yt-dlp, convert to mp3 via ffmpeg
      const ytProc = spawn(ytdlpBin, [
        ...baseArgs,
        "-o", "-",
        "-f", "bestaudio",
        ytUrl,
      ], { stdio: ["ignore", "pipe", "pipe"] });

      let started = false;
      const startResponse = () => {
        if (started) return;
        started = true;
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}.mp3"`);
      };

      ytProc.stderr.on("data", (d: Buffer) => {
        const msg = d.toString().trim();
        if (msg) req.log.warn({ msg }, "yt-dlp stderr");
      });

      const conv = ffmpeg(ytProc.stdout!)
        .audioBitrate(192)
        .format("mp3")
        .on("error", (err) => {
          req.log.error({ err }, "ffmpeg mp3 error");
          ytProc.kill();
          if (!started) {
            res.status(502).json({ error: 1, message: err.message });
          } else {
            res.destroy(err);
          }
        });

      ytProc.on("error", (err) => {
        req.log.error({ err }, "yt-dlp spawn error");
        if (!started) {
          res.status(502).json({ error: 1, message: err.message });
        }
      });

      req.on("close", () => {
        conv.kill("SIGKILL");
        ytProc.kill();
      });

      const mp3Stream = conv.pipe();
      mp3Stream.on("data", startResponse);
      mp3Stream.pipe(res, { end: true });

    } else if (format === "mp4") {
      // YouTube commonly exposes video and audio as separate streams. Let
      // yt-dlp + ffmpeg merge them into a real MP4 before sending it.
      const outputFile = path.join(tmpdir(), `music-${randomUUID()}.mp4`);
      const ytProc = spawn(ytdlpBin, [
        ...baseArgs,
        "--no-part",
        "--merge-output-format", "mp4",
        "-f", "bestvideo[ext=mp4][height<=480]+bestaudio[ext=m4a]/bestvideo[height<=480]+bestaudio/best",
        "-o", outputFile,
        ytUrl,
      ], { stdio: ["ignore", "pipe", "pipe"] });

      ytProc.stderr.on("data", (d: Buffer) => {
        const msg = d.toString().trim();
        if (msg) req.log.warn({ msg }, "yt-dlp stderr");
      });

      ytProc.on("error", (err) => {
        req.log.error({ err }, "yt-dlp spawn error");
        if (!res.headersSent) {
          res.status(502).json({ error: 1, message: err.message });
        }
      });

      ytProc.on("close", (code) => {
        if (code !== 0 || !existsSync(outputFile)) {
          if (!res.headersSent) {
            res.status(502).json({ error: 1, message: `MP4 conversion failed (yt-dlp exited with code ${code})` });
          }
          void rm(outputFile, { force: true });
          return;
        }

        res.setHeader("Content-Type", "video/mp4");
        res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}.mp4"`);
        res.sendFile(outputFile, (err) => {
          void rm(outputFile, { force: true });
          if (err && !res.headersSent) {
            res.status(502).json({ error: 1, message: err.message });
          }
        });
      });

      req.on("close", () => {
        if (!res.writableEnded) ytProc.kill();
      });

    } else {
      // WebM / Opus — fastest, no ffmpeg conversion
      const ytProc = spawn(ytdlpBin, [
        ...baseArgs,
        "-o", "-",
        "-f", "bestaudio",
        ytUrl,
      ], { stdio: ["ignore", "pipe", "pipe"] });

      let started = false;
      ytProc.stdout.once("data", (chunk: Buffer) => {
        started = true;
        res.setHeader("Content-Type", "audio/webm");
        res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}.webm"`);
        res.write(chunk);
        ytProc.stdout.pipe(res);
      });

      ytProc.stderr.on("data", (d: Buffer) => {
        const msg = d.toString().trim();
        if (msg) req.log.warn({ msg }, "yt-dlp stderr");
      });

      ytProc.on("error", (err) => {
        req.log.error({ err }, "yt-dlp spawn error");
        if (!started) {
          res.status(502).json({ error: 1, message: err.message });
        }
      });

      ytProc.on("close", (code) => {
        if (!started && code !== 0 && !res.headersSent) {
          res.status(502).json({ error: 1, message: `yt-dlp exited with code ${code}` });
        }
      });

      req.on("close", () => ytProc.kill());
      ytProc.stdout.pipe(res, { end: true });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    req.log.error({ err }, "Music proxy failed");
    if (!res.headersSent) {
      res.status(502).json({ error: 1, message: `Proxy failed: ${message}` });
    }
  }
});

export default router;
