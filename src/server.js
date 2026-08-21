'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3091;
const KEY = process.env.TMDB_API_KEY;
const API = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';
const LANG = 'ar';
const REGION = process.env.TMDB_REGION || 'DZ';

if (!KEY) {
  console.error('TMDB_API_KEY is required');
  process.exit(1);
}

// ---------- cache ----------
const cache = new Map();
function cacheGet(k) {
  const v = cache.get(k);
  if (!v) return null;
  if (Date.now() > v.exp) { cache.delete(k); return null; }
  return v.data;
}
function cacheSet(k, data, ttlMs) {
  if (cache.size > 800) cache.clear();
  cache.set(k, { data, exp: Date.now() + ttlMs });
}

// ---------- tmdb ----------
async function tmdb(endpoint, params = {}, ttl = 30 * 60 * 1000) {
  const u = new URL(API + endpoint);
  u.searchParams.set('api_key', KEY);
  u.searchParams.set('language', LANG);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, v);
  }
  const key = u.pathname + '?' + [...u.searchParams.entries()].filter(([k]) => k !== 'api_key').map(([k, v]) => k + '=' + v).join('&');
  const hit = cacheGet(key);
  if (hit) return hit;
  const res = await fetch(u, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error('TMDB ' + res.status + ' on ' + endpoint);
  const json = await res.json();
  cacheSet(key, json, ttl);
  return json;
}

// ---------- shaping ----------
function card(item, forcedType) {
  const type = forcedType || item.media_type || (item.title ? 'movie' : 'tv');
  const title = item.title || item.name || item.original_title || item.original_name || '';
  const date = item.release_date || item.first_air_date || '';
  return {
    id: item.id,
    type,
    title,
    year: date ? String(date).slice(0, 4) : '',
    poster: item.poster_path || null,
    backdrop: item.backdrop_path || null,
    rating: item.vote_average ? Math.round(item.vote_average * 10) / 10 : null,
    overview: item.overview || ''
  };
}
function cards(list, type) {
  return (list || []).filter((x) => x && (x.poster_path || x.backdrop_path)).map((x) => card(x, type));
}

// ---------- routes ----------
async function home() {
  const [trending, cinema, topMovies, popularTv, topTv, upcoming] = await Promise.all([
    tmdb('/trending/all/day', {}, 60 * 60 * 1000),
    tmdb('/movie/now_playing', { region: REGION }),
    tmdb('/movie/top_rated', {}),
    tmdb('/tv/popular', {}),
    tmdb('/tv/top_rated', {}),
    tmdb('/movie/upcoming', { region: REGION })
  ]);
  const hero = cards(trending.results).filter((c) => c.backdrop).slice(0, 6);
  return {
    hero,
    rows: [
      { key: 'trending', title: 'رائج اليوم', items: cards(trending.results) },
      { key: 'now', title: 'في السينما الآن', items: cards(cinema.results, 'movie') },
      { key: 'tv_popular', title: 'مسلسلات شعبية', items: cards(popularTv.results, 'tv') },
      { key: 'top_movies', title: 'أفلام الأعلى تقييمًا', items: cards(topMovies.results, 'movie') },
      { key: 'top_tv', title: 'مسلسلات الأعلى تقييمًا', items: cards(topTv.results, 'tv') },
      { key: 'upcoming', title: 'قريبًا', items: cards(upcoming.results, 'movie') }
    ].filter((r) => r.items.length)
  };
}

async function search(q, page) {
  if (!q) return { items: [], page: 1, total_pages: 0 };
  const data = await tmdb('/search/multi', { query: q, page: page || 1, include_adult: 'false' }, 10 * 60 * 1000);
  const items = cards((data.results || []).filter((r) => r.media_type !== 'person'));
  return { items, page: data.page, total_pages: data.total_pages };
}

async function discover(type, params) {
  const t = type === 'tv' ? 'tv' : 'movie';
  const p = {
    page: params.page || 1,
    sort_by: params.sort || 'popularity.desc',
    with_genres: params.genre || '',
    'vote_count.gte': params.sort && params.sort.startsWith('vote_average') ? 200 : 50,
    include_adult: 'false'
  };
  if (params.year) p[t === 'tv' ? 'first_air_date_year' : 'primary_release_year'] = params.year;
  const data = await tmdb('/discover/' + t, p);
  return { items: cards(data.results, t), page: data.page, total_pages: Math.min(data.total_pages || 1, 500) };
}

