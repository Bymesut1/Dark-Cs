// ok.ru Nuvio/Stremio eklentisi - tek dosya, bağımlılık yok (Node 18+)
// Çalıştır: node index.js   -> http://localhost:7000/manifest.json
const http = require("http");
const { Readable } = require("stream");

const PORT = process.env.PORT || 7000;
const PREFIX = "okru:";
const UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
const HEADERS = { "User-Agent": UA, "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8" };

const manifest = {
  id: "ru.ok.search",
  version: "1.0.0",
  name: "ok.ru",
  description: "ok.ru video arama kataloğu ve oynatıcı (süre sınırı yok)",
  resources: ["catalog", "meta", "stream"],
  types: ["movie"],
  idPrefixes: [PREFIX],
  catalogs: [
    {
      type: "movie",
      id: "okru-search",
      name: "ok.ru",
      extra: [{ name: "search", isRequired: true }],
    },
  ],
};

// ---------- yardımcılar ----------
const decode = (s) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

async function getText(url) {
  const r = await fetch(url, { headers: HEADERS, redirect: "follow" });
  if (!r.ok) throw new Error("HTTP " + r.status + " " + url);
  return r.text();
}

function movieToMeta(m) {
  const thumb = (m.thumbnail && (m.thumbnail.big || m.thumbnail.small)) || m.imageUrl;
  const meta = {
    id: PREFIX + m.id,
    type: "movie",
    name: m.title || m.name || "ok.ru video",
    poster: thumb,
    posterShape: "landscape",
    background: thumb,
  };
  if (m.description) meta.description = m.description;
  if (m.duration) meta.runtime = Math.round(m.duration / 60000) + " dk";
  return meta;
}

// ---------- ARAMA ----------
function parseSearch(html) {
  const out = [];
  const seen = new Set();
  const add = (m) => {
    if (!m || !m.id || seen.has(m.id)) return;
    seen.add(m.id);
    out.push(movieToMeta(m));
  };

  // 1) Sayfadaki <video-search-result data-props="..."> JSON'u
  const tag = html.match(/<video-search-result[^>]*?data-props="([^"]+)"/);
  if (tag) {
    try {
      const props = JSON.parse(decode(tag[1]));
      ((props.videos && props.videos.list) || []).forEach((v) => add(v.movie));
      ((props.channels && props.channels.list) || []).forEach((c) =>
        (c.videos || []).forEach((v) => add(v.movie))
      );
    } catch (e) {
      console.error("props parse hatası:", e.message);
    }
  }

  // 2) Yedek: HTML'den düz regex
  if (!out.length) {
    const re = /href="\/video\/(\d{6,})[^"]*"[^>]*data-tsid="video-name">([^<]+)</g;
    let m;
    while ((m = re.exec(html))) add({ id: m[1], title: decode(m[2]) });
  }
  return out;
}

async function search(query) {
  const q = encodeURIComponent(query);
  const urls = [
    `https://ok.ru/video/search?st.cmd=video&st.m=SEARCH&st.ft=search&st.v.sq=${q}`,
    `https://ok.ru/video/search?st.cmd=anonymVideo&st.m=SEARCH&st.v.sq=${q}`,
    `https://ok.ru/video/showcase?st.v.sq=${q}`,
  ];
  for (const u of urls) {
    try {
      const metas = parseSearch(await getText(u));
      if (metas.length) return metas;
    } catch (e) {
      console.error(e.message);
    }
  }
  return [];
}

// ---------- VİDEO SAYFASI -> oynatma linkleri ----------
const QUALITY = { ultra: 2160, quad: 1440, full: 1080, hd: 720, sd: 480, low: 360, lowest: 240, mobile: 144 };

async function resolveVideo(id) {
  const html = await getText(`https://ok.ru/video/${id}`);
  const attrs = [...html.matchAll(/data-options="([^"]+)"/g)].map((m) => m[1]);
  for (const a of attrs) {
    if (!a.includes("flashvars")) continue;
    try {
      const opts = JSON.parse(decode(a));
      let md = opts.flashvars && opts.flashvars.metadata;
      if (typeof md === "string") md = JSON.parse(md);
      if (!md) continue;
      const files = (md.videos || [])
        .map((v) => ({ name: v.name, url: v.url, h: QUALITY[v.name] || 0 }))
        .sort((x, y) => y.h - x.h);
      return {
        title: (md.movie && md.movie.title) || "",
        poster: md.movie && md.movie.poster,
        duration: md.movie && md.movie.duration, // saniye
        hls: md.hlsManifestUrl || md.hlsMasterPlaylistUrl || md.ondemandHls || null,
        files,
      };
    } catch (e) {
      console.error("video parse hatası:", e.message);
    }
  }
  return null;
}

