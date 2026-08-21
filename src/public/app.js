/* شاشتي — واجهة عربية لاستكشاف الأفلام والمسلسلات */
'use strict';
const view = document.getElementById('view');
const qbox = document.getElementById('q');

const img = (p, s) => (p ? `/img?p=${encodeURIComponent(p)}&s=${s || 'w342'}` : null);
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const api = (u) => fetch(u).then((r) => r.json());
const loader = () => '<div class="loader"><div></div></div>';

/* ---------- storage ---------- */
const LS = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
};
const listKey = 'shashaty:list';
const watchedKey = 'shashaty:watched';
const getList = () => LS.get(listKey, []);
const inList = (type, id) => getList().some((x) => x.type === type && x.id === +id);
function toggleList(item) {
  const l = getList();
  const i = l.findIndex((x) => x.type === item.type && x.id === +item.id);
  if (i >= 0) l.splice(i, 1); else l.unshift({ ...item, id: +item.id, added: Date.now() });
  LS.set(listKey, l);
  return i < 0;
}
const getWatched = () => LS.get(watchedKey, {});
function toggleEp(tvId, s, e) {
  const w = getWatched();
  const k = `${tvId}`;
  w[k] = w[k] || [];
  const tag = `${s}x${e}`;
  const i = w[k].indexOf(tag);
  if (i >= 0) w[k].splice(i, 1); else w[k].push(tag);
  LS.set(watchedKey, w);
  return i < 0;
}
const isWatched = (tvId, s, e) => (getWatched()[`${tvId}`] || []).includes(`${s}x${e}`);


/* ---------- icons ---------- */
const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5"/></svg>',
  book: '<svg viewBox="0 0 24 24"><path d="M6 4h12v17l-6-4.5L6 21z"/></svg>',
  free: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9 9h6M9 12h4M11 9v7"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8z" fill="currentColor" stroke="none"/></svg>'
};

/* ---------- in-app player ---------- */
const playerEl = document.getElementById('player');
const pbody = document.getElementById('pbody');
const ptitle = document.getElementById('ptitle');
document.getElementById('pclose').onclick = closePlayer;
function openPlayer(title, html) {
  ptitle.textContent = title;
  pbody.innerHTML = html;
  playerEl.hidden = false;
  document.body.style.overflow = 'hidden';
}
function closePlayer() {
  playerEl.hidden = true;
  pbody.innerHTML = '';
  document.body.style.overflow = '';
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !playerEl.hidden) closePlayer(); });

function playTrailer(d) {
  if (!d.trailer) return false;
  openPlayer('الإعلان · ' + d.title,
    `<iframe src="https://www.youtube.com/embed/${d.trailer.key}?rel=0&autoplay=1&hl=ar" allowfullscreen allow="autoplay;encrypted-media;picture-in-picture"></iframe>`);
  return true;
}
function playFile(title, url, type) {
  openPlayer(title, `<video controls autoplay playsinline preload="metadata"><source src="${url}" type="${type || 'video/mp4'}"></video>`);
}
async function startWatch(d, type) {
  openPlayer(d.title, '<div class="loader"><div></div></div>');
  let free = null;
  if (type === 'movie') {
    try {
      free = await api(`/api/watch?title=${encodeURIComponent(d.original_title || d.title)}&year=${(d.date || '').slice(0, 4)}`);
    } catch (e) { free = null; }
  }
  if (free && free.url) return playFile(d.title + ' (نسخة مجانية · Archive.org)', free.url, free.type);
  if (playTrailer(d)) return;
  closePlayer();
  alert('ما لقيناش نسخة مجانية قانونية ولا إعلان لهذا العمل.');
}
async function loadFreeBadge(d) {
  const box = document.getElementById('trbox');
  if (!box) return;
  if (d.type === 'movie') {
    try {
      const free = await api(`/api/watch?title=${encodeURIComponent(d.original_title || d.title)}&year=${(d.date || '').slice(0, 4)}`);
      if (free && free.url) {
        box.innerHTML = `<div class="freebar">${ICON.free} متوفّر مجانًا وقانونيًا (ملكية عامة · Archive.org) — اضغط «مشاهدة»</div>`;
        return;
      }
    } catch (e) { /* ignore */ }
  }
  box.innerHTML = d.trailer ? `<div class="freebar" style="color:var(--mut)">${ICON.play} زر «مشاهدة» يشغّل الإعلان الرسمي داخل التطبيق</div>` : '';
}

