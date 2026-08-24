import { useState, useRef } from "react";

const apiOrigin = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
const API = apiOrigin ? `${apiOrigin}/api` : "/api";

type Track = {
  id: string;
  source: "youtube" | "ytmusic" | "ytmp3";
  title: string;
  duration: string;
  thumbnail: string;
  artist?: string;
  album?: string;
  // Proxy URLs returned by the API
  mp3URL?: string;
  mp4URL?: string;
  webmURL?: string;
};

type Source = "mp3juice" | "ytmusic" | "ytmp3";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard?.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
      className="text-slate-500 hover:text-slate-300 transition-colors text-[10px] px-1.5 py-0.5 rounded border border-slate-700 hover:border-slate-500 flex-shrink-0"
      title="Copy URL"
    >
      {copied ? "✓" : "copy"}
    </button>
  );
}

type ResponseState = "idle" | "loading" | "success" | "error";

function ResponsePanel({
  state,
  message,
  endpoint,
  payload,
}: {
  state: ResponseState;
  message: string;
  endpoint: string;
  payload: unknown;
}) {
  const [open, setOpen] = useState(true);
  const responseText = payload ? JSON.stringify(payload, null, 2) : "Waiting for a request…";
  const tone = state === "error"
    ? "border-red-500/30 bg-red-950/20 text-red-200"
    : state === "success"
    ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-200"
    : state === "loading"
    ? "border-amber-500/30 bg-amber-950/20 text-amber-200"
    : "border-slate-700 bg-slate-950/40 text-slate-400";

  return (
    <section className="rounded-2xl border border-slate-800 bg-[#11111c] overflow-hidden">
      <div className={`flex items-center gap-3 px-4 py-3 border-b ${tone}`}>
        <span className={`w-2 h-2 rounded-full ${state === "loading" ? "bg-amber-400 animate-pulse" : state === "error" ? "bg-red-400" : state === "success" ? "bg-emerald-400" : "bg-slate-500"}`} />
        <p className="text-xs font-medium flex-1 truncate">{message}</p>
        {endpoint && <code className="hidden md:block max-w-[42%] truncate text-[10px] text-slate-500">{endpoint}</code>}
        <button onClick={() => setOpen((value) => !value)} className="text-[10px] text-slate-400 hover:text-white">
          {open ? "Hide response" : "View response"}
        </button>
      </div>
      {open && (
        <div className="p-3 space-y-2">
          {endpoint && (
            <div className="flex items-center gap-2 rounded-lg bg-black/30 border border-slate-800 px-3 py-2">
              <span className="text-[10px] uppercase tracking-wider text-cyan-400">Request</span>
              <code className="text-[11px] text-slate-400 truncate flex-1">{endpoint}</code>
              <CopyButton text={endpoint} />
            </div>
          )}
          <div className="relative">
            <pre className="max-h-48 overflow-auto rounded-lg bg-black/30 border border-slate-800 p-3 text-[10px] leading-relaxed text-slate-400">{responseText}</pre>
            {payload !== null && payload !== undefined && <div className="absolute right-2 top-2"><CopyButton text={responseText} /></div>}
          </div>
        </div>
      )}
    </section>
  );
}

