/* Vistun úr ritlinum — prófanir sem má keyra hvenær sem er:  node test/vistun.test.js
 *
 * Ritillinn sendir aðeins það sem einn eigandi breytti á einni síðu (api/_efni.js). Hér er
 * sannreynt að enginn geti þurrkað út verk annars: tveir eigendur í einu, flipi sem stóð
 * opinn í klukkutíma, árekstur við GitHub og endurtekin tilraun. Ekkert fer á netið.
 */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
process.env.CMS_EMAILS = 'robertstefansson2404@gmail.com, viktor@radagerdi170.is, gisli@example.is';
process.env.SESSION_SECRET = 'prufulykill-sem-er-nogu-langur-1234567890';
process.env.VERCEL_ENV = 'production';
const E = require(path.join(ROOT, 'api', '_efni.js'));
const S = require(path.join(ROOT, 'api', '_store.js'));
const content = require(path.join(ROOT, 'api', 'content.js'));

let pass = 0, fail = 0;
const ok = (name, cond) => { cond ? (pass++, console.log('  ✓ ' + name)) : (fail++, console.log('  ✗ ' + name)); };
const clone = (o) => JSON.parse(JSON.stringify(o));
const throwsBad = (f) => { try { f(); return false; } catch (e) { return e.code === 'BAD'; } };

const START = () => ({
  texts: { 'jolasedill.html': { A: 'a0', B: 'b0' }, 'matsedlar.html': { M: 'm0' } },
  images: {}, bg: {}, html: { 'matsedlar.html': { PANE: '<p>pane0</p>' } },
  hidden: { 'jolasedill.html': { H: true } }, order: { 'matsedlar.html': { __tabs__: ['x', 'y'] } }, style: {}, settings: { s: 1 },
});

console.log('\neitt skref (v: 2)');
{
  const cur = START(), before = clone(cur);
  const body = { v: 2, page: 'jolasedill.html', set: { texts: { A: 'a1', C: 'c1' } }, del: { hidden: ['H'] } };
  const bodyBefore = clone(body);
  const out = E.applyEdit(cur, body);
  ok('breytt gildi vistast', out.texts['jolasedill.html'].A === 'a1');
  ok('nýtt gildi vistast', out.texts['jolasedill.html'].C === 'c1');
  ok('fjarlægt gildi fer', !('H' in out.hidden['jolasedill.html']));
  ok('annað á sömu síðu helst', out.texts['jolasedill.html'].B === 'b0');
  ok('aðrar síður haldast', out.texts['matsedlar.html'].M === 'm0' && out.html['matsedlar.html'].PANE === '<p>pane0</p>');
  ok('aðrar fötur haldast (settings, order)', out.settings.s === 1 && out.order['matsedlar.html'].__tabs__.join() === 'x,y');
  ok('upprunalegu gögnin eru óbreytt (hægt að reyna aftur á fersku eintaki)', JSON.stringify(cur) === JSON.stringify(before));
  ok('sendingin sjálf er óbreytt', JSON.stringify(body) === JSON.stringify(bodyBefore));
  const o2 = E.applyEdit(START(), { v: 2, page: 'matsedlar.html', set: { order: { __tabs__: ['y', 'x'] }, style: { K: { color: 'red' } } } });
  ok('fliparöð (__tabs__) og útlit (hlutir) vistast', o2.order['matsedlar.html'].__tabs__.join() === 'y,x' && o2.style['matsedlar.html'].K.color === 'red');
  ok('ný síða sem var ekki til fyrir', E.applyEdit(START(), { v: 2, page: 'hopar.html', set: { texts: { T: 't' } } }).texts['hopar.html'].T === 't');
  ok('tóm sending breytir engu', JSON.stringify(E.applyEdit(START(), { v: 2, page: 'jolasedill.html', set: {}, del: {} })) === JSON.stringify(START()));
}

console.log('\ntveir eigendur í einu á sömu síðu (Gísli og Viktor)');
{
  // Báðir opnuðu síðuna þegar A=a0, B=b0. Gísli breytir A, Viktor breytir B, Viktor vistar síðast.
  let srv = START();
  srv = E.applyEdit(srv, { v: 2, page: 'jolasedill.html', set: { texts: { A: 'Gísli' } } });
  srv = E.applyEdit(srv, { v: 2, page: 'jolasedill.html', set: { texts: { B: 'Viktor' } } });
  ok('breyting Gísla lifir vistun Viktors', srv.texts['jolasedill.html'].A === 'Gísli');
  ok('breyting Viktors vistast', srv.texts['jolasedill.html'].B === 'Viktor');
}
console.log('flipi sem stóð opinn í klukkutíma á annarri síðu');
{
  let srv = START();
  srv = E.applyEdit(srv, { v: 2, page: 'jolasedill.html', set: { texts: { A: 'nýtt á jólasíðu' } } });
  srv = E.applyEdit(srv, { v: 2, page: 'matsedlar.html', set: { texts: { M: 'gamli flipinn' } } });
  ok('gamli flipinn setur jólasíðuna ekki aftur á bak', srv.texts['jolasedill.html'].A === 'nýtt á jólasíðu');
}

