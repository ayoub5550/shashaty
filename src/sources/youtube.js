'use strict';
// مصدر «أفلام ومسلسلات كاملة» من قنوات يوتيوب الرسمية فقط (محتوى قانوني مرخّص من أصحابه).
// لا يستعمل أي مصدر قرصنة. لا يحتاج مفتاح API.

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// قنوات رسمية تملك حقوق ما تنشره
const CHANNELS = [
  { id: 'UCJY3eGNWSFRi5YnQiUyIgRA', name: 'روتانا كلاسيك', kind: 'movie', lang: 'ar' },
  { id: 'UC39t9YJ_RzgKmmAkq19lhYw', name: 'روتانا سينما', kind: 'movie', lang: 'ar' },
  { id: 'UCgDOoM3UddKJZqrz455A_2Q', name: 'روتانا سينما KSA', kind: 'movie', lang: 'ar' },
  { id: 'UCV1wDrghZcIGo6CuMUSCu2w', name: 'روتانا كوميدي', kind: 'movie', lang: 'ar' },
  { id: 'UCNhqvQMXIgRfjAGmxQqdNRw', name: 'روتانا', kind: 'movie', lang: 'ar' },
  { id: 'UCBAEVMr0li9YYF8IwZHfusw', name: 'MBC دراما', kind: 'tv', lang: 'ar' },
  { id: 'UCokgtRLAWKNPdfFMaSfLLbA', name: 'شاهد MBC', kind: 'tv', lang: 'ar' },
  { id: 'UCaINvog8ZkYAWGjiFiUs-zA', name: 'MBC تركيا', kind: 'tv', lang: 'ar' },
  { id: 'UCPvObfhnwu_QNi6mc4z5UPQ', name: 'MBC1', kind: 'tv', lang: 'ar' },
  { id: 'UCLnQlfpGY1OSJ8HUlYRnvqw', name: 'MBC4', kind: 'tv', lang: 'ar' },
  { id: 'UCOSY1uNYaW53aQgLE8YcozQ', name: 'MBC العراق', kind: 'tv', lang: 'ar' },
  { id: 'UCX1nchEcBshItKBeJvH-YMw', name: 'Popcornflix', kind: 'movie', lang: 'en' },
  { id: 'UCU4BHh9Dwfd7-I_xTZ5037Q', name: 'FilmRise Movies', kind: 'movie', lang: 'en' },
];

function parseDuration(txt) {
  if (!txt) return 0;
  const p = String(txt).split(':').map((n) => parseInt(n, 10));
  if (p.some(isNaN)) return 0;
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : 0;
}

function collect(node, out) {
  if (!node || typeof node !== 'object') return;
  if (node.lockupViewModel) {
    const l = node.lockupViewModel;
    const vid = l.contentId;
    let title = '';
    let dur = 0;
    (function walk(o) {
      if (!o || typeof o !== 'object') return;
      if (!title && o.lockupMetadataViewModel && o.lockupMetadataViewModel.title) {
        title = o.lockupMetadataViewModel.title.content || '';
      }
      if (!dur && o.thumbnailBadgeViewModel && o.thumbnailBadgeViewModel.text) {
        dur = parseDuration(o.thumbnailBadgeViewModel.text);
      }
      for (const k in o) walk(o[k]);
    })(l);
    if (vid && title) out.push({ id: vid, title, duration: dur });
  }
  if (node.videoRenderer && node.videoRenderer.videoId) {
    const v = node.videoRenderer;
    const title = v.title && (v.title.simpleText || (v.title.runs && v.title.runs[0].text));
    const dur = parseDuration(v.lengthText && v.lengthText.simpleText);
    if (title) out.push({ id: v.videoId, title, duration: dur });
  }
  for (const k in node) collect(node[k], out);
}

async function fetchPage(url) {
  const r = await fetch(url, {
    headers: { 'user-agent': UA, 'accept-language': 'ar' },
    signal: AbortSignal.timeout(12000),
  }).catch(() => null);
  if (!r || !r.ok) return [];
  const html = await r.text();
  const m = html.match(/var ytInitialData = (\{.+?\});<\/script>/s);
  if (!m) return [];
  let data;
  try {
    data = JSON.parse(m[1]);
  } catch {
    return [];
  }
  const out = [];
  collect(data, out);
  return out;
}

// أفلام = مدة ≥ 45 دقيقة، حلقات مسلسلات = ≥ 18 دقيقة
const MIN = { movie: 45 * 60, tv: 18 * 60 };

const QUERIES = {
  ar: { movie: ['فيلم', 'الفيلم كامل', 'فيلم كامل'], tv: ['مسلسل الحلقة', 'حلقة كاملة'] },
  en: { movie: ['full movie', 'movie'], tv: ['full episode'] },
};

async function channelItems(ch) {
  const base = `https://www.youtube.com/channel/${ch.id}`;
  const urls = [
    `${base}/videos`,
    `${base}/videos?view=0&sort=p`,
    ...(QUERIES[ch.lang][ch.kind] || []).map((q) => `${base}/search?query=${encodeURIComponent(q)}`),
  ];
  const lists = await Promise.all(urls.map((u) => fetchPage(u).catch(() => [])));
  const seen = new Set();
  const items = [];
  for (const v of lists.flat()) {
    if (seen.has(v.id)) continue;
    if (v.duration < MIN[ch.kind]) continue;
    seen.add(v.id);
    items.push({
      id: v.id,
      title: v.title.replace(/\s*[\|\-–]\s*(بطولة|Full Movie|فيلم كامل).*$/i, '').trim(),
      duration: v.duration,
      thumb: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
      channel: ch.name,
      kind: ch.kind,
      lang: ch.lang,
    });
  }
  return items;
}

async function catalog(kind, lang) {
  const chs = CHANNELS.filter((c) => (!kind || c.kind === kind) && (!lang || c.lang === lang));
  const res = await Promise.all(chs.map((c) => channelItems(c).catch(() => [])));
  // ترتيب متداخل بين القنوات حتى لا تسيطر قناة واحدة على أول الصفحة
  const lists = res.filter((l) => l.length);
  const merged = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) {
    for (const l of lists) if (i < l.length) merged.push(l[i]);
  }
  return merged;
}

module.exports = { catalog, CHANNELS };