export default function App() {
  const [source, setSource] = useState<Source>("mp3juice");
  const [query, setQuery] = useState("NF HOME");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Track[]>([]);
  const [searched, setSearched] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Current media player
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const [mediaFormat, setMediaFormat] = useState<"mp3" | "mp4" | null>(null);
  const [loading, setLoading] = useState<{ id: string; fmt: string } | null>(null);
  const [responseState, setResponseState] = useState<ResponseState>("idle");
  const [responseMessage, setResponseMessage] = useState("Ready for a request");
  const [responseEndpoint, setResponseEndpoint] = useState("");
  const [responsePayload, setResponsePayload] = useState<unknown>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Build proxy URL client-side (for backward compat when API doesn't return them)
  function fallbackProxyURL(track: Track, fmt: "mp3" | "mp4" | "webm") {
    return `${API}/music/proxy?id=${encodeURIComponent(track.id)}&title=${encodeURIComponent(track.title)}&format=${fmt}`;
  }

  function getMP3URL(track: Track) {
    return track.mp3URL ?? fallbackProxyURL(track, "mp3");
  }
  function getMP4URL(track: Track) {
    return track.mp4URL ?? fallbackProxyURL(track, "mp4");
  }
  function getWebmURL(track: Track) {
    return track.webmURL ?? fallbackProxyURL(track, "webm");
  }

  async function doSearch(src: Source, q: string) {
    if (!q.trim()) return;
    setSearching(true);
    setResults([]);
    setSearched(false);
    setResponseState("loading");
    setResponseMessage(`Searching ${src === "mp3juice" ? "MP3Juice" : src === "ytmusic" ? "YouTube Music" : "YTMP3"}…`);
    const endpoint = src === "mp3juice" ? `${API}/music/search?q=${encodeURIComponent(q)}` : `${API}/music/${src === "ytmp3" ? "ytmp3-search" : "ytmusic-search"}?q=${encodeURIComponent(q)}`;
    setResponseEndpoint(endpoint);
    try {
      if (src === "mp3juice") {
        const res = await fetch(endpoint);
        const data = await res.json();
        setResponsePayload(data);
        if (!res.ok) throw new Error(data.message || "Search failed");
        setResults(data.youtube ?? []);
      } else {
        const res = await fetch(endpoint);
        const data = await res.json();
        setResponsePayload(data);
        if (!res.ok) throw new Error(data.message || "Search failed");
        setResults(data.tracks ?? []);
      }
      setResponseState("success");
      setResponseMessage("Response received");
    } catch (error) {
      setResponseState("error");
      setResponseMessage(error instanceof Error ? error.message : "Request failed");
    } finally {
      setSearched(true);
      setSearching(false);
    }
  }

  function search() {
    doSearch(source, query);
  }

  function switchSource(s: Source) {
    if (s === source) return;
    setSource(s);
    setResults([]);
    setSearched(false);
    setExpandedId(null);
    if (searched && query.trim()) doSearch(s, query);
  }

  function selectMedia(track: Track, fmt: "mp3" | "mp4") {
    setLoading({ id: track.id, fmt });
    setSelectedTrack(track);
    setMediaFormat(fmt);
    const url = fmt === "mp3" ? getMP3URL(track) : getMP4URL(track);
    setResponseState("loading");
    setResponseMessage(`Preparing ${fmt.toUpperCase()} response…`);
    setResponseEndpoint(url);
    setResponsePayload({ id: track.id, title: track.title, format: fmt, url });
    setTimeout(() => {
      setLoading(null);
      setResponseState("success");
      setResponseMessage(`${fmt.toUpperCase()} response ready`);
    }, 1200);
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  const mediaURL = selectedTrack && mediaFormat
    ? (mediaFormat === "mp3" ? getMP3URL(selectedTrack) : getMP4URL(selectedTrack))
    : null;

  const accentClass = source === "ytmusic"
    ? "bg-red-600 hover:bg-red-500"
    : "bg-violet-600 hover:bg-violet-500";

  return (
    <div className="min-h-screen bg-[#0a0a10] text-slate-200 font-sans">
      {/* Header */}
      <div className="bg-[#0f0f19]/95 border-b border-slate-800/80 px-5 py-3 flex items-center gap-3 sticky top-0 z-10 backdrop-blur">
        <div className="text-2xl">🎵</div>
        <div>
          <h1 className="text-sm font-bold text-white leading-none">Music API Console</h1>
          <p className="text-xs text-slate-500 mt-0.5">Search → play with MP3/MP4 · click 🔗 URLs on any track for proxy links</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">

        {/* Source switcher */}
        <div className="flex gap-1 bg-[#13131e] border border-[#1e1e30] rounded-xl p-1 w-fit">
          <button
            onClick={() => switchSource("mp3juice")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              source === "mp3juice"
                ? "bg-violet-600 text-white shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>🎧</span> MP3Juice
          </button>
          <button
            onClick={() => switchSource("ytmusic")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              source === "ytmusic"
                ? "bg-red-600 text-white shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>▶</span> YouTube Music
          </button>
          <button
            onClick={() => switchSource("ytmp3")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              source === "ytmp3"
                ? "bg-emerald-600 text-white shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>↓</span> YTMP3
          </button>
        </div>

        {/* Search bar */}
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Search for a song…"
            className="flex-1 bg-[#1a1a28] border border-[#2a2a40] rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 outline-none focus:border-violet-500 transition-colors"
          />
          <button
            onClick={search}
            disabled={searching}
            className={`text-white font-semibold px-5 py-3 rounded-xl text-sm transition-colors disabled:opacity-50 ${accentClass}`}
          >
            {searching ? "…" : "Search"}
          </button>
        </div>

        <ResponsePanel
          state={responseState}
          message={responseMessage}
          endpoint={responseEndpoint}
          payload={responsePayload}
        />

        <section className="rounded-2xl border border-slate-800 bg-[#11111c] p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold text-white">Integration kit</span>
            <span className="text-[10px] text-slate-500">Copy a ready-to-use request</span>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="flex items-center gap-2 bg-black/25 border border-slate-800 rounded-lg px-3 py-2">
              <code className="text-[10px] text-cyan-300 flex-1 truncate">GET /api/music/search?q=NF%20HOME</code>
              <CopyButton text={`${window.location.origin}${API}/music/search?q=NF%20HOME`} />
            </div>
            <div className="flex items-center gap-2 bg-black/25 border border-slate-800 rounded-lg px-3 py-2">
              <code className="text-[10px] text-cyan-300 flex-1 truncate">GET /api/music/ytmp3-search?q=NF%20HOME</code>
              <CopyButton text={`${window.location.origin}${API}/music/ytmp3-search?q=NF%20HOME`} />
            </div>
          </div>
        </section>

        {/* Media player */}
        {mediaURL && selectedTrack && (
          <div className="bg-[#1a1a28] border border-[#2a2a40] rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-3">
              <img
                src={selectedTrack.thumbnail}
                alt=""
                className="w-12 h-12 rounded-lg object-cover bg-[#2a2a40]"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate">{selectedTrack.title}</p>
                {selectedTrack.artist && (
                  <p className="text-xs text-slate-400 truncate">{selectedTrack.artist}</p>
                )}
                <p className="text-xs text-slate-500">
                  {mediaFormat === "mp3" ? "🎵 MP3 · 192kbps" : "🎬 MP4 · 360p"} — streaming via yt-dlp
                </p>
              </div>
            </div>

            {mediaFormat === "mp3" && (
              <audio key={mediaURL} ref={audioRef} src={mediaURL} controls autoPlay
                className="w-full h-10 rounded-lg" onError={() => {}} />
            )}
            {mediaFormat === "mp4" && (
              <video key={mediaURL} ref={videoRef} src={mediaURL} controls autoPlay
                className="w-full rounded-lg max-h-64 bg-black" onError={() => {}} />
            )}

            <div className="flex gap-2 flex-wrap">
              <a href={mediaURL} download
                className={`text-xs font-semibold px-4 py-2 rounded-lg transition-colors text-white ${accentClass}`}>
                ⬇ Download {mediaFormat?.toUpperCase()}
              </a>
              {mediaFormat === "mp3" && source !== "ytmp3" && (
                <button onClick={() => selectMedia(selectedTrack, "mp4")}
                  className="bg-blue-600/20 text-blue-300 border border-blue-600/30 hover:bg-blue-600/40 text-xs font-semibold px-4 py-2 rounded-lg transition-colors">
                  Switch to MP4
                </button>
              )}
              {mediaFormat === "mp4" && source !== "ytmp3" && (
                <button onClick={() => selectMedia(selectedTrack, "mp3")}
                  className="bg-violet-600/20 text-violet-300 border border-violet-600/30 hover:bg-violet-600/40 text-xs font-semibold px-4 py-2 rounded-lg transition-colors">
                  Switch to MP3
                </button>
              )}
              {source !== "ytmp3" && <a href={getWebmURL(selectedTrack)} download
                className="bg-slate-700/40 text-slate-400 border border-slate-600/30 hover:bg-slate-700/70 text-xs font-semibold px-4 py-2 rounded-lg transition-colors">
                ⬇ WebM (fast)
              </a>}
            </div>
          </div>
        )}

        {/* Track list */}
        {searched && results.length === 0 && !searching && (
          <p className="text-slate-500 text-sm text-center py-8">No results found.</p>
        )}

        {results.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-slate-500 mb-2">
              {results.length} results from{" "}
              <span className={source === "ytmusic" ? "text-red-400" : source === "ytmp3" ? "text-emerald-400" : "text-violet-400"}>
                {source === "ytmusic" ? "YouTube Music" : source === "ytmp3" ? "YTMP3" : "MP3Juice"}
              </span>
            </p>

            {results.map((track) => {
              const isSelected = selectedTrack?.id === track.id;
              const isExpanded = expandedId === track.id;
              const isLoadingMp3 = loading?.id === track.id && loading.fmt === "mp3";
              const isLoadingMp4 = loading?.id === track.id && loading.fmt === "mp4";
              const mp3URL = getMP3URL(track);
              const mp4URL = getMP4URL(track);
              const webmURL = getWebmURL(track);

              return (
                <div
                  key={track.id}
                  className={`rounded-xl border transition-all ${
                    isSelected
                      ? "bg-[#1e1e32] border-[#3a3a5a]"
                      : "bg-[#1a1a28] border-[#1e1e30]"
                  }`}
                >
                  {/* Main row */}
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    {/* Thumbnail */}
                    <img
                      src={track.thumbnail}
                      alt=""
                      className="w-14 h-10 rounded-md object-cover flex-shrink-0 bg-[#2a2a40]"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />

                    {/* Track info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{track.title}</p>
                      {track.artist ? (
                        <p className="text-xs text-slate-500 mt-0.5 truncate">
                          {track.artist}
                          {track.album ? ` · ${track.album}` : ""}
                          {track.duration ? ` · ${track.duration}` : ""}
                        </p>
                      ) : (
                        <p className="text-xs text-slate-500 mt-0.5">{track.duration}</p>
                      )}
                    </div>

                    {/* Buttons */}
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => selectMedia(track, "mp3")}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                          isLoadingMp3
                            ? "bg-amber-600 text-white"
                            : isSelected && mediaFormat === "mp3"
                            ? "bg-violet-600/30 text-violet-200 border border-violet-500"
                            : "bg-violet-600/20 text-violet-300 border border-violet-600/30 hover:bg-violet-600/40"
                        }`}
                      >
                        {isLoadingMp3 ? "⏳" : isSelected && mediaFormat === "mp3" ? "▶ MP3" : "MP3"}
                      </button>
                      {source !== "ytmp3" && <button
                        onClick={() => selectMedia(track, "mp4")}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                          isLoadingMp4
                            ? "bg-amber-600 text-white"
                            : isSelected && mediaFormat === "mp4"
                            ? "bg-blue-600/30 text-blue-200 border border-blue-400"
                            : "bg-blue-600/20 text-blue-300 border border-blue-600/30 hover:bg-blue-600/40"
                        }`}
                      >
                        {isLoadingMp4 ? "⏳" : isSelected && mediaFormat === "mp4" ? "▶ MP4" : "MP4"}
                      </button>}
                      <button
                        onClick={() => toggleExpand(track.id)}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                          isExpanded
                            ? "bg-emerald-700 text-white border border-emerald-500"
                            : "bg-emerald-600/20 text-emerald-400 border border-emerald-600/30 hover:bg-emerald-600/40"
                        }`}
                        title="Show proxy & download URLs"
                      >
                        🔗 URLs
                      </button>
                    </div>
                  </div>

                  {/* Expanded download URLs */}
                  {isExpanded && (
                    <div className="px-3 pb-3 border-t border-[#252535] mt-0 pt-3 space-y-2">
                      <p className="text-[10px] uppercase tracking-wider text-slate-600 font-semibold mb-1">
                        Proxy / Download URLs
                      </p>

                      {/* MP3 */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] w-10 text-violet-400 font-semibold flex-shrink-0">MP3</span>
                          <code className="text-[10px] text-slate-400 truncate flex-1 bg-[#0a0a14] px-2 py-1 rounded font-mono min-w-0">
                            {mp3URL}
                          </code>
                          <CopyButton text={mp3URL} />
                          <a href={mp3URL} download
                            className="text-violet-400 hover:text-violet-200 text-[10px] px-1.5 py-0.5 rounded border border-violet-700 hover:border-violet-400 transition-colors flex-shrink-0">
                            ⬇
                          </a>
                        </div>
                      </div>

                      {/* MP4 */}
                      {source !== "ytmp3" && <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] w-10 text-blue-400 font-semibold flex-shrink-0">MP4</span>
                          <code className="text-[10px] text-slate-400 truncate flex-1 bg-[#0a0a14] px-2 py-1 rounded font-mono min-w-0">
                            {mp4URL}
                          </code>
                          <CopyButton text={mp4URL} />
                          <a href={mp4URL} download
                            className="text-blue-400 hover:text-blue-200 text-[10px] px-1.5 py-0.5 rounded border border-blue-700 hover:border-blue-400 transition-colors flex-shrink-0">
                            ⬇
                          </a>
                        </div>
                      </div>}

                      {/* WebM */}
                      {source !== "ytmp3" && <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] w-10 text-slate-500 font-semibold flex-shrink-0">WebM</span>
                          <code className="text-[10px] text-slate-400 truncate flex-1 bg-[#0a0a14] px-2 py-1 rounded font-mono min-w-0">
                            {webmURL}
                          </code>
                          <CopyButton text={webmURL} />
                          <a href={webmURL} download
                            className="text-slate-500 hover:text-slate-200 text-[10px] px-1.5 py-0.5 rounded border border-slate-700 hover:border-slate-400 transition-colors flex-shrink-0">
                            ⬇
                          </a>
                        </div>
                      </div>}

                      <p className="text-[10px] text-slate-600 pt-1">
                        These are permanent proxy URLs — they stream and convert directly from YouTube on demand.
                        Right-click → Save link as, or paste into any downloader.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