async function genres(type) {
  const t = type === 'tv' ? 'tv' : 'movie';
  const data = await tmdb('/genre/' + t + '/list', {}, 24 * 60 * 60 * 1000);
  return data.genres || [];
}

function pickTrailer(videos) {
  const list = (videos && videos.results) || [];
  const yt = list.filter((v) => v.site === 'YouTube');
  return (
    yt.find((v) => v.type === 'Trailer' && v.official) ||
    yt.find((v) => v.type === 'Trailer') ||
    yt.find((v) => v.type === 'Teaser') ||
    yt[0] ||
    null
  );
}

async function details(type, id) {
  const t = type === 'tv' ? 'tv' : 'movie';
  const d = await tmdb('/' + t + '/' + id, {
    append_to_response: 'credits,videos,similar,recommendations,watch/providers,external_ids,images',
    include_image_language: 'ar,en,null'
  });
  let trailer = pickTrailer(d.videos);
  if (!trailer) {
    const en = await tmdb('/' + t + '/' + id + '/videos', { language: 'en-US' });
    trailer = pickTrailer({ results: en.results });
  }
  let overview = d.overview;
  if (!overview) {
    const en = await tmdb('/' + t + '/' + id, { language: 'en-US' });
    overview = en.overview || '';
  }
  const providers = ((d['watch/providers'] || {}).results || {});
  const prov = providers[REGION] || providers['US'] || null;
  return {
    id: d.id,
    type: t,
    title: d.title || d.name,
    original_title: d.original_title || d.original_name,
    tagline: d.tagline || '',
    overview,
    poster: d.poster_path,
    backdrop: d.backdrop_path,
    rating: d.vote_average ? Math.round(d.vote_average * 10) / 10 : null,
    votes: d.vote_count,
    date: d.release_date || d.first_air_date || '',
    runtime: d.runtime || (d.episode_run_time && d.episode_run_time[0]) || null,
    status: d.status,
    genres: (d.genres || []).map((g) => g.name),
    homepage: d.homepage || '',
    imdb: (d.external_ids && d.external_ids.imdb_id) || d.imdb_id || '',
    seasons: (d.seasons || []).filter((s) => s.season_number > 0).map((s) => ({
      number: s.season_number, name: s.name, episodes: s.episode_count, poster: s.poster_path, air_date: s.air_date
    })),
    cast: ((d.credits && d.credits.cast) || []).slice(0, 18).map((c) => ({
      id: c.id, name: c.name, character: c.character, photo: c.profile_path
    })),
    trailer: trailer ? { key: trailer.key, name: trailer.name } : null,
    similar: cards(((d.similar && d.similar.results) || []).concat((d.recommendations && d.recommendations.results) || []), t).slice(0, 20),
    providers: null
  };
}

// ---------- official YouTube channels (full licensed movies & episodes) ----------
const yt = require('./sources/youtube');

async function ytCatalog(kind, lang) {
  const key = `yt:${kind || ''}:${lang || ''}`;
  const hit = cacheGet(key);
  if (hit) return hit;
  const items = await yt.catalog(kind || null, lang || null);
  const out = { items };
  if (items.length) cacheSet(key, out, 3 * 60 * 60 * 1000);
  return out;
}

