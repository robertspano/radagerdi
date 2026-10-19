/* Slóðirnar — prófanir sem má keyra hvenær sem er:  node test/slodir.test.mjs
 *
 * Slóðir vefsins eru án .html (/matsedlar). middleware.js ræður því á Vercel og server.js á
 * localhost. Ein röng lína þar getur sett heilan vef í tilvísanalykkju, svo hér er middleware.js
 * keyrður eins og hann er (aðeins @vercel/edge skipt út) á allar síður og allar gamlar slóðir.
 *
 * Sérstaklega: síða og gömul Webflow-tilvísun mega ALDREI heita það sama. Ef jolasedill.html
 * kemur í loftið á meðan '/jolasedill' er enn í LEGACY vísar /jolasedill á sjálfa sig endalaust.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(path.join(ROOT, 'middleware.js'), 'utf8');
const IMPORT = "import { next, rewrite } from '@vercel/edge';";
if (!src.includes(IMPORT)) throw new Error('middleware.js: innflutningslínan breyttist — uppfærðu prófið');
const mock = "const next = (o) => ({ kind: 'next', h: o && o.headers }); const rewrite = (u, o) => ({ kind: 'rewrite', to: u.pathname + u.search, h: o && o.headers });";
const mw = (await import('data:text/javascript,' + encodeURIComponent(src.replace(IMPORT, mock)))).default;

let pass = 0, fail = 0;
const ok = (name, cond) => { cond ? pass++ : (fail++, console.log('  ✗ ' + name)); };

function go(p, method = 'GET', host = 'radagerdi.is') {
  const r = mw(new Request('https://' + host + p, { method }));
  if (r instanceof Response) {
    if (r.status !== 301) return String(r.status);
    const l = new URL(r.headers.get('location'));
    return '301 ' + decodeURIComponent(l.pathname + l.search);
  }
  if (r.kind === 'rewrite') return 'rw ' + decodeURIComponent(r.to) + (r.h ? ' +noindex' : '');
  return 'next' + (r.h ? ' +noindex' : '');
}
const t = (p, want, method, host) => { const got = go(p, method, host); ok(`${method || 'GET'} ${p} → ${got} (átti: ${want})`, got === want); };
// fylgir tilvísunum eins og vafri; skilar endastöð eða 'LYKKJA'
function follow(p) {
  const seen = [];
  for (let i = 0; i < 6; i++) {
    const r = go(p); seen.push(p + ' → ' + r);
    if (!r.startsWith('301 ')) return { end: r, hops: i, seen };
    p = r.slice(4);
  }
  return { end: 'LYKKJA', hops: 6, seen };
}

// ---------- síðurnar í möppunni ----------
const files = readdirSync(ROOT).filter(f => f.endsWith('.html'));
const clean = f => f === 'index.html' ? '/' : '/' + f.slice(0, -5);
const canonicalOf = f => {
  const html = readFileSync(path.join(ROOT, f), 'utf8');
  const tag = html.match(/<link[^>]*rel=["']canonical["'][^>]*>/i);
  const href = tag && tag[0].match(/href=["']([^"']+)["']/i);
  return href ? href[1] : null;
};
// Gömlu Webflow-afritin (matsedill.html o.fl.) bera noindex og eru aldrei afhent; allt annað er síða.
const noindex = f => /<meta[^>]*name=["']robots["'][^>]*noindex/i.test(readFileSync(path.join(ROOT, f), 'utf8'));
const stubs = files.filter(noindex);
const pages = files.filter(f => !noindex(f));

console.log('\nhver síða vísar á hreinu slóðina sína (canonical) — annars fer hún ekki í sitemap');
for (const f of pages) ok(`${f}: canonical er https://radagerdi.is${clean(f)} (er: ${canonicalOf(f)})`, canonicalOf(f) === 'https://radagerdi.is' + clean(f));

console.log('hver síða: hrein slóð afhent, .html-slóð færð á hreina slóð');
for (const f of pages) {
  t(clean(f), 'rw /api/page?p=' + f);
  t('/' + f, '301 ' + clean(f));
  if (f !== 'index.html') t(clean(f) + '/', '301 ' + clean(f));
  t('/' + f + '?cms=1', '301 ' + clean(f) + '?cms=1');
}
console.log('gömlu Webflow-afritin eru aldrei afhent beint');
for (const f of stubs) {
  const a = follow(clean(f)), b = follow('/' + f);
  ok(`${clean(f)} endar á síðu (${a.seen.join(' | ')})`, a.end.startsWith('rw /api/page?p=') && a.hops === 1);
  ok(`/${f} endar á síðu (${b.seen.join(' | ')})`, b.end.startsWith('rw /api/page?p=') && b.hops === 1);
}

console.log('engin gömul tilvísun heitir það sama og síða, og engin vísar á aðra tilvísun');
const legacyKeys = [...src.matchAll(/^\s*'(\/[^']*)':\s*\{\s*to:/gm)].map(m => m[1]);
ok('LEGACY fannst í middleware.js', legacyKeys.length > 5);
for (const k of legacyKeys) {
  ok(`LEGACY '${k}' er ekki slóð síðu`, !pages.some(f => clean(f) === k));
  const a = follow(k);
  ok(`LEGACY '${k}' → síða í einu stökki (${a.seen.join(' | ')})`, a.hops === 1 && a.end.startsWith('rw /api/page?p='));
  const target = a.end.replace(/^rw \/api\/page\?p=/, '').replace(/ .*$/, '');
  ok(`LEGACY '${k}' vísar á skrá sem er til (${target})`, files.includes(target));
}
console.log('server.js (localhost) hefur sömu gömlu tilvísanir');
const server = readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const pairs = (re, s) => [...s.matchAll(re)].map(m => m[1] + ' → ' + m[2]).sort().join('\n');
ok('LEGACY er eins í middleware.js og server.js',
  pairs(/^\s*'(\/[^']*)':\s*\{\s*to:\s*'([^']+)'/gm, src) === pairs(/^\s*\['(\/[^']*)',\s*\{\s*to:\s*'([^']+)'/gm, server));
ok('flipavarpanir (?tab=) eru eins í middleware.js og server.js',
  pairs(/'(tab-[a-z-]+)':\s*'([^']+)'/g, src) === pairs(/'(tab-[a-z-]+)':\s*'([^']+)'/g, server));

console.log('sérstök tilvik');
t('/', 'rw /api/page?p=index.html');
t('/index', '301 /');
t('/index.html?cms=1', '301 /?cms=1');
t('/matsedlar?cms=1', 'rw /api/page?cms=1&p=matsedlar.html');
t('/matsedlar.html?tab=tab-brons-is', '301 /matsedlar?tab=tab-brons-is');
t('/matsedlar.html/', '301 /matsedlar');
t('/matsedill.html?tab=tab-brons-is&utm_source=x', '301 /brons?utm_source=x');
t('/is/matsedill?tab=tab-hopar-is', '301 /hopar');
t('/en/menu?tab=tab-groups-en', '301 /en-hopar');
t('/en/contact-us/', '301 /en-contact-us');
t('/admin', 'next');
t('/admin?next=%2Fmatsedlar', 'next');
t('/admin/', '301 /admin');
t('/skann', 'next');
t('/gjafabref/abcdef0123456789', 'next');
t('/sitemap.xml', 'rw /api/sitemap');
t('/robots.txt', 'next');
t('/favicon.ico', 'next');
t('/post/gamalt', 'rw /api/gone');
t('/post/gamalt.html', 'rw /api/gone');
t('/ekki-til', 'rw /api/page?p=ekki-til.html');      // api/page skilar 404-síðunni
t('/ekki-til.html', '301 /ekki-til');
t('/a/b.html', '404');
console.log('stafakóðaðar og tvöfaldar slóðir ná ekki framhjá (annars næst kyrrstæða skráin beint)');
t('/matsedlar%2Ehtml', '301 /matsedlar');
t('/matsedlar%2ehtml', '301 /matsedlar');
t('/%6Datsedlar.html', '301 /matsedlar');
t('/matsedlar.htm%6C', '301 /matsedlar');
t('/%6Datsedlar', 'rw /api/page?p=matsedlar.html');
t('//matsedlar.html', '301 /matsedlar');
t('/jolasedill%2Ehtml', '301 /jolasedill');
t('/MATSEDLAR.HTML', '404');
t('/x/..%2Fmatsedlar.html', '404');
t('/matsedlar.html', '404', 'POST');
t('/jolasedill%2Ehtml', '404', 'PUT');
t('/%E0%A4%A', 'next');
t('/matsedlar?p=../server.js', 'rw /api/page?p=matsedlar.html');
t('/.env', '404');
t('/content/content.json', '404');
t('/server.js', '404');
t('/matsedlar', 'next', 'POST');
t('/matsedlar', 'rw /api/page?p=matsedlar.html', 'HEAD');
t('/matsedlar', 'rw /api/page?p=matsedlar.html +noindex', 'GET', 'radagerdi-git-x.vercel.app');
t('/matsedlar.html', '301 /matsedlar', 'GET', 'www.radagerdi.is');

console.log(`\nsamtals: ${pass} í lagi, ${fail} brugðust`);
process.exit(fail ? 1 : 0);
