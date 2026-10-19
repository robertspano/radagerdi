/* Vistun efnis úr ritlinum — sameiginlegt fyrir Vercel (api/content.js) og server.js.
 *
 * Áður sendi ritillinn ALLAN vefinn við hverja vistun, eins og hann var þegar síðan
 * opnaðist, og þjónninn skipti öllu út. Þá þurrkaði hver ritill út það sem aðrir höfðu
 * vistað síðan hann opnaðist: tveir eigendur á jólasíðunni í einu, eða flipi sem hafði
 * staðið opinn í klukkutíma, settu verk hinna þegjandi aftur á bak.
 *
 * Nú (v: 2) sendir ritillinn aðeins það sem ÞESSI eigandi breytti, á ÞESSARI síðu:
 *   { v: 2, page: 'jolasedill.html',
 *     set: { texts: { 'MAIN0>H10': '<b>Jól</b>' } },      — nýtt eða breytt gildi
 *     del: { hidden: ['DIV1>P2'] } }                      — gildi sem hann fjarlægði
 * og þjónninn beitir því á nýjasta efnið. Annað helst óhreyft.
 *
 * Eldri sendingar (heilar fötur, án v) eru enn teknar gildar — flipi sem var opinn
 * þegar þessi útgáfa fór í loftið sendir þær þar til hann er endurhlaðinn.
 */
'use strict';
const DROG = require('./_drog');

const BUCKETS = ['texts', 'images', 'bg', 'html', 'hidden', 'order', 'style'];
const LEGACY_BUCKETS = [...BUCKETS, 'settings'];
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isDrog = (p) => has(DROG, p);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
// Sama regla og síðunafn í api/page.js: aðeins síða í rót, engin leið út úr möppunni
const okPage = (p) => typeof p === 'string' && /^[A-Za-z0-9._-]+\.html$/.test(p) && !p.includes('..');
// Lyklar ritilsins eru t.d. 'MAIN0>H10' eða '__tabs__'; þessir þrír myndu breyta hlutnum sjálfum
const okKey = (k) => typeof k === 'string' && k.length > 0 && k.length < 400 && k !== '__proto__' && k !== 'constructor' && k !== 'prototype';

function bad(msg) { const e = new Error(msg); e.code = 'BAD'; return e; }

// Efni faldra síðna (api/_drog.js) er aðeins fyrir innskráða — annars mætti lesa textann.
function withoutDrafts(c) {
  const out = Object.assign({}, c);
  for (const k of LEGACY_BUCKETS) {
    if (!isObj(out[k])) continue;
    out[k] = Object.assign({}, out[k]);
    for (const p of Object.keys(out[k])) if (isDrog(p)) delete out[k][p];
  }
  return out;
}

/* Beitir sendingu ritilsins á nýjasta efnið (cur) og skilar nýju efni.
 * Breytir hvorki cur né body: S.update keyrir þetta aftur á ferskum gögnum ef einhver
 * annar vistaði á sama tíma, og þá verður útkoman að reiknast upp á nýtt. */
function applyEdit(curIn, body) {
  if (!isObj(body)) throw bad('Ógild sending');
  const cur = Object.assign({}, curIn);

  if (body.v === 2) {
    const page = body.page;
    if (!okPage(page)) throw bad('Ógilt síðunafn');
    const set = isObj(body.set) ? body.set : {}, del = isObj(body.del) ? body.del : {};
    for (const k of Object.keys(set)) if (!BUCKETS.includes(k) || !isObj(set[k])) throw bad('Ógild fata: ' + k);
    for (const k of Object.keys(del)) if (!BUCKETS.includes(k) || !Array.isArray(del[k])) throw bad('Ógild fata: ' + k);
    for (const k of BUCKETS) {
      const s = set[k] || {}, d = del[k] || [];
      if (!Object.keys(s).length && !d.length) continue;
      const bucket = Object.assign({}, isObj(cur[k]) ? cur[k] : {});
      const slice = Object.assign({}, isObj(bucket[page]) ? bucket[page] : {});
      for (const key of d) { if (!okKey(key)) throw bad('Ógildur lykill'); delete slice[key]; }
      for (const key of Object.keys(s)) { if (!okKey(key)) throw bad('Ógildur lykill'); slice[key] = s[key]; }
      bucket[page] = slice;
      cur[k] = bucket;
    }
    return cur;
  }

  // Eldri sending: heilar fötur. Efni faldrar síðu sem vantar í hana er látið standa
  // (ritill sem fékk efnið án þess má ekki þurrka það út).
  for (const k of LEGACY_BUCKETS) {
    if (!isObj(body[k])) continue;
    const next = Object.assign({}, body[k]);
    const keep = isObj(cur[k]) ? cur[k] : {};
    for (const p of Object.keys(keep)) if (isDrog(p) && !has(body[k], p)) next[p] = keep[p];
    cur[k] = next;
  }
  return cur;
}

module.exports = { BUCKETS, applyEdit, withoutDrafts, isDrog, okPage };