/* ---------- free & legal watching: official YouTube channels + public domain ---------- */
const FREE_TABS = [
  { k: 'ar-movie', label: 'أفلام عربية', api: '/api/yt?kind=movie&lang=ar' },
  { k: 'ar-tv', label: 'مسلسلات عربية', api: '/api/yt?kind=tv&lang=ar' },
  { k: 'en-movie', label: 'أفلام أجنبية', api: '/api/yt?kind=movie&lang=en' },
  { k: 'classic', label: 'كلاسيكيات أمريكية', api: '/api/classics' },
  { k: 'archive', label: 'أرشيف مجاني', api: '/api/free' },
];
function playYT(title, id) {
  openPlayer(title, `<iframe src="https://www.youtube.com/embed/${id}?rel=0&autoplay=1&hl=ar" allowfullscreen allow="autoplay;encrypted-media;picture-in-picture"></iframe>`);
}
function dur(sec) {
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  return h ? `${h}س ${m}د` : `${m}د`;
}
function freeChips(active) {
  return `<div class="chips">${FREE_TABS.map((t) => `<a class="chip${t.k === active ? ' on' : ''}" href="#/free/${t.k}">${t.label}</a>`).join('')}</div>`;
}
async function pageFree(tab, page) {
  tab = FREE_TABS.some((t) => t.k === tab) ? tab : 'ar-movie';
  const t = FREE_TABS.find((x) => x.k === tab);
  const head = `<h2 class="sec">مشاهدة مجانية بالكامل</h2>${freeChips(tab)}`;
  view.innerHTML = head + `<div class="freebar">${ICON.free} محتوى كامل ومجاني من مصادر رسمية — يُشغَّل داخل التطبيق</div>${loader()}`;
  if (tab === 'classic') return pageClassics(head);
  if (tab === 'archive') return pageClassic(head, Number(page || 1));
  const d = await api(t.api);
  const items = (d && d.items) || [];
  view.innerHTML = head +
    `<div class="freebar">${ICON.free} حلقات وأفلام كاملة من القنوات الرسمية لأصحاب الحقوق (روتانا، MBC، Popcornflix، FilmRise)</div>
    <div class="wgrid">${items.map((v) => `<a class="wcard" data-yt="${esc(v.id)}" data-t="${esc(v.title)}">
      <div class="wthumb"><img loading="lazy" src="${esc(v.thumb)}" alt=""><div class="tag">${esc(dur(v.duration))}</div>
      <span class="wplay">${ICON.play}</span></div>
      <div class="t">${esc(v.title)}</div><div class="y">${esc(v.channel)}</div></a>`).join('')}</div>
    ${items.length ? '' : '<p class="ov">تعذّر جلب القائمة الآن، أعد المحاولة بعد قليل.</p>'}${attribution}`;
  view.querySelectorAll('[data-yt]').forEach((a) => a.onclick = () => playYT(a.dataset.t, a.dataset.yt));
}
async function pageClassics(head) {
  const d = await api('/api/classics');
  const items = (d && d.items) || [];
  view.innerHTML = head +
    `<div class="freebar">${ICON.free} أفلام أمريكية مشهورة انتهت حقوق نشرها — مشاهدة كاملة وقانونية داخل التطبيق</div>
    <div class="grid">${items.map((f) => `<a class="poster" data-url="${esc(f.url)}" data-mime="${esc(f.mime || 'video/mp4')}" data-t="${esc(f.title)}">
      <div class="ph">${f.poster ? `<img loading="lazy" src="${img(f.poster, 'w342')}" alt="">` : ''}
      ${f.rating ? `<div class="badge">★ ${f.rating}</div>` : ''}<div class="tag">مجاني</div><span class="wplay">${ICON.play}</span></div>
      <div class="t">${esc(f.title)}</div><div class="y">${esc(f.original_title)} · ${esc(f.year)}</div></a>`).join('')}</div>
    ${items.length ? '' : '<p class="ov">تعذّر جلب القائمة الآن، أعد المحاولة بعد قليل.</p>'}${attribution}`;
  view.querySelectorAll('[data-url]').forEach((a) => a.onclick = () => playFile(a.dataset.t, a.dataset.url, a.dataset.mime));
}
async function pageClassic(head, page) {
  const d = await api('/api/free?page=' + page);
  view.innerHTML = head +
    `<div class="freebar">${ICON.free} كلاسيكيات بالملكية العامة — مشاهدة كاملة وقانونية داخل التطبيق</div>
    <div class="grid">${d.items.map((f) => `<a class="poster" data-free="${esc(f.id)}" data-t="${esc(f.title)}" data-url="${esc(f.url || '')}" data-mime="${esc(f.mime || 'video/mp4')}">
      <div class="ph"><img loading="lazy" src="${esc(f.thumb)}" alt=""><div class="tag">مجاني</div></div>
      <div class="t">${esc(f.title)}</div><div class="y">${esc(f.year || '')}</div></a>`).join('')}</div>
    <div class="acts" style="justify-content:center">
      ${page > 1 ? '<button class="btn ghost" id="fprev">السابق</button>' : ''}
      <button class="btn" id="fnext">التالي</button></div>${attribution}`;
  view.querySelectorAll('[data-free]').forEach((a) => a.onclick = async () => {
    if (a.dataset.url) return playFile(a.dataset.t, a.dataset.url, a.dataset.mime);
    openPlayer(a.dataset.t, '<div class="loader"><div></div></div>');
    const s = await api('/api/free/stream?id=' + encodeURIComponent(a.dataset.free));
    if (s && s.url) playFile(a.dataset.t, s.url, s.type);
    else { closePlayer(); alert('هذا العنصر غير قابل للتشغيل.'); }
  });
  const nx = document.getElementById('fnext'), pv = document.getElementById('fprev');
  if (nx) nx.onclick = () => { location.hash = '#/free/archive/' + (page + 1); };
  if (pv) pv.onclick = () => { location.hash = '#/free/archive/' + (page - 1); };
}