// ---------- free & legal streaming (Internet Archive, public domain) ----------
const IA = 'https://archive.org';
async function iaSearch(q, rows = 12, page = 1, sort = 'downloads desc') {
  const u = new URL(IA + '/advancedsearch.php');
  u.searchParams.set('q', q);
  ['identifier', 'title', 'year', 'downloads', 'description'].forEach((f) => u.searchParams.append('fl[]', f));
  u.searchParams.append('sort[]', sort);
  u.searchParams.set('rows', rows);
  u.searchParams.set('page', page);
  u.searchParams.set('output', 'json');
  const key = 'ia:' + u.searchParams.toString();
  const hit = cacheGet(key);
  if (hit) return hit;
  const r = await fetch(u, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error('archive ' + r.status);
  const j = await r.json();
  const docs = ((j.response && j.response.docs) || []).map((d) => ({
    id: d.identifier,
    title: d.title,
    year: d.year || '',
    thumb: IA + '/services/img/' + d.identifier
  }));
  cacheSet(key, docs, 6 * 60 * 60 * 1000);
  return docs;
}

async function iaStream(identifier) {
  const key = 'iastream:' + identifier;
  const hit = cacheGet(key);
  if (hit !== null && hit !== undefined) return hit;
  const r = await fetch(IA + '/metadata/' + identifier, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!r) return null;
  if (!r.ok) return null;
  const m = await r.json();
  if (!m.files || m.is_dark) { cacheSet(key, null, 60 * 60 * 1000); return null; }
  const rank = (f) => {
    const n = (f.name || '').toLowerCase();
    if (n.endsWith('.mp4')) return (f.format || '').includes('512Kb') ? 3 : 4;
    if (n.endsWith('.m4v')) return 3;
    if (n.endsWith('.ogv')) return 2;
    if (n.endsWith('.webm')) return 2;
    return 0;
  };
  const best = m.files.filter((f) => rank(f) > 0).sort((a, b) => rank(b) - rank(a))[0];
  if (!best) { cacheSet(key, null, 60 * 60 * 1000); return null; }
  const server = m.server || 'archive.org';
  const out = {
    id: identifier,
    url: 'https://' + server + (m.dir || '/download/' + identifier) + '/' + encodeURIComponent(best.name),
    fallback: IA + '/download/' + identifier + '/' + encodeURIComponent(best.name),
    type: best.name.toLowerCase().endsWith('.ogv') ? 'video/ogg' : best.name.toLowerCase().endsWith('.webm') ? 'video/webm' : 'video/mp4',
    title: (m.metadata && m.metadata.title) || identifier
  };
  cacheSet(key, out, 6 * 60 * 60 * 1000);
  return out;
}

function iaQuoted(s) {
  return String(s).replace(/["\\]/g, ' ').trim();
}

/** Find a free, legal (public-domain) copy of a title on the Internet Archive. */
async function findFree(title, year) {
  if (!title) return null;
  const t = iaQuoted(title);
  const queries = [
    `title:("${t}") AND mediatype:movies AND collection:(feature_films)`,
    `title:("${t}") AND mediatype:movies AND (collection:(feature_films) OR collection:(classic_tv) OR collection:(moviesandfilms))`
  ];
  for (const q of queries) {
    const docs = await iaSearch(q, 6);
    for (const d of docs) {
      if (year && d.year && Math.abs(Number(d.year) - Number(year)) > 1) continue;
      const s = await iaStream(d.id);
      if (s) return { ...s, year: d.year, source: 'archive.org' };
    }
  }
  return null;
}

async function freeCatalog(page, q) {
  const CLEAN = ' AND NOT title:(sex OR porn OR nude OR nudist OR erotic OR xxx OR adult)';
  const query = (q
    ? `title:("${iaQuoted(q)}") AND mediatype:movies AND collection:(feature_films)`
    : 'collection:(feature_films) AND mediatype:movies') + CLEAN;
  const docs = await iaSearch(query, 36, page || 1);
  const withStream = await Promise.all(docs.map(async (d) => {
    const s = await iaStream(d.id).catch(() => null);
    return s ? { ...d, url: s.url, mime: s.type } : null;
  }));
  return { items: withStream.filter(Boolean), page: Number(page || 1) };
}

const CLASSICS = require('./data/classics.json');

/** Curated list of famous American public-domain films, resolved to playable copies + TMDB art. */
async function classics() {
  const key = 'classics:v1';
  const hit = cacheGet(key);
  if (hit) return hit;
  const items = await Promise.all(CLASSICS.map(async (c) => {
    const [stream, meta] = await Promise.all([
      findFree(c.t, c.y).catch(() => null),
      tmdb('/search/movie', { query: c.t, year: String(c.y) }).catch(() => null)
    ]);
    if (!stream) return null;
    const m = meta && meta.results && meta.results[0];
    return {
      id: stream.id,
      title: c.ar,
      original_title: c.t,
      year: c.y,
      url: stream.url,
      mime: stream.type,
      poster: m ? m.poster_path : null,
      backdrop: m ? m.backdrop_path : null,
      overview: m ? m.overview || '' : '',
      rating: m && m.vote_average ? Math.round(m.vote_average * 10) / 10 : null
    };
  }));
  const out = { items: items.filter(Boolean) };
  cacheSet(key, out, 12 * 60 * 60 * 1000);
  return out;
}

async function season(id, num) {
  const d = await tmdb('/tv/' + id + '/season/' + num, {});
  return {
    name: d.name,
    overview: d.overview || '',
    episodes: (d.episodes || []).map((e) => ({
      number: e.episode_number,
      name: e.name,
      overview: e.overview || '',
      still: e.still_path,
      air_date: e.air_date,
      rating: e.vote_average ? Math.round(e.vote_average * 10) / 10 : null,
      runtime: e.runtime || null
    }))
  };
}

async function person(id) {
  const d = await tmdb('/person/' + id, { append_to_response: 'combined_credits' });
  const credits = ((d.combined_credits && d.combined_credits.cast) || [])
    .filter((c) => c.poster_path)
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
    .slice(0, 24);
  return {
    id: d.id,
    name: d.name,
    biography: d.biography || '',
    photo: d.profile_path,
    birthday: d.birthday || '',
    place: d.place_of_birth || '',
    known_for: cards(credits)
  };
}

// ---------- image proxy ----------
async function proxyImage(req, res, u) {
  const size = u.searchParams.get('s') || 'w500';
  const p = u.searchParams.get('p') || '';
  if (!/^\/[A-Za-z0-9._-]+$/.test(p)) { res.writeHead(400); return res.end('bad path'); }
  if (!/^(w\d+|original)$/.test(size)) { res.writeHead(400); return res.end('bad size'); }
  try {
    const r = await fetch(IMG + '/' + size + p);
    if (!r.ok) { res.writeHead(r.status); return res.end(); }
    res.writeHead(200, {
      'content-type': r.headers.get('content-type') || 'image/jpeg',
      'cache-control': 'public, max-age=604800'
    });
    const buf = Buffer.from(await r.arrayBuffer());
    res.end(buf);
  } catch (e) {
    res.writeHead(502); res.end('image error');
  }
}

// ---------- static ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const PUBLIC = path.join(__dirname, 'public');
function serveStatic(res, rel) {
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) {
      fs.readFile(path.join(PUBLIC, 'index.html'), (e2, html) => {
        if (e2) { res.writeHead(404); return res.end('not found'); }
        res.writeHead(200, { 'content-type': MIME['.html'] });
        res.end(html);
      });
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'public, max-age=300' });
    res.end(data);
  });
}

