/* Hópabókunin — prófanir sem má keyra hvenær sem er:  node test/hopur.test.js
 *
 * Ekkert fer á netið: sendingin til Resend er gripin og skoðuð. Varnirnar sjálfar (Origin,
 * hemill, gildra, 422 o.fl.) eru sameiginlegar með veislupöntuninni (api/_pontun.js) og prófaðar
 * ítarlega í test/fyrirspurn.test.js; hér er það sem er sérstakt fyrir hópa.
 */
'use strict';
const path = require('path');
process.env.RESEND_API_KEY = 're_prof';
process.env.SESSION_SECRET = 'prufulykill-sem-er-nogu-langur-1234567890';
delete process.env.FYRIRSPURN_TO;
delete process.env.VERCEL_ENV;
const handler = require(path.join(__dirname, '..', 'api', 'hopur.js'));

let pass = 0, fail = 0;
const ok = (name, cond) => { cond ? (pass++, console.log('  ✓ ' + name)) : (fail++, console.log('  ✗ ' + name)); };

let sent = [];
global.fetch = async (url, opts) => { sent.push({ url, body: JSON.parse(opts.body) }); return { ok: true, status: 200, text: async () => '' }; };
let ip = 0;
function call({ body, json = true, headers = {} } = {}) {
  ip++;
  const req = { method: 'POST', url: '/api/hopur', headers: Object.assign({ 'content-type': json ? 'application/json' : 'application/x-www-form-urlencoded', origin: 'https://radagerdi.is', 'x-forwarded-for': '10.2.' + Math.floor(ip / 250) + '.' + (ip % 250) }, headers),
    body: json ? JSON.stringify(body || {}) : new URLSearchParams(body || {}).toString() };
  return new Promise((resolve) => {
    const h = {};
    const res = { statusCode: 200, setHeader(k, v) { h[k.toLowerCase()] = v; }, end(b) { resolve({ status: this.statusCode, h, json: (() => { try { return JSON.parse(b); } catch (e) { return null; } })() }); } };
    Promise.resolve(handler(req, res)).catch((e) => resolve({ status: 'KASTAÐI', err: e.stack }));
  });
}
// 2026-12-11 er föstudagur, 2026-12-12 laugardagur
const GOD = { fjoldi: '14', timi: 'Kvöld', sedill: 'Kvöld · Valkostur 2 · 9.900 kr á mann', aaetlad: '138.600 kr (14 × 9.900 kr)',
  dagsetning: '2026-12-11', klukkan: '19:00', oskir: 'Afmæli. Einn með hnetuofnæmi.', nafn: 'Anna Jónsdóttir', netfang: 'anna@example.com', simi: '899 1234', vefsida: '' };

