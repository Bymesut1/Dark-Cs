// ok.ru Nuvio & Stremio Provider (Mail.ru Eşleştirme Mantığı İle)
const http = require("http");

const PORT = process.env.PORT || 7000;
const PREFIX = "okru:";
const UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
const HEADERS = { "User-Agent": UA, "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8" };
const TMDB_KEY = '000316508321ce461cf81e7c6815eec7';

const AYAR = {
  EKLENTI_ADI: 'ok.ru TR',
  PROVIDER_ID: 'okru',
  DEBUG_MODU: false,
  MAX_ADAY: 8,
  MAX_SORGU: 20,
  ONEKLER: ['www.baglanfilmizle.tr', 'baglanfilmizle'],
  ARAMA_SURESI: 5000,
  GENEL_SURE: 9000
};

const STOP_WORDS = { the: 1, a: 1, an: 1, of: 1, and: 1, ve: 1, ile: 1, film: 1, filmi: 1, izle: 1, movie: 1 };
const ROMAN = { ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };
const NOISE = { bluray:1, brrip:1, webrip:1, webdl:1, hdrip:1, hdtv:1, dvdrip:1, x264:1, x265:1, h264:1, h265:1, hevc:1, aac:1, ac3:1, dts:1, dual:1, tr:1, en:1, eng:1, turkce:1, turkish:1, trdub:1, dublaj:1, dublajli:1, altyazi:1, altyazili:1, sub:1, subs:1, full:1, hd:1, fhd:1, uhd:1, multi:1, ar:1, arapca:1, extended:1, remastered:1, repack:1, mkv:1, mp4:1, avi:1, hdr:1, english:1, dub:1, subtitle:1, tek:1, parca:1, part:1, bolum:1 };

const TR_MAP = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u', 'â': 'a', 'î': 'i', 'û': 'u' };
function asciiLower(s) {
  return String(s || '').replace(/İ/g, 'i').replace(/I/g, 'i').toLowerCase()
    .replace(/[çğıöşüâîû]/g, c => TR_MAP[c]);
}
function norm(s) { return asciiLower(s).replace(/[^a-z0-9]/g, ''); }

function sigTokens(s) {
  const words = [], nums = [];
  asciiLower(s).split(/[^a-z0-9]+/).forEach(t => {
    if (!t) return;
    if (/^\d{1,2}$/.test(t)) { nums.push(parseInt(t, 10)); return; }
    if (ROMAN[t]) { nums.push(ROMAN[t]); return; }
    if (STOP_WORDS[t]) return;
    words.push(t);
  });
  return { words, nums };
}

function analyze(title) {
  const raw = String(title || '').replace(/\s*[\(\[]\s*\d\s*[\)\]]\s*$/, '').replace(/\bsayfa\s*\d+/gi, ' ').replace(/(^|[^0-9])[257][.,][01](?![0-9])/g, '$1');
  const toks = [];
  asciiLower(raw.replace(/\?/g, '_')).split(/[^a-z0-9_]+/).filter(Boolean).forEach(t => {
    let m;
    if (m = t.match(/^m?(2160|1080|720|480|360)p(tr|dual|dublaj|turkce|izle|hd|sub)?$/)) { toks.push(m[1] + 'p'); if (m[2]) toks.push(m[2]); }
    else if (m = t.match(/^(\d{1,4})(tr|trdub|dublaj|dual|turkce|altyazi)$/)) { toks.push(m[1]); toks.push(m[2]); }
    else toks.push(t);
  });
  const info = { years: [], res: 0, tags: {}, words: [], nums: [], part: 0, bag: toks };
  toks.forEach((t, idx) => {
    if (t === 'x' && idx === toks.length - 1) { info.tags[t] = 1; return; }
    if (/^(19|20)\d{2}$/.test(t)) { info.years.push(parseInt(t, 10)); return; }
    let m = t.match(/^(2160|1080|720|480|360)p$/);
    if (m) { info.res = Math.max(info.res, parseInt(m[1], 10)); return; }
    if (t === '4k') { info.res = Math.max(info.res, 2160); return; }
    if (m = t.match(/^(?:cd|disc|disk|pt|part|kisim)(\d)$/)) { info.part = parseInt(m[1], 10); return; }
    if (NOISE[t] || /dublaj|turkce|altyaz|dual/.test(t)) { info.tags[t] = 1; return; }
    if (/^\d{1,2}$/.test(t)) { info.nums.push(parseInt(t, 10)); return; }
    if (ROMAN[t]) { info.nums.push(ROMAN[t]); return; }
    if (!STOP_WORDS[t]) info.words.push(t);
  });
  info.joined = toks.join('');
  return info;
}