/* ---------- components ---------- */
function posterCard(c) {
  const badge = c.rating ? `<div class="badge">★ ${c.rating}</div>` : '';
  const tag = `<div class="tag">${c.type === 'tv' ? 'مسلسل' : 'فيلم'}</div>`;
  const src = img(c.poster || c.backdrop, 'w342');
  return `<a class="poster" href="#/${c.type}/${c.id}">
    <div class="ph">${src ? `<img loading="lazy" src="${src}" alt="${esc(c.title)}">` : ''}${badge}${tag}</div>
    <div class="t">${esc(c.title)}</div><div class="y">${esc(c.year)}</div></a>`;
}
const rowHtml = (r) => `<h2 class="sec">${esc(r.title)}</h2><div class="row">${r.items.map(posterCard).join('')}</div>`;
const gridHtml = (items) => `<div class="grid">${items.map(posterCard).join('')}</div>`;
const attribution = '<footer class="attr">البيانات من TMDB · This product uses the TMDB API but is not endorsed or certified by TMDB.</footer>';

/* ---------- pages ---------- */
let heroTimer = null;
async function pageHome() {
  view.innerHTML = loader();
  const d = await api('/api/home');
  const slides = d.hero.map((h, i) => `<div class="slide${i === 0 ? ' on' : ''}">
      <img src="${img(h.backdrop, 'w780')}" alt="${esc(h.title)}"><div class="grad"></div>
      <div class="meta"><h1>${esc(h.title)}</h1><p>${esc(h.overview)}</p>
      <a class="btn" href="#/${h.type}/${h.id}">التفاصيل</a></div></div>`).join('');
  view.innerHTML = `<section class="hero">${slides}<div class="dots">${d.hero.map((_, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}</div></section>
    ${d.rows.map(rowHtml).join('')}${attribution}`;
  const sl = view.querySelectorAll('.hero .slide');
  const dots = view.querySelectorAll('.dots i');
  let idx = 0;
  clearInterval(heroTimer);
  closePlayer();
  if (sl.length > 1) heroTimer = setInterval(() => {
    sl[idx].classList.remove('on'); dots[idx].classList.remove('on');
    idx = (idx + 1) % sl.length;
    sl[idx].classList.add('on'); dots[idx].classList.add('on');
  }, 5000);
}

