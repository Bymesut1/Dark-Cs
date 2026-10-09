// ok.ru Nuvio JS Provider (Saf JavaScript - Node.js bağımsız)
const UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
const HEADERS = { "User-Agent": UA, "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8" };
const TMDB_KEY = '000316508321ce461cf81e7c6815eec7';

const AYAR = {
  EKLENTI_ADI: 'ok.ru TR',
  PROVIDER_ID: 'okru',
  MAX_ADAY: 8,
  MAX_SORGU: 20,
  ONEKLER: ['www.baglanfilmizle.tr', 'baglanfilmizle']
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
    const covered = ww.every(w => info.bag.some(b => tokEq(