const TR_SUF = /^(i|u|a|e|s|n|si|su|in|un|an|en|ya|ye|yi|yu|da|de|ta|te|ler|lar|leri|lari|nin|nun|dan|den|tan|ten|nda|nde|ndan|nden|ni|na|ne|ndaki)$/;
function sufEq(a, b) {
  const s = a.length <= b.length ? a : b, l = a.length <= b.length ? b : a;
  return s.length >= 4 && l.length > s.length && l.length - s.length <= 5 && l.indexOf(s) === 0 && TR_SUF.test(l.slice(s.length));
}
function looseEq(a, b) { return a === b || (a.length >= 5 && b.length >= 5 && Math.abs(a.length - b.length) <= 1); }
function tokEq(w, b) { return looseEq(w, b) || sufEq(w, b); }

function exactTitle(info, wants) {
  for (let i = 0; i < wants.length; i++) {
    const sw = sigTokens(wants[i]), ww = sw.words;
    if (!ww.length) continue;
    if (!ww.every(w => info.bag.some(b => tokEq(w, b)))) continue;
    const extra = info.words.filter(b => !ww.some(w => tokEq(w, b)));
    if (extra.length) continue;
    if (sw.nums.slice().sort().join(',') === info.nums.slice().sort().join(',')) return true;
  }
  return false;
}

function nameMatch(info, wants) {
  for (let i = 0; i < wants.length; i++) {
    const sw = sigTokens(wants[i]), ww = sw.words;
    if (!ww.length) continue;
    const covered = ww.every(w => info.bag.some(b => tokEq(w, b)));
    if (!covered) {
      const wn = norm(wants[i]);
      if (wn.length >= 6 && info.joined && info.joined.indexOf(wn) > -1) return true;
      continue;
    }
    if (ww.length <= 2 && info.words.length > ww.length * 3) continue;
    if (sw.nums.length && info.nums.length) {
      if (!sw.nums.some(n => info.nums.indexOf(n) > -1)) continue;
    } else if (!sw.nums.length && info.nums.some(n => n >= 2 && n <= 20)) continue;
    return true;
  }
  return false;
}

function langInfo(info) {
  const keys = Object.keys(info.tags).concat(info.bag);
  const any = (re) => keys.some(k => re.test(k));
  const tr = any(/^tr$\vert{}^trk$|turkce|turkish|dublaj|^trdub/);
  const dual = any(/dual|^cift$/);
  const dublaj = any(/dublaj|^trdub/);
  const sub = any(/altyaz|^sub$\vert{}^subs$|subtitle/);
  const foreign = any(/^(rus|russian|rusca|ru|ukr|ger|german|deu|fre|french|fra|spa|spanish|ita|italian|hin|hindi|kor|korean|jpn|japanese|chi|chinese|pol|por|arabic|ar|arapca|farsi|persian)$/);
  const en = any(/^en$|^eng$\vert{}^english$|ingilizce/);
  const izle = any(/^izle$/);

  if (tr && dublaj) return { label: 'TR Dublaj', tier: 0, ok: true, foreign, sub, en };
  if (tr && dual) return { label: 'TR Dual', tier: 0, ok: true, foreign, sub, en };
  if (tr && sub) return { label: 'TR Altyazı', tier: 5, ok: false, foreign, sub: true, en };
  if (tr) return { label: 'TR', tier: 0, ok: true, foreign, sub, en };
  if (izle && !foreign && !sub && !en) return { label: 'TR İzle', tier: 1, ok: true, foreign, sub, en };
  return { label: dual ? 'Dual' : sub ? 'Altyazı' : foreign ? 'Yabancı' : en ? 'EN' : '?', tier: 5, ok: false, foreign, sub, en };
}