const SORTS = [
  ['popularity.desc', 'الأكثر شعبية'],
  ['vote_average.desc', 'الأعلى تقييمًا'],
  ['primary_release_date.desc', 'الأحدث'],
  ['revenue.desc', 'الأعلى إيرادًا']
];
let browseState = { type: 'movie', genre: '', sort: 'popularity.desc', page: 1, items: [], total: 1 };

async function pageBrowse(type) {
  if (browseState.type !== type) browseState = { type, genre: '', sort: 'popularity.desc', page: 1, items: [], total: 1 };
  view.innerHTML = loader();
  const gs = await api('/api/genres?type=' + type);
  const sorts = SORTS.map(([v, l]) => `<div class="chip${browseState.sort === v ? ' on' : ''}" data-sort="${v}">${l}</div>`).join('');
  const genres = [`<div class="chip${!browseState.genre ? ' on' : ''}" data-genre="">الكل</div>`]
    .concat(gs.map((g) => `<div class="chip${browseState.genre == g.id ? ' on' : ''}" data-genre="${g.id}">${esc(g.name)}</div>`)).join('');
  view.innerHTML = `<h2 class="sec">${type === 'tv' ? 'المسلسلات' : 'الأفلام'}</h2>
    <div class="filters">${sorts}</div><div class="filters">${genres}</div>
    <div id="res">${loader()}</div>${attribution}`;
  view.querySelectorAll('[data-sort]').forEach((c) => c.onclick = () => { browseState.sort = c.dataset.sort; browseState.page = 1; pageBrowse(type); });
  view.querySelectorAll('[data-genre]').forEach((c) => c.onclick = () => { browseState.genre = c.dataset.genre; browseState.page = 1; pageBrowse(type); });
  const res = document.getElementById('res');
  const d = await api(`/api/browse?type=${type}&sort=${browseState.sort}&genre=${browseState.genre}&page=${browseState.page}`);
  res.innerHTML = d.items.length ? gridHtml(d.items) + pager(d) : '<div class="empty">لا توجد نتائج</div>';
  bindPager(type);
}
const pager = (d) => `<div class="acts" style="justify-content:center">
  ${d.page > 1 ? '<button class="btn ghost" id="prev">السابق</button>' : ''}
  <span style="align-self:center;color:var(--mut);font-size:13px">صفحة ${d.page} / ${d.total_pages}</span>
  ${d.page < d.total_pages ? '<button class="btn" id="next">التالي</button>' : ''}</div>`;
function bindPager(type) {
  const n = document.getElementById('next'), p = document.getElementById('prev');
  if (n) n.onclick = () => { browseState.page++; pageBrowse(type); window.scrollTo(0, 0); };
  if (p) p.onclick = () => { browseState.page--; pageBrowse(type); window.scrollTo(0, 0); };
}

