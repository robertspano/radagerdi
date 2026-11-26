/* Leitarvélar og gervigreind (SEO/AEO) — prófanir sem má keyra hvenær sem er:  node test/seo.test.mjs
 *
 * Gætir þess sem leitarvélar og gervigreindarvélar (ChatGPT, Claude, Perplexity …) lesa úr
 * hausnum á hverri síðu, og að það stangist ekki á við síðuna sjálfa:
 *   - einn titill og ein lýsing á síðu, hvort tveggja einstakt;
 *   - canonical = hreina slóðin, og:url = canonical, hreflang gagnkvæmt;
 *   - deilimyndin (og:image) er til og stærðin í hausnum er rétt;
 *   - JSON-LD þáttast, og fullyrðingar sem enginn hefur staðfest eru ekki í því;
 *   - llms.txt vísar aðeins á birtar síður og verðin þar standa á síðunni (eða í breytingum eigenda);
 *   - hausinn heldur sér hreinn: tag í <head> sem ekki á heima þar færir vafrinn inn í <body>,
 *     og þá hliðrast allir CMS-lyklar síðunnar (þeir eru staðsetningar í <body>).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const H = 'https://radagerdi.is';
const req = createRequire(path.join(ROOT, 'x.js'));
const DROG = req('./api/_drog.js');
let pass = 0, fail = 0;
const ok = (n, c) => { c ? pass++ : (fail++, console.log('  ✗ ' + n)); };

// Síðuskrár sem eru aðeins gamlar tilvísanir (noindex) koma ekki við sögu nema í hausprófinu.
const files = readdirSync(ROOT).filter(f => f.endsWith('.html'));
const read = f => readFileSync(path.join(ROOT, f), 'utf8');
const headOf = h => h.slice(0, h.search(/<body[\s>]/i));
const clean = f => H + (f === 'index.html' ? '/' : '/' + f.slice(0, -5));
const attr = (tag, a) => { const m = tag.match(new RegExp('\\s' + a + '\\s*=\\s*["\']([^"\']*)["\']', 'i')); return m ? m[1] : null; };
const dec = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const info = {};
for (const f of files) {
  const h = read(f), head = headOf(h);
  const metas = head.match(/<meta\b[^>]*>/gi) || [], links = head.match(/<link\b[^>]*>/gi) || [];
  const meta = (k, v) => metas.filter(m => (attr(m, k) || '').toLowerCase() === v).map(m => dec(attr(m, 'content') || ''));
  info[f] = {
    h, head,
    noindex: /<meta[^>]*name=["']robots["'][^>]*noindex/i.test(head),
    drog: Object.prototype.hasOwnProperty.call(DROG, f),
    lang: (h.match(/<html[^>]*\slang=["']([^"']+)/i) || [])[1],
    titles: [...head.matchAll(/<title>([\s\S]*?)<\/title>/gi)].map(m => dec(m[1].trim())),
    descs: meta('name', 'description'),
    ogurl: meta('property', 'og:url'), oglocale: meta('property', 'og:locale'),
    ogimg: meta('property', 'og:image'), ogw: meta('property', 'og:image:width'), ogh: meta('property', 'og:image:height'),
    canon: links.filter(l => /rel=["']canonical/i.test(l)).map(l => attr(l, 'href')),
    alts: Object.fromEntries(links.filter(l => /hreflang/i.test(l)).map(l => [attr(l, 'hreflang'), attr(l, 'href')])),
  };
}
const birt = files.filter(f => !info[f].noindex && !info[f].drog);
const byUrl = Object.fromEntries(birt.map(f => [clean(f), f]));

console.log('\n1. titill, lýsing og H1');
const seenT = {}, seenD = {};
for (const f of birt) {
  const i = info[f];
  ok(`${f}: nákvæmlega einn <title> (${i.titles.length})`, i.titles.length === 1);
  ok(`${f}: nákvæmlega ein meta description (${i.descs.length})`, i.descs.length === 1);
  const d = i.descs[0] || '';
  ok(`${f}: lýsing 50–160 stafir (er ${d.length})`, d.length >= 50 && d.length <= 160);
  ok(`${f}: nákvæmlega eitt <h1>`, (i.h.match(/<h1[\s>]/gi) || []).length === 1);
  (seenT[i.titles[0]] ||= []).push(f); (seenD[d] ||= []).push(f);
}
for (const [t, fs] of Object.entries(seenT)) ok(`titill einstakur: "${t}" (${fs.join(', ')})`, fs.length === 1);
for (const [d, fs] of Object.entries(seenD)) ok(`lýsing einstök: "${d.slice(0, 50)}" (${fs.join(', ')})`, fs.length === 1);

console.log('2. canonical = hrein slóð, og:url = canonical, og:locale ↔ lang');
for (const f of birt) {
  const i = info[f];
  ok(`${f}: eitt canonical = ${clean(f)} (er ${i.canon})`, i.canon.length === 1 && i.canon[0] === clean(f));
  ok(`${f}: og:url = canonical (${i.ogurl})`, i.ogurl.length === 1 && i.ogurl[0] === i.canon[0]);
  ok(`${f}: og:locale passar við lang=${i.lang} (${i.oglocale})`, ({ is: 'is_IS', en: 'en_GB' })[i.lang] === i.oglocale[0]);
}

console.log('3. hreflang: sjálfsvísun, gagnkvæmni, x-default');
for (const f of birt) {
  const a = info[f].alts; if (!Object.keys(a).length) continue;
  ok(`${f}: hreflang vísar á sjálfa sig`, Object.values(a).includes(clean(f)));
  ok(`${f}: x-default er í hópnum`, !!a['x-default'] && Object.entries(a).some(([l, u]) => l !== 'x-default' && u === a['x-default']));
  for (const [l, u] of Object.entries(a)) {
    if (l === 'x-default') continue;
    const t = byUrl[u];
    ok(`${f}: hreflang ${l} → ${u} er birt síða`, !!t);
    if (!t) continue;
    ok(`${f}: ${u} hefur lang=${l} (${info[t].lang})`, info[t].lang === l);
    ok(`${f}: ${t} vísar til baka með sama hópi`, JSON.stringify(Object.entries(info[t].alts).sort()) === JSON.stringify(Object.entries(a).sort()));
  }
}

console.log('4. deilimyndir: til, og stærðin í hausnum er rétt');
function jpgStaerd(buf) {          // les breidd og hæð úr SOF-hluta JPEG-skrár
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xFF) return null;
    const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (m >= 0xC0 && m <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(m)) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}
for (const f of birt) {
  const i = info[f];
  ok(`${f}: ein og:image (${i.ogimg.length})`, i.ogimg.length === 1);
  const u = i.ogimg[0] || '';
  if (!u.startsWith(H + '/assets/')) continue;
  const p = path.join(ROOT, decodeURIComponent(u.slice(H.length + 1)));
  ok(`${f}: deilimyndin ${u.slice(H.length)} er til`, existsSync(p));
  if (!existsSync(p) || !/\.jpe?g$/i.test(p)) continue;
  const s = jpgStaerd(readFileSync(p));
  ok(`${f}: og:image:width/height = ${s && s.w}×${s && s.h} (er ${i.ogw}×${i.ogh})`, !!s && i.ogw[0] === String(s.w) && i.ogh[0] === String(s.h));
}

console.log('5. haus er hreinn og JSON-LD þáttast');
const LEYFT = new Set(['meta', 'link', 'title', 'style', 'script', 'noscript', 'base', 'template', 'html', 'head']);
// Þetta hefur hvergi verið staðfest af eigendum — má ekki standa í gögnum fyrir leitarvélar eða gervigreind.
const OSTADFEST = /fjölskyldurek|ferskt pasta|árstíðabund|beint frá býli|family[- ]run|family[- ]owned|fresh pasta|seasonal|locally[- ]sourced/i;
const ldAll = [];
for (const f of files) {
  const head = info[f].head.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|title|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/gi, (m, t) => '<' + t + '>');
  const tags = [...head.matchAll(/<([a-zA-Z][a-zA-Z0-9-]*)/g)].map(m => m[1].toLowerCase()).filter(t => !LEYFT.has(t));
  ok(`${f}: aðeins leyfð tög í <head> (${[...new Set(tags)].join(',') || '-'})`, tags.length === 0);
  const txt = head.replace(/<!doctype[^>]*>/i, '').replace(/<[^>]*>/g, '').trim();
  ok(`${f}: enginn laus texti í <head> ("${txt.slice(0, 30)}")`, txt === '');
  for (const m of info[f].h.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let d = null; try { d = JSON.parse(m[1]); } catch (e) { }
    ok(`${f}: JSON-LD þáttast`, !!d);
    if (!d) continue;
    ok(`${f}: JSON-LD @context = https://schema.org`, [].concat(d).every(x => x['@context'] === 'https://schema.org'));
    ok(`${f}: JSON-LD stendur í <head>`, info[f].head.includes(m[0]));
    if (birt.includes(f)) {
      ok(`${f}: JSON-LD án óstaðfestra fullyrðinga (${(m[1].match(OSTADFEST) || [])[0]})`, !OSTADFEST.test(m[1]));
      ldAll.push([f, d]);
    }
  }
}

console.log('6. opnunartímar í JSON-LD: hátíðartímar sem eru liðnir eru teknir út');
const IDAG = new Date().toISOString().slice(0, 10);
const allirHlutir = x => x && typeof x === 'object' ? [x, ...Object.values(x).flatMap(allirHlutir)] : [];
for (const [f, d] of ldAll) {
  const timar = allirHlutir(d).filter(o => o['@type'] === 'OpeningHoursSpecification');
  for (const o of timar) ok(`${f}: opnunartími hefur opens og closes`, /^\d\d:\d\d$/.test(o.opens) && /^\d\d:\d\d$/.test(o.closes));
  // Fellur fyrst þegar ALLIR hátíðartímarnir eru liðnir (ekki 24. des. þótt 23. des. sé liðinn).
  const lok = timar.map(o => o.validThrough).filter(Boolean).sort().pop();
  if (lok) ok(`${f}: allir hátíðartímar í JSON-LD liðnir (síðasti ${lok}) — takið þá út (eða setjið næstu hátíðar inn)`, lok >= IDAG);
}

console.log('7. llms.txt: aðeins birtar síður, og verðin standa á síðunni');
// Verðin geta verið í HTML-skránni eða í breytingum eigenda (content/content.json, ef það er hér).
let efni = null;
try { efni = JSON.parse(read('content/content.json')); } catch (e) { }
const efniSidu = f => efni ? Object.values(efni).map(s => s && typeof s === 'object' ? JSON.stringify(s[f] || '') : '').join(' ') : '';
const tolur = s => s.replace(/&nbsp;|\u00a0/g, ' ').replace(/(\d)[.,](\d{3})/g, '$1$2');
const llms = read('llms.txt');
ok('llms.txt án óstaðfestra fullyrðinga', !OSTADFEST.test(llms));
for (const line of llms.split('\n')) {
  for (const [, u] of line.matchAll(/\((https:\/\/radagerdi\.is[^)\s]*)\)/g)) {
    const f = byUrl[u] || byUrl[u.replace(/\/$/, '')];
    ok(`llms.txt: ${u} er birt síða`, !!f);
  }
  const u = (line.match(/\((https:\/\/radagerdi\.is[^)\s]*)\)/) || [])[1];
  const f = u && (byUrl[u] || byUrl[u.replace(/\/$/, '')]); if (!f) continue;
  const t = tolur(info[f].h + ' ' + efniSidu(f));
  for (const m of line.matchAll(/(\d{1,2}[.,]?\d{3})\s*(kr|ISK)/g)) {
    const n = m[1].replace(/[.,]/g, '');
    ok(`llms.txt: „${m[0]}“ stendur á ${u.slice(H.length) || '/'}`, new RegExp('(^|\\D)' + n + '(\\D|$)').test(t));
  }
}

console.log(`\nsamtals: ${pass} í lagi, ${fail} brugðust`);
process.exit(fail ? 1 : 0);
