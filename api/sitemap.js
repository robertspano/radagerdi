/* sitemap.xml — búið til úr síðunum sjálfum við hverja beiðni.
 *
 * Áður var þetta handskrifuð skrá sem gleymdist að uppfæra þegar síða bættist við,
 * var endurnefnd eða tekin út. Hér er reglan ein og sjálfbær:
 *
 *   síða fer í sitemap ef — og aðeins ef — hún vísar á SJÁLFA SIG með rel="canonical"
 *   á aðalléninu og ber ekki noindex.
 *
 * Þar með detta gömlu áframsendingarsíðurnar sjálfkrafa út (þær vísa annað og bera
 * noindex), og ný síða kemst inn um leið og hún fær rétt canonical-merki.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const HOST = 'https://radagerdi.is';
const ROOTS = [process.cwd(), path.join(__dirname, '..')];

function listPages() {
  for (const root of ROOTS) {
    try {
      const files = fs.readdirSync(root).filter(f => f.endsWith('.html'));
      if (files.length) return { root, files };
    } catch (e) { }
  }
  return { root: null, files: [] };
}

let cache = null;
function build() {
  if (cache && Date.now() - cache.t < 60000) return cache.xml;
  const { root, files } = listPages();
  const urls = [];
  for (const f of files.sort()) {
    let html;
    try { html = fs.readFileSync(path.join(root, f), 'utf8'); } catch (e) { continue; }
    if (/<meta[^>]*name=["']robots["'][^>]*noindex/i.test(html)) continue;
    const m = html.match(/rel=["']canonical["']\s+href=["']([^"']+)["']/i);
    if (!m) continue;
    const canonical = m[1];
    const self = HOST + '/' + (f === 'index.html' ? '' : f);
    if (canonical !== self) continue;          // áframsendingarsíður vísa annað — sleppa
    urls.push(self);
  }
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(u => '  <url><loc>' + u + '</loc></url>').join('\n') +
    '\n</urlset>\n';
  cache = { t: Date.now(), xml };
  return xml;
}

module.exports = async (req, res) => {
  const xml = build();
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
  res.end(xml);
};
