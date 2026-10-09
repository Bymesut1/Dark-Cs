// wfilmizle - wfilmizle.cam Nuvio provider
// getStreams(tmdbId, mediaType, season, episode)

var TMDB_KEY = '439c478a771f35c05022f9feabcca01c';
var BASE = 'https://www.wfilmizle.cam';
var UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
var DEBUG_MODU = false;

function log() {
    if (DEBUG_MODU) console.log.apply(console, ['[wfilmizle]'].concat([].slice.call(arguments)));
}

function norm(s) {
    return (s || '').toLowerCase()
        .replace(/ı/g, 'i').replace(/İ/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
        .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\bizle\b/g, '').replace(/&amp;/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ').trim();
}

function get(url, headers) {
    return fetch(url, { headers: Object.assign({ 'User-Agent': UA, 'Accept-Language': 'tr-TR,tr;q=0.9' }, headers || {}) })
        .then(function (r) { return r.text(); });
}

function getJson(u) {
    return fetch(u).then(function (r) { return r.json(); }).catch(function () { return {}; });
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
            year: parseInt((tr.release_date || en.release_date || '0').slice(0, 4), 10) || 0
        };
    });
}

function parseSearch(html) {
    var out = [];
    var parts = html.split('class="listmovie"');
    for (var i = 1; i < parts.length; i++) {
        var b = parts[i];
        var href = (b.match(/<div class="film-ismi">\s*<a href="([^"]+)"[^>]*>([^<]+)</) || []);
        if (!href[1]) continue;
        var year = (b.match(/fa-calendar-alt"><\/i>\s*(\d{4})/) || [])[1];
        var dil = (b.match(/class="film-dil"[^>]*>([^<]+)</) || [])[1] || '';
        out.push({ url: href[1], title: href[2].trim(), year: parseInt(year, 10) || 0, dil: dil.trim() });
    }
    return out;
}

function score(c, info) {
    var t = norm(c.title);
    var best = 0;
    (info.titles || []).forEach(function (q) {
        var n = norm(q);
        if (!n) return;
        var sc = 0;
        if (t === n) sc = 60;
        else if (t.indexOf(n) === 0 || n.indexOf(t) === 0) sc = 30;
        else if (t.indexOf(n) >= 0) sc = 20;
        if (sc > best) best = sc;
    });
    if (best === 0) return 0;
    if (info.year && c.year) {
        if (c.year === info.year) best += 40;
        else if (Math.abs(c.year - info.year) === 1) best += 15;
        else best -= 30;
    }
    return best;
}

function search(info) {
    var queries = [];
    (info.titles || []).forEach(function (q) {
        queries.push(q);
        var plain = q.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
        if (plain && plain !== q) queries.push(plain);
    });
    [info.original, info.enTitle].forEach(function (q) {
        if (q && q.indexOf(':') > 0) queries.push(q.split(':')[0].trim());
    });
    var seen = {}, uniq = [];
    queries.forEach(function (q) { if (q && !seen[q]) { seen[q] = 1; uniq.push(q); } });

    var all = [];
    var chain = Promise.resolve();
    uniq.slice(0, 7).forEach(function (q) {
        chain = chain.then(function () {
            if (all.some(function (c) { return score(c, info) >= 100; })) return;
            return get(BASE + '/?s=' + encodeURIComponent(q), { Referer: BASE + '/' })
                .then(function (h) { all = all.concat(parseSearch(h)); })
                .catch(function (e) { log('search err', e && e.message); });
        });
    });
    return chain.then(function () {
        var ranked = all.map(function (c) { return { c: c, s: score(c, info) }; })
            .filter(function (x) { return x.s >= 50; })
            .sort(function (a, b) { return b.s - a.s; });
        if (ranked.length) return ranked[0].c;

        var seenU = {}, cands = all.filter(function (c) {
            if (seenU[c.url]) return false; seenU[c.url] = 1;
            return !info.year || !c.year || c.year === info.year;
        }).slice(0, 4);
        var want = [info.original, info.enTitle].map(norm).filter(Boolean);
        var found = null, ch = Promise.resolve();
        cands.forEach(function (c) {
            ch = ch.then(function () {
                if (found) return;
                return get(c.url, { Referer: BASE + '/' }).then(function (h) {
                    var en = norm((h.match(/class="bolum-ismi">\s*([^<]+)</) || [])[1] || '');
                    if (en && want.some(function (w) { return w === en || en.indexOf(w) === 0 || w.indexOf(en) === 0; })) found = c;
                }).catch(function () {});
            });
        });
        return ch.then(function () { return found; });
    });
}

function fix(u, base) {
    if (!u) return '';
    u = u.replace(/\\\//g, '/').replace(/&amp;/g, '&');
    if (u.indexOf('//') === 0) return 'https:' + u;
    if (u.indexOf('http') === 0) return u;
    try { return new URL(u, base).href; } catch (e) { return u; }
}

function findIframes(html) {
    var res = [], re = /<iframe[^>]+?(?:data-src|src)="([^"]+)"/gi, m;
    while ((m = re.exec(html))) {
        var u = fix(m[1], BASE);
        if (u && u.indexOf('data:') !== 0 && res.indexOf(u) < 0 && /player|embed|hdplayer|iframe/i.test(u)) res.push(u);
    }
    return res;
}

function origin(u) {
    var m = u.match(/^(https?:\/\/[^\/]+)/);
    return m ? m[1] : '';
}

function qualityOf(s) {
    var m = (s || '').match(/(2160|1440|1080|720|480|360)/);
    return m ? m[1] + 'p' : 'Auto';
}

function resolvePlayer(playerUrl) {
    var org = origin(playerUrl);
    var hash = (playerUrl.match(/[?&]data=([^&]+)/) || [])[1] || (playerUrl.match(/\/(?:video|v|e)\/([A-Za-z0-9]+)/) || [])[1];
    var hdrs = { Referer: BASE + '/', Origin: BASE };
    var found = [];

    function push(u) {
        if (typeof u !== 'string') return;
        u = u.replace(/\\u0026/g, '&').replace(/\\\//g, '/').replace(/&amp;/g, '&');
        if (!/^https?:\/\//.test(u) && u.indexOf('/') !== 0) return;
        if (!/(\.m3u8|\.mp4|\.txt|\/m3\/|\/hls\/|\/stream)/i.test(u) && u.indexOf('http') !== 0) return;
        found.push(fix(u, org));
    }

    function walk(v, depth) {
        if (depth > 5 || v == null) return;
        if (typeof v === 'string') { push(v); return; }
        if (Array.isArray(v)) { v.forEach(function (x) { walk(x, depth + 1); }); return; }
        if (typeof v === 'object') {
            ['securedLink', 'videoSource', 'hls', 'file', 'source', 'url', 'src'].forEach(function (k) { if (v[k]) walk(v[k], depth + 1); });
            Object.keys(v).forEach(function (k) { walk(v[k], depth + 1); });
        }
    }

    function scan(txt) {
        if (!txt) return;
        try { walk(JSON.parse(txt), 0); } catch (e) {}
        var m;
        (txt.match(/https?:[^"'\s\\<>]+\.(?:m3u8|mp4)[^"'\s\\<>]*/g) || []).forEach(push);
        (txt.match(/https?:\\?\/\\?\/[^"'\s<>]+?\\?\/m3\\?\/[^"'\s\\<>]+/g) || []).forEach(push);
        var re = /["'](\/m3\/[^"'\s\\<>]+)["']/g;
        while ((m = re.exec(txt))) push(m[1]);
        (txt.match(/atob\(["'][A-Za-z0-9+\/=]{20,}["']\)/g) || []).forEach(function (x) {
            try { scan(atob(x.match(/["']([^"']+)["']/)[1])); } catch (e) {}
        });
    }

    var step1 = Promise.resolve();
    if (hash) {
        var apiUrl = org + '/player/index.php?data=' + hash + '&do=getVideo';
        step1 = fetch(apiUrl, {
            method: 'POST',
            headers: {
                'User-Agent': UA, 'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'Referer': playerUrl, 'Origin': org
            },
            body: 'hash=' + encodeURIComponent(hash) + '&r=' + encodeURIComponent(BASE + '/')
        }).then(function (r) { return r.text(); }).then(scan).catch(function (e) { log('api err', e && e.message); });
    }

    return step1.then(function () {
        if (found.length) return;
        return get(playerUrl, hdrs).then(scan).catch(function () {});
    }).then(function () {
        var seen = {}, out = [];
        found.forEach(function (u) { if (u && !seen[u]) { seen[u] = 1; out.push({ url: u, referer: playerUrl, origin: org }); } });
        log('bulunan', out.length);
        return out.slice(0, 1);
    });
}

function getStreams(tmdbId, mediaType, season, episode) {
    if (mediaType && mediaType !== 'movie') return Promise.resolve([]);
    return getTmdb(tmdbId).then(function (info) {
        log('tmdb', JSON.stringify(info));
        return search(info).then(function (hit) {
            if (!hit) { log('bulunamadi'); return []; }
            log('hit', hit.url, hit.dil);
            return get(hit.url, { Referer: BASE + '/' }).then(function (html) {
                var frames = findIframes(html);
                log('iframes', frames.length);
                var dilLabel = /dublaj/i.test(hit.dil) && /altyaz/i.test(hit.dil) ? 'Dublaj/Altyazı'
                    : /dublaj/i.test(hit.dil) ? 'Türkçe Dublaj' : /altyaz/i.test(hit.dil) ? 'Türkçe Altyazı' : 'TR';
                return Promise.all(frames.map(function (f) {
                    return resolvePlayer(f).catch(function () { return []; });
                })).then(function (groups) {
                    var streams = [];
                    groups.forEach(function (g) {
                        g.forEach(function (s) {
                            streams.push({
                                name: 'wfilmizle',
                                title: hit.title.replace(/\s*izle\s*$/i, '') + ' • ' + dilLabel,
                                url: s.url,
                                quality: qualityOf(s.url),
                                headers: { 'User-Agent': UA, 'Referer': s.origin + '/', 'Origin': s.origin },
                                provider: 'wfilmizle'
                            });
                        });
                    });
                    return streams;
                });
            });
        });
    }).catch(function (e) { log('hata', e && e.message); return []; });
}

if (typeof module !== 'undefined' && module.exports) module.exports = { getStreams: getStreams };
else global.getStreams = getStreams;