function rankItem(item, ctx) {
  const info = analyze(item.title);
  const nameOk = nameMatch(info, ctx.wants);
  if (!nameOk) return null;

  let score = 20;
  if (nameOk && !info.years.length && exactTitle(info, ctx.wants)) score += 10;
  if (info.years.length && ctx.year) {
    let yd = 99;
    info.years.forEach(y => { yd = Math.min(yd, Math.abs(y - ctx.year)); });
    if (yd === 0) score += 30;
    else if (yd === 1) score += 15;
    else return null;
  }
  if (item.dur && ctx.runtime) {
    const r = item.dur / (ctx.runtime * 60), d = Math.abs(r - 1);
    if (d <= 0.06) score += 25;
    else if (d <= 0.15) score += 10;
  }
  let li = langInfo(info);
  if (!li.ok && ctx.trFilm && !li.foreign) li = { label: 'TR Yerli', tier: 0, ok: true };
  if (!li.ok) {
    const clean = !li.foreign && !li.sub && !li.en;
    if (clean && li.label === '?' && nameOk) li = { label: 'TR (Olası)', tier: 2, ok: true };
    else return null;
  }
  if (info.res >= 2160) score += 4; else if (info.res >= 1080) score += 3; else if (info.res >= 720) score += 2;
  return { score, info, lang: li.label, tier: li.tier };
}

const ETIKET_ILK = ['TR', 'Türkçe Dublaj', 'izle', 'tr izle'];
const ETIKET_SONRA = ['dublaj', 'TR Dual', 'HD Türkçe', 'tek parça izle', '1080p'];
function uniq(list) { return [...new Set(list.filter(Boolean))]; }

function buildQueries(year, titles, trTitles) {
  const qs = [];
  const y = year ? ` ${year}` : '';
  const main = trTitles[0] || titles[0] || '';
  const names = uniq([trTitles[0], titles[0]]);
  
  const add = (q) => { if (q) qs.push(q); };
  add(main);
  add(main + y);
  ETIKET_ILK.forEach(tag => names.forEach(n => add(`${n} ${tag}`)));
  AYAR.ONEKLER.forEach(o => add(`${o} ${main}`));
  if (year) ['tr', 'TR dublaj', 'izle'].forEach(t => add(`${year} ${t}`));
  ETIKET_SONRA.forEach(tag => add(`${main} ${tag}`));
  
  return uniq(qs.map(q => q.replace(/\s+/g, ' ').trim())).filter(q => q.length >= 3).slice(0, AYAR.MAX_SORGU);
}

async function getJson(url) {
  try { const r = await fetch(url); return await r.json(); } catch(e) { return {}; }
}

async function getText(url) {
  const r = await fetch(url, { headers: HEADERS, redirect: "follow" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.text();
}

const decode = (s) => String(s).replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

function parseOkSearch(html) {
  const out = [];
  const seen = new Set();
  const add = (m) => {
    if (!m || !m.id || seen.has(m.id)) return;
    seen.add(m.id);
    out.push({
      id: m.id,
      title: decode(m.title || m.name || 'ok.ru video'),
      dur: m.duration ? Math.round(m.duration / 1000) : 0
    });
  };
  const tag = html.match(/<video-search-result[^>]*?data-props="([^"]+)"/);
  if (tag) {
    try {
      const props = JSON.parse(decode(tag[1]));
      ((props.videos && props.videos.list) || []).forEach((v) => add(v.movie));
      ((props.channels && props.channels.list) || []).forEach((c) => (c.videos || []).forEach((v) => add(v.movie)));
    } catch (e) {}
  }
  return out;
}

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
      return { files, hls: md.hlsManifestUrl || md.hlsMasterPlaylistUrl || null };
    } catch (e) {}
  }
  return null;
}

