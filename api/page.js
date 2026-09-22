/* Allar .html-síður fara hér í gegn (sjá middleware.js).
 *
 * Ástæðan er ein: efnið sem eigandinn vistar í CMS-inu verður að vera komið inn í
 * síðuna ÁÐUR en vafrinn teiknar hana. Annars birtist síðan fyrst eins og hún er í
 * kóðanum og hnikast svo til þegar breytingarnar berast — það var sýnilega hoppið.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const S = require('./_store');

const ROOTS = [process.cwd(), path.join(__dirname, '..')];
const BUCKETS = ['texts', 'images', 'bg', 'html', 'hidden', 'order', 'style', 'settings'];

const fileCache = new Map();
function readPage(name) {
  if (fileCache.has(name)) return fileCache.get(name);
  let html = null;
  for (const root of ROOTS) {
    try { html = fs.readFileSync(path.join(root, name), 'utf8'); break; } catch (e) { }
  }
  fileCache.set(name, html);
  return html;
}

// Aðeins raunverulegar síður í rót verkefnisins — engin leið út úr möppunni.
function safeName(raw) {
  const p = String(raw || '').split('?')[0].split('#')[0];
  const base = p.replace(/^\/+/, '');
  if (!/^[A-Za-z0-9._-]+\.html$/.test(base)) return null;
  if (base.includes('..')) return null;
  return base;
}

function preloadFor(content, pageName) {
  const slice = {};
  let has = false;
  for (const k of BUCKETS) {
    const page = (content[k] || {})[pageName];
    if (page && Object.keys(page).length) { slice[k] = { [pageName]: page }; has = true; }
  }
  if (!has) return null;
  return JSON.stringify(slice).replace(/</g, '\\u003c');
}

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const name = safeName(url.searchParams.get('p') || 'index.html');
  const html = name ? readPage(name) : null;

  if (!html) {
    const fallback = readPage('cms/404.html') || '<!doctype html><title>404</title><p>Síða fannst ekki';
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(fallback);
  }

  let out = html;
  try {
    const content = await S.readJSON('content', S.EMPTY_CONTENT);
    const json = preloadFor(content, name);
    if (json) {
      const tag = '<script id="cms-preload">window.__CMS_PRELOAD__=' + json + '</script>\n';
      // Efnið verður að standa Á UNDAN cms-inject.js, annars les skriftin það ekki.
      const i = out.indexOf('<script src="cms/cms-inject.js"');
      if (i >= 0) out = out.slice(0, i) + tag + '  ' + out.slice(i);
      else if (out.includes('</head>')) out = out.replace('</head>', tag + '</head>');
    }
  } catch (e) {
    // Efnið má aldrei fella síðuna — hún birtist þá eins og hún er í kóðanum.
    console.error('preload failed:', e.message);
  }

  const editing = /[?&]cms=1/.test(req.url || '');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Gestir fá síðuna úr hraðneti Vercel í 15 sek. í senn; eigandinn í ritham fær hana alltaf ferska.
  res.setHeader('Cache-Control', editing
    ? 'no-store'
    : 'public, max-age=0, s-maxage=15, stale-while-revalidate=60');
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');   // forskoðunarslóðir mega ekki lenda í Google
  }
  res.end(out);
};