async function pageSearch(q) {
  view.innerHTML = `<h2 class="sec">نتائج البحث: ${esc(q)}</h2>${loader()}`;
  const d = await api('/api/search?q=' + encodeURIComponent(q));
  view.innerHTML = `<h2 class="sec">نتائج البحث: ${esc(q)}</h2>` +
    (d.items.length ? gridHtml(d.items) : '<div class="empty">ما لقينا والو 🤷</div>') + attribution;
}

function pageList() {
  const l = getList();
  view.innerHTML = `<h2 class="sec">قائمتي (${l.length})</h2>` +
    (l.length ? gridHtml(l) : '<div class="empty">قائمتك فارغة — زيد أعمالًا بزر «لاحقًا»</div>') + attribution;
}

async function pageDetail(type, id) {
  view.innerHTML = loader();
  const d = await api(`/api/${type}/${id}`);
  if (d.error) { view.innerHTML = '<div class="empty">تعذّر جلب البيانات</div>'; return; }
  const saved = inList(type, id);
  const rt = d.runtime ? `${d.runtime} د` : '';
  view.innerHTML = `
  <section class="dback">
    ${d.backdrop ? `<img src="${img(d.backdrop, 'w780')}" alt="">` : ''}<div class="grad"></div>
    <div class="back" onclick="history.back()">→</div>
  </section>
  <div class="dhead">
    ${d.poster ? `<img src="${img(d.poster, 'w342')}" alt="">` : ''}
    <div><h1>${esc(d.title)}</h1>
      <div class="dmeta">
        ${d.rating ? `<span class="star">★ ${d.rating}</span>` : ''}
        <span>${esc((d.date || '').slice(0, 4))}</span>${rt ? `<span>${rt}</span>` : ''}
        <span>${type === 'tv' ? 'مسلسل' : 'فيلم'}</span>
      </div></div>
  </div>
  <div class="chips">${d.genres.map((g) => `<span class="g">${esc(g)}</span>`).join('')}</div>
  <div class="acts">
    <button class="btn" id="watch">${ICON.play} مشاهدة</button>
    <button class="btn ghost" id="save">${saved ? ICON.check + ' في قائمتي' : ICON.book + ' لاحقًا'}</button>
  </div>
  ${d.tagline ? `<p class="ov" style="color:var(--mut);font-style:italic">${esc(d.tagline)}</p>` : ''}
  <p class="ov">${esc(d.overview || 'لا يوجد وصف بالعربية لهذا العمل.')}</p>
  <div id="trbox"></div>
  ${type === 'tv' && d.seasons.length ? '<h2 class="sec">المواسم</h2><div class="seasonbar" id="sbar"></div><div id="eps"></div>' : ''}
  ${d.cast.length ? `<h2 class="sec">طاقم التمثيل</h2><div class="people">${d.cast.map((c) => `<a class="person" href="#/person/${c.id}">
      ${c.photo ? `<img loading="lazy" src="${img(c.photo, 'w185')}" alt="">` : '<div class="noimg"></div>'}
      <div class="n">${esc(c.name)}</div><div class="c">${esc(c.character)}</div></a>`).join('')}</div>` : ''}
  ${d.similar.length ? rowHtml({ title: 'أعمال مشابهة', items: d.similar }) : ''}
  ${attribution}`;

  document.getElementById('save').onclick = (e) => {
    const now = toggleList({ id: d.id, type, title: d.title, poster: d.poster, backdrop: d.backdrop, year: (d.date || '').slice(0, 4), rating: d.rating });
    document.getElementById('save').innerHTML = (now ? ICON.check + ' في قائمتي' : ICON.book + ' لاحقًا');
  };
  document.getElementById('watch').onclick = () => startWatch(d, type);
  if (d.trailer) loadFreeBadge(d);
  if (type === 'tv' && d.seasons.length) {
    const sbar = document.getElementById('sbar');
    sbar.innerHTML = d.seasons.map((s, i) => `<div class="chip${i === 0 ? ' on' : ''}" data-s="${s.number}">${esc(s.name)}</div>`).join('');
    sbar.querySelectorAll('[data-s]').forEach((c) => c.onclick = () => {
      sbar.querySelectorAll('.chip').forEach((x) => x.classList.remove('on'));
      c.classList.add('on');
      loadSeason(id, c.dataset.s);
    });
    loadSeason(id, d.seasons[0].number);
  }
}

