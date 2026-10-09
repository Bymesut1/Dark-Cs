// ok.ru Nuvio Scraper Provider
var TMDB_KEY = '000316508321ce461cf81e7c6815eec7';
var UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
var HEADERS = { 'User-Agent': UA, 'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8' };

var AYAR = {
  EKLENTI_ADI: 'ok.ru',
  PROVIDER_ID: 'okru',
  MAX_ADAY: 8,
  MAX_SORGU: 18,
  ONEKLER: ['www.baglanfilmizle.tr', 'baglanfilmizle']
};

var STOP_WORDS = { the: 1, a: 1, an: 1, of: 1, and: 1, ve: 1, ile: 1, film: 1, filmi: 1, izle: 1, movie: 1 };
var ROMAN = { ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };
var NOISE = { bluray:1, brrip:1, webrip:1, webdl:1, hdrip:1, hdtv:1, dvdrip:1, x264:1, x265:1, h264:1, h265:1, hevc:1, aac:1, ac3:1, dts:1, dual:1, tr:1, en:1, eng:1, turkce:1, turkish:1, trdub:1, dublaj:1, dublajli:1, altyazi:1, altyazili:1, sub:1, subs:1, full:1, hd:1, fhd:1, uhd:1, multi:1, ar:1, arapca:1, extended:1, remastered:1, repack:1, mkv:1, mp4:1, avi:1, hdr:1, english:1, dub:1, subtitle:1, tek:1, parca:1, part:1, bolum:1 };

var TR_MAP = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u', 'â': 'a', 'î': 'i', 'û': 'u' };
function asciiLower(s) {
  return String(s || '').replace(/İ/g, 'i').replace(/I/g, 'i').toLowerCase()
    .replace(/[çğıöşüâîû]/g, function (c) { return TR_MAP[c]; });
}
function norm(s) { return asciiLower(s).replace(/[^a-z0-9]/g, ''); }

function get(url, headers) {
  return fetch(url, { headers: Object.assign({}, HEADERS, headers || {}) })
    .then(function (r) { return r.text(); });
}

function getJson(u) {
  return fetch(u).then(function (r) { return r.json(); }).catch(function () { return {}; });
}

function sigTokens(s) {
  var words = [], nums = [];
  asciiLower(s).split(/[^a-z0-9]+/).forEach(function (t) {
    if (!t) return;
    if (/^\d{1,2}$/.test(t)) { nums.push(parseInt(t, 10)); return; }
    if (ROMAN[t]) { nums.push(ROMAN[t]); return; }
    if (STOP_WORDS[t]) return;
    words.push(t);
  });
  return { words: words, nums: nums };
}

