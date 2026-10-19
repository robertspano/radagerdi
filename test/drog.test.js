/* Faldar síður — prófanir sem má keyra hvenær sem er:  node test/drog.test.js
 *
 * Síða á api/_drog.js er á vefnum en enginn má sjá hana nema eigendurnir sem eru skráðir
 * inn í ritilinn. Hver lína hér er leið sem gestur, leitarvél eða forvitinn gæti reynt.
 * Ekkert hér fer á netið: lestur og vistun efnisins eru leyst af hólmi.
 */
'use strict';
const path = require('path');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
process.chdir(ROOT);
process.env.CMS_EMAILS = 'robertstefansson2404@gmail.com, viktor@radagerdi170.is';
process.env.SESSION_SECRET = 'prufulykill-sem-er-nogu-langur-1234567890';
process.env.RESEND_API_KEY = 're_test';

let pass = 0, fail = 0;
const ok = (name, cond) => { cond ? (pass++, console.log('  ✓ ' + name)) : (fail++, console.log('  ✗ ' + name)); };

const DROG = require(path.join(ROOT, 'api', '_drog.js'));
const FAKE = () => ({
  texts: { 'jolasedill.html': { 'MAIN0>H10': 'LEYNITEXTI-GÍSLA' }, 'en-jolasedill.html': { 'MAIN0>H10': 'SECRET-EN' }, 'matsedlar.html': { 'DIV0': 'opinbert' } },
  images: {}, bg: {}, html: { 'jolasedill.html': { 'X': '<p>LEYNIHTML</p>' } }, hidden: {}, order: {}, style: {}, settings: {},
});