(async () => {
  console.log('\ngóð beiðni');
  sent = [];
  let r = await call({ body: GOD });
  ok('200 og ok', r.status === 200 && r.json && r.json.ok === true);
  const m = sent[0] && sent[0].body;
  ok('til Ráðagerðis og engra annarra, svarnetfang gesturinn', m && JSON.stringify(m.to) === JSON.stringify(['radagerdi@radagerdi170.is']) && !m.cc && !m.bcc && m.reply_to === 'anna@example.com');
  ok('efnislína: fjöldi, hvenær, dagur', m && m.subject === 'Hópabókun: 14 gestir · Kvöld · föstudagur 11. desember 2026 kl. 19:00 — Anna Jónsdóttir');
  ok('seðill, áætlað verð og óskir í póstinum', m && /Hópaseðill: Kvöld · Valkostur 2 · 9\.900 kr á mann/.test(m.text) && /Áætlað verð: 138\.600 kr/.test(m.text) && /Óskir:\nAfmæli\. Einn með hnetuofnæmi\./.test(m.text) && /radagerdi\.is\/hopar/.test(m.text));
  ok('engin athugasemd þegar dagur og tími passa', m && !/Athugið/.test(m.text));

  console.log('\nhádegi um helgi / bröns á virkum degi: beiðnin fer, með athugasemd til starfsfólks');
  sent = [];
  r = await call({ body: Object.assign({}, GOD, { timi: 'Hádegi', dagsetning: '2026-12-12' }) });
  ok('hádegi á laugardegi → sent, merkt', r.status === 200 && sent[0] && /Athugið: Hádegisseðlarnir eru virka daga/.test(sent[0].body.text));
  sent = [];
  r = await call({ body: Object.assign({}, GOD, { timi: 'Bröns', dagsetning: '2026-12-11' }) });
  ok('bröns á föstudegi → sent, merkt', r.status === 200 && sent[0] && /Athugið: Bröns er um helgar/.test(sent[0].body.text));
  sent = [];
  r = await call({ body: Object.assign({}, GOD, { timi: 'Bröns', dagsetning: '2026-12-13', klukkan: '12:00' }) });
  ok('bröns á sunnudegi kl. 12:00 → engin athugasemd', r.status === 200 && sent[0] && !/Athugið/.test(sent[0].body.text));

  console.log('\nklukkan passar ekki við seðilinn: beiðnin fer, með athugasemd');
  sent = [];
  r = await call({ body: Object.assign({}, GOD, { timi: 'Hádegi', dagsetning: '2026-12-10', klukkan: '19:00' }) });
  ok('hádegi kl. 19:00 → merkt', r.status === 200 && sent[0] && /Athugið: Hádegisseðlarnir eru frá 11:30 til 16:00\./.test(sent[0].body.text));
  sent = [];
  r = await call({ body: Object.assign({}, GOD, { timi: 'Kvöld', klukkan: '12:00' }) });
  ok('kvöld kl. 12:00 → merkt', r.status === 200 && sent[0] && /Athugið: Kvöld er valið en klukkan er fyrir kl\. 16:00/.test(sent[0].body.text));

  console.log('\nnetfang með íslenskum stöfum (vafrinn sendir punycode)');
  sent = [];
  r = await call({ body: Object.assign({}, GOD, { netfang: 'jon@xn--rageri-pta4je.is' }) });
  ok('í póstinum stendur jon@ráðagerði.is, svarnetfangið helst punycode', r.status === 200 && sent[0] && /Netfang: jon@ráðagerði\.is/.test(sent[0].body.text) && /jon@ráðagerði\.is/.test(sent[0].body.html) && sent[0].body.reply_to === 'jon@xn--rageri-pta4je.is');
  sent = [];
  r = await call({ body: Object.assign({}, GOD, { timi: 'Bröns', dagsetning: '2026-12-11', klukkan: '18:00' }) });
  ok('bröns á föstudegi kl. 18:00 → báðar athugasemdir', r.status === 200 && sent[0] && /Bröns er um helgar[^\n]*Bröns er frá 11:00 til 15:30\./.test(sent[0].body.text));

  console.log('\nóvenjuleg gildi');
  sent = [];
  r = await call({ body: { fjoldi: '14', nafn: { toString: 1 }, simi: '8991234' } });
  ok('hlutur í stað texta ({"toString":1}) → 400, kastar ekki', r.status === 400 && r.json && r.json.error === 'Nafn vantar.' && sent.length === 0);
  sent = [];
  r = await call({ body: { fjoldi: { valueOf: 1 }, nafn: 'Anna', simi: '8991234' } });
  ok('hlutur í fjölda → 400', r.status === 400 && r.json && r.json.error === 'Veljið fjölda gesta.');
  sent = [];
  r = await call({ body: Object.assign({}, GOD, { nafn: '\u202e\u2066\u2069\u061c' }) });
  ok('ósýnilegt nafn úr stefnustöfum (U+2066–2069, U+061C) → „Nafn vantar.“', r.status === 400 && r.json && r.json.error === 'Nafn vantar.');
  sent = [];
  r = await call({ body: Object.assign({}, GOD, { simi: '\u2067899 1234\u2069' }) });
  ok('stefnustafir teknir úr síma', r.status === 200 && sent[0] && /Sími: 899 1234\n/.test(sent[0].body.text));
  const key = process.env.RESEND_API_KEY; delete process.env.RESEND_API_KEY;
  r = await call({ body: GOD });
  ok('enginn lykill → 503 „Bókunarbeiðnir eru ekki uppsettar hér“', r.status === 503 && r.json.error === 'Bókunarbeiðnir eru ekki uppsettar hér');
  process.env.RESEND_API_KEY = key;

  console.log('\nreitir');
  for (const [lbl, patch, villa] of [['enginn fjöldi', { fjoldi: '' }, 'Veljið fjölda gesta.'], ['liðin dagsetning', { dagsetning: '2020-01-01' }, 'Dagsetningin er liðin.'],
    ['ekkert nafn', { nafn: '' }, 'Nafn vantar.'], ['ekkert netfang', { netfang: '' }, 'Netfang vantar.'], ['enginn sími', { simi: '' }, 'Símanúmer vantar.'], ['hvorki netfang né sími', { netfang: '', simi: '' }, 'Netfang vantar.'],
    ['rangt netfang', { netfang: 'anna@' }, 'Netfangið virðist ekki rétt.'], ['of stuttur sími', { simi: '1234' }, 'Símanúmerið virðist ekki rétt.']]) {
    sent = [];
    r = await call({ body: Object.assign({}, GOD, patch) });
    ok(lbl + ' → 400 „' + villa + '“, ekkert sent', r.status === 400 && sent.length === 0 && r.json && r.json.error === villa);
  }
  sent = [];
  r = await call({ body: Object.assign({}, GOD, { timi: 'toString' }) });
  ok('óþekktur tími („toString“) → sleppt, ekki villa', r.status === 200 && sent[0] && !/Hvenær: /.test(sent[0].body.text));
  sent = [];
  r = await call({ body: { fjoldi: '8', nafn: 'Siggi', simi: '5551234', netfang: 'siggi@example.com' } });
  ok('færri en 11 og ekkert annað valið → samt sent (starfsfólkið metur)', r.status === 200 && sent[0] && sent[0].body.subject === 'Hópabókun: 8 gestir — Siggi');
  sent = [];
  await call({ body: Object.assign({}, GOD, { sedill: '<img src=x onerror=alert(1)>', oskir: '<script>x</script>' }) });
  ok('allt stafað út í HTML-póstinum', sent[0] && !/<img |<script>/.test(sent[0].body.html) && /&lt;img/.test(sent[0].body.html));

  console.log('\nán JavaScript og af öðrum vef');
  r = await call({ body: GOD, json: false });
  ok('sent → 303 á /hopar, beint á þakkirnar', r.status === 303 && r.h.location === '/hopar?sent=1#v-takk');
  r = await call({ body: Object.assign({}, GOD, { nafn: '' }), json: false });
  ok('villa → 303 á villuboðin', r.status === 303 && r.h.location === '/hopar?villa=1#v-villa-anjs');
  sent = [];
  r = await call({ body: GOD, headers: { origin: 'https://illt.example' } });
  ok('af öðrum vef → 403, ekkert sent', r.status === 403 && sent.length === 0);

  console.log(`\nsamtals: ${pass} í lagi, ${fail} brugðust`);
  process.exit(fail ? 1 : 0);
})();