async function getStreams(tmdbId, mediaType, season, episode, reqBase = '') {
  if (mediaType && mediaType !== "movie") return [];
  const b = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_KEY}`;
  const [tr, en, trans, alt] = await Promise.all([
    getJson(`${b}&language=tr-TR`), getJson(`${b}&language=en-US`),
    getJson(`${b}/translations`), getJson(`${b}/alternative_titles`)
  ]);
  
  if (!tr.title && !en.title) return [];
  const year = parseInt((tr.release_date || en.release_date || "0").slice(0, 4), 10) || 0;
  const titles = uniq([tr.original_title, en.title, tr.title]);
  const trTitles = [];
  ((trans.translations) || []).forEach(t => { if (t.iso_639_1 === "tr" && t.data) trTitles.push(t.data.title); });
  ((alt.titles) || []).forEach(t => { if (t.iso_3166_1 === "TR") trTitles.push(t.title); });
  
  const wants = uniq(titles.concat(trTitles));
  const ctx = { year, runtime: tr.runtime || en.runtime || 0, wants, trFilm: tr.original_language === 'tr' };
  
  const queries = buildQueries(year, titles, trTitles);
  let allResults = [];
  
  await Promise.all(queries.map(async (q) => {
    try {
      const enc = encodeURIComponent(q);
      const urls = [
        `https://ok.ru/video/search?st.cmd=video&st.m=SEARCH&st.ft=search&st.v.sq=${enc}`,
        `https://ok.ru/video/search?st.cmd=anonymVideo&st.m=SEARCH&st.v.sq=${enc}`
      ];
      for (const u of urls) {
        const html = await getText(u);
        const parsed = parseOkSearch(html);
        if (parsed.length) { allResults.push(...parsed); break; }
      }
    } catch (e) {}
  }));

  const seenId = new Set();
  const ranked = [];
  allResults.forEach(it => {
    if (seenId.has(it.id)) return;
    seenId.add(it.id);
    const r = rankItem(it, ctx);
    if (r) ranked.push({ item: it, r });
  });
  
  ranked.sort((a, b) => (a.r.tier - b.r.tier) || (b.r.score - a.r.score));
  const top = ranked.slice(0, AYAR.MAX_ADAY);
  if (!top.length) return [];

  const streams = [];
  for (const x of top) {
    const info = await resolveVideo(x.item.id);
    if (!info || !info.files.length) continue;
    
    info.files.forEach(f => {
      const qText = f.h ? `${f.h}p` : f.name;
      streams.push({
        name: AYAR.EKLENTI_ADI,
        title: `${x.item.title}\n${x.r.lang} | ${qText}`,
        url: f.url,
        quality: qText,
        headers: { "User-Agent": UA },
        behaviorHints: { proxyHeaders: { request: { "User-Agent": UA } } }
      });
    });
  }
  return streams;
}

function send(res, code, obj, type) {
  res.writeHead(code, {
    "Content-Type": type || "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*"
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
    if (path === "/") return send(res, 200, `<h2>ok.ru TR TMDB Eklentisi</h2><p>Eklenecek link: <b>${base}/manifest.json</b></p>`, "text/html; charset=utf-8");
    if (path === "/manifest.json") return send(res, 200, require('./manifest.json'));

    const m = path.match(/^\/stream\/(movie)\/(tt\d+)\.json$/);
    if (m) {
      const streams = await getStreams(m[2], m[1], null, null, base);
      return send(res, 200, { streams });
    }

    send(res, 404, { error: "Bulunamadı" });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: String(e.message || e) });
  }
}

module.exports = { getStreams, handler };

if (require.main === module) {
  http.createServer(handler).listen(PORT, () => console.log(`ok.ru TMDB Eklentisi: http://localhost:${PORT}/manifest.json`));
}