function sendJson(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=120' });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const p = u.pathname;
  try {
    if (p === '/img') return await proxyImage(req, res, u);
    if (p === '/api/home') return sendJson(res, await home());
    if (p === '/api/search') return sendJson(res, await search(u.searchParams.get('q'), u.searchParams.get('page')));
    if (p === '/api/browse') {
      return sendJson(res, await discover(u.searchParams.get('type'), {
        page: u.searchParams.get('page'),
        sort: u.searchParams.get('sort'),
        genre: u.searchParams.get('genre'),
        year: u.searchParams.get('year')
      }));
    }
    if (p === '/api/genres') return sendJson(res, await genres(u.searchParams.get('type')));
    if (p === '/api/yt') return sendJson(res, await ytCatalog(u.searchParams.get('kind'), u.searchParams.get('lang')));
    if (p === '/api/free') return sendJson(res, await freeCatalog(u.searchParams.get('page'), u.searchParams.get('q')));
    if (p === '/api/classics') return sendJson(res, await classics());
    if (p === '/api/free/stream') return sendJson(res, (await iaStream(u.searchParams.get('id'))) || { error: 'not playable' });
    if (p === '/api/watch') {
      return sendJson(res, (await findFree(u.searchParams.get('title'), u.searchParams.get('year'))) || { free: null });
    }
    let m;
    if ((m = p.match(/^\/api\/(movie|tv)\/(\d+)$/))) return sendJson(res, await details(m[1], m[2]));
    if ((m = p.match(/^\/api\/tv\/(\d+)\/season\/(\d+)$/))) return sendJson(res, await season(m[1], m[2]));
    if ((m = p.match(/^\/api\/person\/(\d+)$/))) return sendJson(res, await person(m[1]));
    if (p === '/api/health') return sendJson(res, { ok: true, cache: cache.size });
    return serveStatic(res, p === '/' ? 'index.html' : p.replace(/^\//, ''));
  } catch (err) {
    console.error(err.message);
    sendJson(res, { error: err.message }, 500);
  }
});

server.listen(PORT, () => {
  console.log('shashaty on ' + PORT);
  // warm slow catalogs so the first visitor never waits
  classics().catch(() => {});
  setInterval(() => classics().catch(() => {}), 11 * 60 * 60 * 1000);
});