console.log('\nógildar sendingar');
ok('síðunafn með ../', throwsBad(() => E.applyEdit(START(), { v: 2, page: '../server.js', set: { texts: { A: 1 } } })));
ok('síðunafn í undirmöppu', throwsBad(() => E.applyEdit(START(), { v: 2, page: 'cms/admin.html', set: { texts: { A: 1 } } })));
ok('síðunafn án .html', throwsBad(() => E.applyEdit(START(), { v: 2, page: 'matsedlar', set: {} })));
ok('óþekkt fata', throwsBad(() => E.applyEdit(START(), { v: 2, page: 'hopar.html', set: { settings: { x: 1 } } })));
ok('fata sem er ekki hlutur', throwsBad(() => E.applyEdit(START(), { v: 2, page: 'hopar.html', set: { texts: ['x'] } })));
ok('del sem er ekki listi', throwsBad(() => E.applyEdit(START(), { v: 2, page: 'hopar.html', del: { texts: 'A' } })));
ok('__proto__ sem lykill', throwsBad(() => E.applyEdit(START(), JSON.parse('{"v":2,"page":"hopar.html","set":{"texts":{"__proto__":{"x":1}}}}'))));
ok('constructor í del', throwsBad(() => E.applyEdit(START(), { v: 2, page: 'hopar.html', del: { texts: ['constructor'] } })));
ok('ekki hlutur', throwsBad(() => E.applyEdit(START(), 'texti')));
ok('ekkert mengaðist', ({}).x === undefined);

console.log('\neldri sending (heilar fötur, flipi frá því fyrir uppfærsluna) er hafnað');
{
  let code = null; try { E.applyEdit(START(), { texts: { 'matsedlar.html': { M: 'gamalt snið' } } }); } catch (e) { code = e.code; }
  ok('gamla sniðið → OLD (gamli flipinn myndi annars setja allan vefinn aftur á bak)', code === 'OLD');
}

console.log('\n/api/content PUT með árekstri (GitHub segir 409, reynt aftur á fersku eintaki)');
(async () => {
  const VIKTOR = S.cookieFor('viktor@radagerdi170.is').split(';')[0];
  const call = (body) => new Promise((resolve) => {
    const req = { method: 'PUT', url: '/api/content', headers: { cookie: VIKTOR }, body: JSON.stringify(body) };
    const res = { statusCode: 200, h: {}, setHeader(k, v) { this.h[k] = v; }, end(b) { resolve({ status: this.statusCode, body: JSON.parse(b || '{}') }); } };
    content(req, res);
  });
  // Herma eftir S.update: fyrsta tilraun rekst á — Gísli vistaði rétt á undan — svo er lesið aftur
  let stored = START(), attempts = 0;
  S.update = async (name, fb, mutate) => {
    for (let i = 0; i < 3; i++) {
      attempts++;
      const fresh = clone(stored);
      const next = await mutate(fresh);
      if (i === 0) { stored.texts['jolasedill.html'].A = 'Gísli vistaði á meðan'; continue; }   // 409
      stored = next; return { ok: true, value: next };
    }
  };
  const r = await call({ v: 2, page: 'jolasedill.html', set: { texts: { B: 'Viktor' } } });
  ok('vistunin tókst í annarri tilraun', r.status === 200 && r.body.ok && attempts === 2);
  ok('breyting Gísla (sem olli árekstrinum) lifði', stored.texts['jolasedill.html'].A === 'Gísli vistaði á meðan');
  ok('breyting Viktors vistaðist', stored.texts['jolasedill.html'].B === 'Viktor');

  const old = await call({ texts: { 'matsedlar.html': { M: 'gamall flipi' } } });
  ok('gamall flipi → 401 (hann geymir þá vinnuna og biður um innskráningu), ekkert skrifað', old.status === 401 && stored.texts['matsedlar.html'].M === 'm0');

  const bad = await call({ v: 2, page: '../x', set: {} });
  ok('ógild sending → 400, ekkert skrifað', bad.status === 400);
  const anon = await new Promise((resolve) => content({ method: 'PUT', url: '/api/content', headers: {}, body: '{}' }, { statusCode: 200, setHeader() {}, end(b) { resolve(this.statusCode); } }));
  ok('óinnskráður → 401', anon === 401);

  console.log(`\nsamtals: ${pass} í lagi, ${fail} brugðust`);
  process.exit(fail ? 1 : 0);
})();