async function buildStreams(id, base) {
  const info = await resolveVideo(id);
  if (!info) return [];
  const streams = [];
  if (info.hls) streams.push({ name: "ok.ru", title: "HLS (otomatik kalite)", url: info.hls });
  info.files.forEach((f) =>
    streams.push({ name: "ok.ru", title: `${f.h ? f.h + "p" : f.name} (mp4)`, url: f.url })
  );
  // Linkler istek yapan IP'ye bağlı olabilir; çalışmazsa sunucu üzerinden akıt:
  if (info.files.length)
    streams.push({
      name: "ok.ru proxy",
      title: `${info.files[0].h}p - sunucu üzerinden`,
      url: `${base}/proxy/${id}`,
    });
  return streams;
}

// ---------- HTTP ----------
function send(res, code, obj, type) {
  res.writeHead(code, {
    "Content-Type": type || "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
  });
  res.end(typeof obj === "string" ? obj : JSON.stringify(obj));
}

async function handler(req, res) {
  if (req.method === "OPTIONS") return send(res, 204, "");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "http";
  const base = `${proto}://${host}`;
  const path = decodeURIComponent(req.url.split("?")[0]);

  try {
    if (path === "/")
      return send(
        res,
        200,
        `<h2>ok.ru eklentisi</h2><p>Nuvio'ya eklenecek link:<br><b>${base}/manifest.json</b></p>`,
        "text/html; charset=utf-8"
      );
    if (path === "/manifest.json") return send(res, 200, manifest);

    // /catalog/movie/okru-search/search=zathura.json
    let m = path.match(/^\/catalog\/movie\/okru-search(?:\/(.*?))?\.json$/);
    if (m) {
      const extra = m[1] || "";
      const q = (extra.match(/search=(.+)/) || [])[1] || new URL(req.url, base).searchParams.get("search");
      if (!q) return send(res, 200, { metas: [] });
      return send(res, 200, { metas: await search(q) });
    }

    // /meta/movie/okru:123.json
    m = path.match(/^\/meta\/movie\/okru:(\d+)\.json$/);
    if (m) {
      const info = await resolveVideo(m[1]);
      const meta = { id: PREFIX + m[1], type: "movie", name: (info && info.title) || "ok.ru video" };
      if (info && info.poster) {
        meta.poster = info.poster;
        meta.background = info.poster;
        meta.posterShape = "landscape";
      }
      if (info && info.duration) meta.runtime = Math.round(info.duration / 60) + " dk";
      return send(res, 200, { meta });
    }

    // /stream/movie/okru:123.json
    m = path.match(/^\/stream\/movie\/okru:(\d+)\.json$/);
    if (m) return send(res, 200, { streams: await buildStreams(m[1], base) });

    // /proxy/123  (Range destekli)
    m = path.match(/^\/proxy\/(\d+)$/);
    if (m) {
      const info = await resolveVideo(m[1]);
      if (!info || !info.files.length) return send(res, 404, { error: "video yok" });
      const h = { "User-Agent": UA };
      if (req.headers.range) h.Range = req.headers.range;
      const up = await fetch(info.files[0].url, { headers: h });
      const out = { "Access-Control-Allow-Origin": "*", "Accept-Ranges": "bytes" };
      for (const k of ["content-type", "content-length", "content-range"])
        if (up.headers.get(k)) out[k] = up.headers.get(k);
      res.writeHead(up.status, out);
      Readable.fromWeb(up.body).pipe(res);
      req.on("close", () => res.destroy());
      return;
    }

    send(res, 404, { error: "bulunamadı" });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: String(e.message || e) });
  }
}

module.exports = handler; // Vercel vb. için
if (require.main === module)
  http.createServer(handler).listen(PORT, () => console.log("ok.ru eklentisi: http://localhost:" + PORT + "/manifest.json"));