async function loadSeason(tvId, num) {
  const box = document.getElementById('eps');
  box.innerHTML = loader();
  const s = await api(`/api/tv/${tvId}/season/${num}`);
  box.innerHTML = (s.episodes || []).map((e) => `<div class="ep">
    ${e.still ? `<img loading="lazy" src="${img(e.still, 'w185')}" alt="">` : '<div class="noimg"></div>'}
    <div style="flex:1">
      <div class="en">${e.number}. ${esc(e.name)}</div>
      <div class="eo">${esc(e.overview)}</div>
      <div class="ed">${esc(e.air_date || '')}${e.rating ? ' · ★ ' + e.rating : ''}</div>
    </div>
    <button class="epwatch${isWatched(tvId, num, e.number) ? ' on' : ''}" data-e="${e.number}">✓</button>
  </div>`).join('') || '<div class="empty">لا توجد حلقات</div>';
  box.querySelectorAll('.epwatch').forEach((b) => b.onclick = () => {
    const on = toggleEp(tvId, num, b.dataset.e);
    b.classList.toggle('on', on);
  });
}

async function pagePerson(id) {
  view.innerHTML = loader();
  const p = await api('/api/person/' + id);
  view.innerHTML = `<div class="dhead" style="margin-top:16px">
      ${p.photo ? `<img src="${img(p.photo, 'w185')}" alt="">` : ''}
      <div><h1 style="margin-top:0">${esc(p.name)}</h1>
      <div class="dmeta">${esc(p.birthday || '')}${p.place ? ' · ' + esc(p.place) : ''}</div></div></div>
    ${p.biography ? `<p class="ov">${esc(p.biography.slice(0, 900))}</p>` : ''}
    <h2 class="sec">أشهر أعماله</h2>${gridHtml(p.known_for)}${attribution}`;
}

/* ---------- router ---------- */
function setTab(name) {
  document.querySelectorAll('.bottomnav a').forEach((a) => a.classList.toggle('on', a.dataset.tab === name));
}
function route() {
  const h = location.hash.replace(/^#/, '') || '/';
  const parts = h.split('/').filter(Boolean);
  window.scrollTo(0, 0);
  clearInterval(heroTimer);
  if (!parts.length) { setTab('home'); return pageHome(); }
  if (parts[0] === 'browse') { setTab(parts[1] === 'tv' ? 'tv' : 'movie'); return pageBrowse(parts[1] === 'tv' ? 'tv' : 'movie'); }
  if (parts[0] === 'list') { setTab('list'); return pageList(); }
  if (parts[0] === 'free') { setTab('free'); return pageFree(parts[1], parts[2]); }
  if (parts[0] === 'search') { setTab(''); return pageSearch(decodeURIComponent(parts[1] || '')); }
  if (parts[0] === 'person') { setTab(''); return pagePerson(parts[1]); }
  if (parts[0] === 'movie' || parts[0] === 'tv') { setTab(''); return pageDetail(parts[0], parts[1]); }
  return pageHome();
}
window.addEventListener('hashchange', route);

let t = null;
qbox.addEventListener('input', () => {
  clearTimeout(t);
  const v = qbox.value.trim();
  t = setTimeout(() => {
    if (v.length >= 2) location.hash = '#/search/' + encodeURIComponent(v);
    else if (!v) location.hash = '#/';
  }, 450);
});

route();
