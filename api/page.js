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
const DROG = require('./_drog');

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
    // Týnd mynd eða vélmenni sem leitar að /.env á ekki að fá 3 kB af HTML.
    const asked = String((req.headers && req.headers['x-cms-path']) || url.searchParams.get('p') || '');
    const hasExt = /\.[a-z0-9]{1,5}$/i.test(asked) && !/\.html?$/i.test(asked);
    const wantsHtml = /\btext\/html\b/.test(String((req.headers && req.headers.accept) || ''));
    res.statusCode = 404;
    res.setHeader('Cache-Control', 'public, max-age=300');
    if (hasExt || !wantsHtml) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.end('Not found');
    }
    const fallback = readPage('cms/404.html') || '<!doctype html><title>404</title><p>Síða fannst ekki';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(fallback);
  }

  // Falin síða (api/_drog.js): aðeins innskráðir eigendur fá hana — á ÖLLUM útgáfum.
  // Forskoðanir hafa enga innskráningu, og deilitengill („Anyone with the link") opnar
  // þær hverjum sem er; þar fær því enginn síðuna. Hún sést staðbundið í server.js.
  const drog = Object.prototype.hasOwnProperty.call(DROG, name);
  if (drog && !S.sessionEmail(req)) {
    // Eigandi sem ætlar að breyta (?cms=1) fer í innskráninguna og kemur svo aftur hingað,
    // eins og á öðrum síðum. Allir aðrir fá síðuna á listanum, eins og þessi væri ekki til.
    const editing = /[?&]cms=1(&|$)/.test(url.search);
    const to = editing ? '/admin?next=' + encodeURIComponent('/' + name.slice(0, -5) + '?cms=1') : DROG[name];
    res.statusCode = 302;
    res.setHeader('Location', to);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    return res.end();
  }

  let out = html;
  let contentOk = true;
  try {
    const content = await S.readJSON('content', null, { strict: true });
    // Taggið fer ALLTAF inn, líka tómt: þá veit cms-inject að efnið er komið og
    // gesturinn sækir ekki allt content.json að óþörfu.
    const json = preloadFor(content || {}, name) || '{}';
    const tag = '<script id="cms-preload">window.__CMS_PRELOAD__=' + json + '</script>\n';
    // Efnið verður að standa Á UNDAN cms-inject.js, annars les skriftin það ekki.
    const i = out.indexOf('<script src="cms/cms-inject.js"');
    if (i >= 0) out = out.slice(0, i) + tag + '  ' + out.slice(i);
    else if (out.includes('</head>')) out = out.replace('</head>', tag + '</head>');
  } catch (e) {
    // Efnið má aldrei fella síðuna — hún birtist þá eins og hún er í kóðanum.
    // En þá má hraðnetið EKKI geyma hana, annars festist útgáfa án efnis eigandans.
    contentOk = false;
    console.error('preload failed:', e.message);
  }

  if (drog) {
    // Ritillinn sýnir „Falin síða“ svo eigendurnir viti að gestir sjá hana ekki
    // (í <head>, svo það hliðri ekki staðsetningarlyklum efnisins í <body>).
    out = out.replace('</head>', '<script>window.__CMS_DROG__=1</script>\n</head>');
  }

  const editing = /[?&]cms=1/.test(req.url || '');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Gestir fá síðuna úr hraðneti Vercel í 15 sek. í senn; eigandinn í ritham fær hana alltaf ferska.
  // Falin síða má ALDREI fara í hraðnetið: þá fengi næsti gestur eintak eigandans.
  res.setHeader('Cache-Control', drog
    ? 'private, no-store'
    : (editing || !contentOk)
      ? 'no-store'
      : 'public, max-age=0, s-maxage=15, stale-while-revalidate=60');
  if (drog || (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production')) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');   // forskoðanir og faldar síður mega ekki lenda í Google
  }
  res.end(out);
};