function load(env) {
  for (const f of ['_store.js', '_drog.js', 'page.js', 'sitemap.js', 'content.js']) delete require.cache[require.resolve(path.join(ROOT, 'api', f))];
  if (env === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = env;
  const S = require(path.join(ROOT, 'api', '_store.js'));
  let stored = FAKE();
  S.readJSON = async () => JSON.parse(JSON.stringify(stored));
  S.update = async (name, fb, mutate) => { stored = mutate(JSON.parse(JSON.stringify(stored))); return stored; };
  return {
    S, get stored() { return stored; },
    page: require(path.join(ROOT, 'api', 'page.js')),
    sitemap: require(path.join(ROOT, 'api', 'sitemap.js')),
    content: require(path.join(ROOT, 'api', 'content.js')),
  };
}
function call(handler, { url, cookie, method = 'GET', body } = {}) {
  const req = { url, method, headers: { accept: 'text/html', cookie: cookie || '' } };
  if (body !== undefined) req.body = JSON.stringify(body);   // eins og Vercel afhendir það
  return new Promise((resolve) => {
    const h = {};
    const res = { statusCode: 200, headersSent: false, setHeader(k, v) { h[k.toLowerCase()] = String(v); }, getHeader(k) { return h[k.toLowerCase()]; },
      writeHead(c, hh) { this.statusCode = c; Object.assign(h, hh || {}); }, end(b) { resolve({ status: this.statusCode, h, body: b == null ? '' : String(b) }); } };
    Promise.resolve(handler(req, res)).catch(e => resolve({ status: 'KASTAÐI', h, body: String(e && e.stack) }));
  });
}
const sign = (m) => crypto.createHmac('sha256', process.env.SESSION_SECRET).update(m).digest('hex');
const cookieOf = (email, exp) => 'cms_session=' + Buffer.from(email).toString('base64url') + '.' + exp + '.' + sign('cms-v4|' + email + '|' + exp);

(async () => {
  let M = load('production');
  const VIKTOR = M.S.cookieFor('viktor@radagerdi170.is').split(';')[0];
  const OKUNNUGUR = M.S.cookieFor('okunnugur@example.com').split(';')[0];   // rétt undirrituð, en ekki á listanum
  const UTRUNNIN = cookieOf('viktor@radagerdi170.is', Date.now() - 1000);
  const FOLSUD = 'cms_session=' + Buffer.from('viktor@radagerdi170.is').toString('base64url') + '.' + (Date.now() + 1e9) + '.' + 'ab'.repeat(32);
  const leak = (r) => /LEYNITEXTI|SECRET-EN|LEYNIHTML|Jól í Ráðagerði|Christmas at|jolasnjor/.test(r.body);

  console.log('\nlistinn sjálfur');
  ok('jolasedill.html er falin', DROG['jolasedill.html'] === '/matsedlar');
  ok('en-jolasedill.html er falin', DROG['en-jolasedill.html'] === '/en-matsedlar');

  console.log('\ngestur (óinnskráður) fær aldrei síðuna');
  for (const [p, to] of [['jolasedill.html', '/matsedlar'], ['en-jolasedill.html', '/en-matsedlar']]) {
    for (const [lbl, c] of [['engin kaka', ''], ['kaka utan lista', OKUNNUGUR], ['útrunnin kaka', UTRUNNIN], ['fölsuð undirskrift', FOLSUD], ['rusl', 'cms_session=xyz']]) {
      const r = await call(M.page, { url: '/api/page?p=' + p, cookie: c });
      ok(`${p} · ${lbl} → 302 ${to}, ekkert efni`, r.status === 302 && r.h.location === to && !leak(r) && r.body === '');
      ok(`${p} · ${lbl} → aldrei í hraðnet, aldrei í Google`, /no-store/.test(r.h['cache-control']) && /private/.test(r.h['cache-control']) && /noindex/.test(r.h['x-robots-tag'] || ''));
    }
  }
  {
    const r = await call(M.page, { url: '/api/page?cms=1&p=jolasedill.html' });
    ok('?cms=1 óinnskráður → innskráning, og svo aftur á síðuna', r.status === 302 && r.h.location === '/admin?next=' + encodeURIComponent('/jolasedill?cms=1') && !leak(r));
    const n = M.S.safeNext(decodeURIComponent(r.h.location.split('next=')[1]), '/x');
    ok('innskráningin samþykkir þá slóð (safeNext)', n === '/jolasedill?cms=1');
    const r2 = await call(M.page, { url: '/api/page?cms=10&p=jolasedill.html' });
    ok('?cms=10 er ekki ritham → venjuleg tilvísun', r2.status === 302 && r2.h.location === '/matsedlar');
  }

  console.log('\neigandi (innskráður) fær síðuna');
  {
    const r = await call(M.page, { url: '/api/page?p=jolasedill.html', cookie: VIKTOR });
    ok('Viktor fær síðuna (200)', r.status === 200 && /Jól í Ráðagerði/.test(r.body));
    ok('með efni úr ritlinum', /LEYNITEXTI-GÍSLA/.test(r.body));
    ok('merkt falin fyrir ritilinn', /window\.__CMS_DROG__=1/.test(r.body));
    ok('merkið er í <head>, ekki í <body> (lyklar efnisins hliðrast ekki)', r.body.indexOf('__CMS_DROG__') < r.body.indexOf('<body'));
    ok('aldrei í hraðnet (næsti gestur fengi annars eintak eigandans)', /private/.test(r.h['cache-control']) && /no-store/.test(r.h['cache-control']) && !/s-maxage/.test(r.h['cache-control']));
    ok('aldrei í Google', /noindex/.test(r.h['x-robots-tag'] || ''));
    const r2 = await call(M.page, { url: '/api/page?cms=1&p=jolasedill.html', cookie: 'a=1; ' + VIKTOR + '; b=2' });
    ok('líka í ritham og með aðrar kökur', r2.status === 200 && /private, no-store/.test(r2.h['cache-control']));
  }
  {
    const S = M.S, orig = S.readJSON;
    S.readJSON = async () => { throw new Error('GitHub niðri'); };
    const r = await call(M.page, { url: '/api/page?p=jolasedill.html', cookie: VIKTOR });
    ok('efnið næst ekki → samt aldrei í hraðnet', r.status === 200 && /private, no-store/.test(r.h['cache-control']));
    S.readJSON = orig;
  }

  console.log('\naðrar síður eru óbreyttar');
  {
    const r = await call(M.page, { url: '/api/page?p=matsedlar.html' });
    ok('matsedlar: 200 fyrir alla', r.status === 200);
    ok('matsedlar: má áfram vera í hraðneti', /s-maxage=15/.test(r.h['cache-control']));
    ok('matsedlar: ekkert noindex', !r.h['x-robots-tag']);
    ok('matsedlar: ekkert falin-merki', !/__CMS_DROG__/.test(r.body));
  }

  console.log('\nsitemap');
  {
    const r = await call(M.sitemap, { url: '/api/sitemap' });
    ok('jólasíðurnar eru ekki í sitemap', !/jolasedill/.test(r.body));
    ok('aðrar síður eru þar', /https:\/\/radagerdi\.is\/matsedlar</.test(r.body));
  }

  console.log('\n/api/content');
  {
    const r = await call(M.content, { url: '/api/content' });
    const c = JSON.parse(r.body);
    ok('gestur: ekkert efni faldra síðna', !/LEYNITEXTI|SECRET-EN|LEYNIHTML/.test(r.body) && !c.texts['jolasedill.html'] && !c.html['jolasedill.html']);
    ok('gestur: efni annarra síðna óbreytt', c.texts['matsedlar.html'].DIV0 === 'opinbert');
    const r2 = await call(M.content, { url: '/api/content', cookie: VIKTOR });
    ok('eigandi: fær allt (ritillinn verður að fá það, annars þurrkast það við vistun)', /LEYNITEXTI-GÍSLA/.test(r2.body) && /LEYNIHTML/.test(r2.body));
  }
  {
    const before = M.stored.texts['jolasedill.html']['MAIN0>H10'];
    const body = FAKE(); delete body.texts['jolasedill.html']; delete body.html['jolasedill.html']; body.texts['matsedlar.html'].DIV0 = 'breytt';
    const r = await call(M.content, { url: '/api/content', method: 'PUT', cookie: VIKTOR, body });
    ok('vistun án faldrar síðu þurrkar hana ekki út', r.status === 200 && M.stored.texts['jolasedill.html']['MAIN0>H10'] === before && M.stored.html['jolasedill.html'].X === '<p>LEYNIHTML</p>');
    ok('…en annað í vistuninni skilar sér', M.stored.texts['matsedlar.html'].DIV0 === 'breytt');
    const body2 = FAKE(); body2.texts['jolasedill.html'] = { 'MAIN0>H10': 'NÝTT' };
    await call(M.content, { url: '/api/content', method: 'PUT', cookie: VIKTOR, body: body2 });
    ok('breyting á faldri síðu vistast', M.stored.texts['jolasedill.html']['MAIN0>H10'] === 'NÝTT');
    const body3 = FAKE(); body3.texts['jolasedill.html'] = {};
    await call(M.content, { url: '/api/content', method: 'PUT', cookie: VIKTOR, body: body3 });
    ok('og það má afturkalla allt á henni (tómt sent = tómt vistað)', Object.keys(M.stored.texts['jolasedill.html']).length === 0);
    const r4 = await call(M.content, { url: '/api/content', method: 'PUT', body: FAKE() });
    ok('gestur getur ekki vistað', r4.status === 401);
  }

  console.log('\nforskoðun — deilitengill („Anyone with the link") opnar hana hverjum sem er');
  for (const env of ['preview', 'development', undefined]) {
    const P = load(env);
    const r = await call(P.page, { url: '/api/page?p=jolasedill.html' });
    ok(`VERCEL_ENV=${env}: gestur fær ekki síðuna`, r.status === 302 && r.h.location === '/matsedlar' && !leak(r));
  }

  console.log('\ninnskráningartengillinn vísar aðeins á radagerdi.is');
  {
    M = load('production');
    let sentTo = null;
    M.S.sendLoginLink = async (email, origin) => { sentTo = origin; };
    const login = require(path.join(ROOT, 'api', 'login-link.js'));
    for (const [lbl, headers] of [['x-forwarded-host frá sendanda', { 'x-forwarded-host': 'illt.example' }], ['host frá sendanda', { host: 'illt.example' }], ['venjuleg beiðni', { host: 'radagerdi.is' }]]) {
      sentTo = null;
      const req = { method: 'POST', url: '/api/login-link', headers: Object.assign({ 'x-forwarded-for': '10.0.0.' + Math.floor(Math.random() * 200) }, headers), body: JSON.stringify({ email: 'viktor@radagerdi170.is', next: '/jolasedill?cms=1' }) };
      // kallað beint (ekki með call()), því hér skipta hausar sendandans máli
      await new Promise((resolve) => { const res = { statusCode: 200, setHeader() {}, end() { resolve(); } }; Promise.resolve(login(req, res)).then(resolve, resolve); });
      ok(`${lbl} → tengill á https://radagerdi.is (var: ${sentTo})`, sentTo === 'https://radagerdi.is');
    }
  }

  console.log(`\nsamtals: ${pass} í lagi, ${fail} brugðust`);
  process.exit(fail ? 1 : 0);
})();