function analyze(title) {
  var raw = String(title || '').replace(/\s*[\(\[]\s*\d\s*[\)\]]\s*$/, '').replace(/\bsayfa\s*\d+/gi, ' ').replace(/(^|[^0-9])[257][.,][01](?![0-9])/g, '$1');
  var toks = [];
  asciiLower(raw.replace(/\?/g, '_')).split(/[^a-z0-9_]+/).filter(Boolean).forEach(function (t) {
    var m;
    if (m = t.match(/^m?(2160|1080|720|480|360)p(tr|dual|dublaj|turkce|izle|hd|sub)?$/)) { toks.push(m[1] + 'p'); if (m[2]) toks.push(m[2]); }
    else if (m = t.match(/^(\d{1,4})(tr|trdub|dublaj|dual|turkce|altyazi)$/)) { toks.push(m[1]); toks.push(m[2]); }
    else toks.push(t);
  });
  var info = { years: [], res: 0, tags: {}, words: [], nums: [], part: 0, bag: toks };
  toks.forEach(function (t, idx) {
    if (t === 'x' && idx === toks.length - 1) { info.tags[t] = 1; return; }
    if (/^(19|20)\d{2}$/.test(t)) { info.years.push(parseInt(t, 10)); return; }
    var m = t.match(/^(2160|1080|720|480|360)p$/);
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

var TR_SUF = /^(i|u|a|e|s|n|si|su|in|un|an|en|ya|ye|yi|yu|da|de|ta|te|ler|lar|leri|lari|nin|nun|dan|den|tan|ten|nda|nde|ndan|nden|ni|na|ne|ndaki)$/;
function sufEq(a, b) {
  var s = a.length <= b.length ? a : b, l = a.length <= b.length ? b : a;
  return s.length >= 4 && l.length > s.length && l.length - s.length <= 5 && l.indexOf(s) === 0 && TR_SUF.test(l.slice(s.length));
}
function looseEq(a, b) { return a === b || (a.length >= 5 && b.length >= 5 && Math.abs(a.length - b.length) <= 1); }
function tokEq(w, b) { return looseEq(w, b) || sufEq(w, b); }

function exactTitle(info, wants) {
  for (var i = 0; i < wants.length; i++) {
    var sw = sigTokens(wants[i]), ww = sw.words;
    if (!ww.length) continue;
    if (!ww.every(function (w) { return info.bag.some(function (b) { return tokEq(w, b); }); })) continue;
    var extra = info.words.filter(function (b) { return !ww.some(function (w) { return tokEq(w, b); }); });
    if (extra.length) continue;
    if (sw.nums.slice().sort().join(',') === info.nums.slice().sort().join(',')) return true;
  }
  return false;
}

function nameMatch(info, wants) {
  for (var i = 0; i < wants.length; i++) {
    var sw = sigTokens(wants[i]), ww = sw.words;
    if (!ww.length) continue;
    var covered = ww.every(function (w) { return info.bag.some(function (b) { return tokEq(w, b); }); });
    if (!covered) {
      var wn = norm(wants[i]);
      if (wn.length >= 6 && info.joined && info.joined.indexOf(wn) > -1) return true;
      continue;
    }
    if (ww.length <= 2 && info.words.length > ww.length * 3) continue;
    if (sw.nums.length && info.nums.length) {
      if (!sw.nums.some(function (n) { return info.nums.indexOf(n) > -1; })) continue;
    } else if (!sw.nums.length && info.nums.some(function (n) { return n >= 2 && n <= 20; })) continue;
    return true;
  }
  return false;
}

function langInfo(info) {
  var keys = Object.keys(info.tags).concat(info.bag);
  function any(re) { return keys.some(function (k) { return re.test(k); }); }
  var tr = any(/^tr$|^trk$|turkce|turkish|dublaj|^trdub/);
  var dual = any(/dual|^cift$/);
  var dublaj = any(/dublaj|^trdub/);
  var sub = any(/altyaz|^sub$|^subs$|subtitle/);
  var foreign = any(/^(rus|russian|rusca|ru|ukr|ger|german|deu|fre|french|fra|spa|spanish|ita|italian|hin|hindi|kor|korean|jpn|japanese|chi|chinese|pol|por|arabic|ar|arapca|farsi|persian)$/);
  var en = any(/^en$|^eng$|^english$|ingilizce/);
  var izle = any(/^izle$/);

  if (tr && dublaj) return { label: 'TR Dublaj', tier: 0, ok: true };
  if (tr && dual) return { label: 'TR Dual', tier: 0, ok: true };
  if (tr && sub) return { label: 'TR Altyazı', tier: 5, ok: false };
  if (tr) return { label: 'TR', tier: 0, ok: true };
  if (izle && !foreign && !sub && !en) return { label: 'TR İzle', tier: 1, ok: true };
  return { label: dual ? 'Dual' : '?', tier: 5, ok: false };
}

function rankItem(item, ctx) {
  var info = analyze(item.title);
  var nameOk = nameMatch(info, ctx.wants);
  if (!nameOk) return null;

  var score = 20;
  if (nameOk && !info.years.length && exactTitle(info, ctx.wants)) score += 10;
  if (info.years.length && ctx.year) {
    var yd = 99;
    info.years.forEach(function (y) { yd = Math.min(yd, Math.abs(y - ctx.year)); });
    if (yd === 0) score += 30;
    else if (yd === 1) score += 15;
    else return null;
  }
  if (item.dur && ctx.runtime) {
    var r = item.dur / (ctx.runtime * 60), d = Math.abs(r - 1);
    if (d <= 0.06) score += 25;
    else if (d <= 0.15) score += 10;
  }
  var li = langInfo(info);
  if (!li.ok && ctx.trFilm) li = { label: 'TR Yerli', tier: 0, ok: true };
  if (!li.ok) {
    if (li.label === '?' && nameOk) li = { label: 'TR', tier: 2, ok: true };
    else return null;
  }
  if (info.res >= 2160) score += 4; else if (info.res >= 1080) score += 3; else if (info.res >= 720) score += 2;
  return { score: score, info: info, lang: li.label, tier: li.tier };
}

function uniq(list) {
  var out = [];
  (list || []).forEach(function (x) { if (x && out.indexOf(x) === -1) out.push(x); });
  return out;
}

function buildQueries(year, titles, trTitles) {
  var qs = [];
  var y = year ? ' ' + year : '';
  var main = trTitles[0] || titles[0] || '';
  var names = uniq([trTitles[0], titles[0]]);
  
  function add(q) { if (q) qs.push(q); }
  add(main);
  add(main + y);
  ['TR', 'Türkçe Dublaj', 'izle'].forEach(function (tag) {
    names.forEach(function (n) { add(n + ' ' + tag); });
  });
  AYAR.ONEKLER.forEach(function (o) { add(o + ' ' + main); });
  if (year) ['tr', 'TR dublaj', 'izle'].forEach(function (t) { add(year + ' ' + t); });
  
  return uniq(qs.map(function (q) { return String(q || '').replace(/\s+/g, ' ').trim(); })).filter(function (q) { return q.length >= 3; }).slice(0, AYAR.MAX_SORGU);
}

function decodeHtml(s) {
  return String(s || '').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function parseOkSearch(html) {
  var out = [], seen = {};
  var tag = String(html || '').match(/<video-search-result[^>]*?data-props="([^"]+)"/);
  if (tag) {
    try {
      var props = JSON.parse(decodeHtml(tag[1]));
      var vids = (props.videos && props.videos.list) || [];
      vids.forEach(function (v) {
        if (v.movie && v.movie.id && !seen[v.movie.id]) {
          seen[v.movie.id] = true;
          out.push({
            id: v.movie.id,
            title: decodeHtml(v.movie.title || v.movie.name || 'ok.ru video'),
            dur: v.movie.duration ? Math.round(v.movie.duration / 1000) : 0
          });
        }
      });
    } catch (e) {}
  }
  return out;
}

var QUALITY = { ultra: 2160, quad: 1440, full: 1080, hd: 720, sd: 480, low: 360, lowest: 240, mobile: 144 };
function resolveVideo(id) {
  return get('https://ok.ru/video/' + id).then(function (html) {
    var attrs = html.match(/data-options="([^"]+)"/g) || [];
    for (var i = 0; i < attrs.length; i++) {
      var a = attrs[i].replace(/^data-options="/, '').replace(/"$/, '');
      if (a.indexOf('flashvars') === -1) continue;
      try {
        var opts = JSON.parse(decodeHtml(a));
        var md = opts.flashvars && opts.flashvars.metadata;
        if (typeof md === 'string') md = JSON.parse(md);
        if (!md) continue;
        var files = (md.videos || []).map(function (v) {
          return { name: v.name, url: decodeHtml(v.url).replace(/\\\//g, '/'), h: QUALITY[v.name] || 0 };
        }).sort(function (x, y) { return y.h - x.h; });
        return { files: files };
      } catch (e) {}
    }
    return null;
  }).catch(function () { return null; });
}

function getTmdb(tmdbId) {
  var b = 'https://api.themoviedb.org/3/movie/' + tmdbId + '?api_key=' + TMDB_KEY;
  return Promise.all([
    getJson(b + '&language=tr-TR'),
    getJson(b + '&language=en-US'),
    getJson('https://api.themoviedb.org/3/movie/' + tmdbId + '/translations?api_key=' + TMDB_KEY),
    getJson('https://api.themoviedb.org/3/movie/' + tmdbId + '/alternative_titles?api_key=' + TMDB_KEY)
  ]).then(function (r) {
    var tr = r[0], en = r[1], trans = r[2], alt = r[3];
    var titles = [];
    function add(t) { if (t && titles.indexOf(t) < 0) titles.push(t); }
    add(tr.title); add(tr.original_title); add(en.title);
    ((trans && trans.translations) || []).forEach(function (t) {
      if (t.iso_639_1 === 'tr' && t.data) add(t.data.title);
    });
    ((alt && alt.titles) || []).forEach(function (t) {
      if (t.iso_3166_1 === 'TR') add(t.title);
    });
    return {
      trTitle: tr.title || '',
      enTitle: en.title || '',
      original: tr.original_title || en.original_title || '',
      titles: titles,
      trTitles: uniq(titles),
      year: parseInt((tr.release_date || en.release_date || '0').slice(0, 4), 10) || 0,
      runtime: tr.runtime || en.runtime || 0,
      trFilm: tr.original_language === 'tr'
    };
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  if (mediaType && mediaType !== 'movie') return Promise.resolve([]);
  return getTmdb(tmdbId).then(function (info) {
    if (!info.trTitle && !info.enTitle) return [];
    var ctx = { year: info.year, runtime: info.runtime, wants: info.titles, trFilm: info.trFilm };
    var queries = buildQueries(info.year, info.titles, info.trTitles);
    
    var allResults = [];
    var chain = Promise.resolve();
    queries.forEach(function (q) {
      chain = chain.then(function () {
        var enc = encodeURIComponent(q);
        return get('https://ok.ru/video/search?st.cmd=video&st.m=SEARCH&st.ft=search&st.v.sq=' + enc)
          .then(function (html) {
            var parsed = parseOkSearch(html);
            if (parsed.length) allResults = allResults.concat(parsed);
          }).catch(function () {});
      });
    });

    return chain.then(function () {
      var seenId = {}, ranked = [];
      allResults.forEach(function (it) {
        if (seenId[it.id]) return;
        seenId[it.id] = true;
        var r = rankItem(it, ctx);
        if (r) ranked.push({ item: it, r: r });
      });

      ranked.sort(function (a, b) { return (a.r.tier - b.r.tier) || (b.r.score - a.r.score); });
      var top = ranked.slice(0, AYAR.MAX_ADAY);
      if (!top.length) return [];

      return Promise.all(top.map(function (x) {
        return resolveVideo(x.item.id).then(function (vidInfo) {
          if (!vidInfo || !vidInfo.files.length) return [];
          return vidInfo.files.map(function (f) {
            var qText = f.h ? f.h + 'p' : f.name;
            return {
              name: AYAR.EKLENTI_ADI,
              title: x.item.title + ' • ' + x.r.lang,
              url: f.url,
              quality: qText,
              headers: { 'User-Agent': UA, 'Referer': 'https://ok.ru/' },
              provider: AYAR.PROVIDER_ID
            };
          });
        });
      })).then(function (groups) {
        var streams = [];
        groups.forEach(function (g) { streams = streams.concat(g); });
        return streams;
      });
    });
  }).catch(function () { return []; });
}

if (typeof module !== 'undefined' && module.exports) module.exports = { getStreams: getStreams };
else global.getStreams = getStreams;
