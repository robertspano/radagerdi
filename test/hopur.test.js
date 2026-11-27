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

  console.log('\ndagar og tímar sem passa ekki við seðilinn: hafnað');
  const hafna = async (lbl, patch, villa) => { sent = []; r = await call({ body: Object.assign({}, GOD, patch) }); ok(lbl + ' → 400 „' + villa + '“, ekkert sent', r.status === 400 && sent.length === 0 && r.json && r.json.error === villa); };
  const taka = async (lbl, patch) => { sent = []; r = await call({ body: Object.assign({}, GOD, patch) }); ok(lbl + ' → sent', r.status === 200 && sent.length === 1); };
  // 2026-12-10 fim, 11 fös, 12 lau, 13 sun
  await hafna('hádegi á laugardegi', { timi: 'Hádegi', dagsetning: '2026-12-12', klukkan: '12:00' }, 'Hádegi er aðeins á virkum dögum — um helgar er bröns.');
  await hafna('hádegi á sunnudegi', { timi: 'Hádegi', dagsetning: '2026-12-13', klukkan: '12:00' }, 'Hádegi er aðeins á virkum dögum — um helgar er bröns.');
  await hafna('hádegi kl. 15:15', { timi: 'Hádegi', dagsetning: '2026-12-10', klukkan: '15:15' }, 'Síðasti komutími hópa í hádeginu er kl. 15:00.');
  await hafna('hádegi kl. 11:00', { timi: 'Hádegi', dagsetning: '2026-12-10', klukkan: '11:00' }, 'Hádegi byrjar kl. 11:30.');
  await taka('hádegi á fimmtudegi kl. 15:00', { timi: 'Hádegi', dagsetning: '2026-12-10', klukkan: '15:00' });
  await hafna('bröns á föstudegi', { timi: 'Bröns', dagsetning: '2026-12-11', klukkan: '12:00' }, 'Bröns er aðeins um helgar — veljið laugardag eða sunnudag.');
  await hafna('bröns kl. 15:15', { timi: 'Bröns', dagsetning: '2026-12-13', klukkan: '15:15' }, 'Síðasti komutími hópa í bröns er kl. 15:00.');
  await hafna('bröns kl. 10:45', { timi: 'Bröns', dagsetning: '2026-12-12', klukkan: '10:45' }, 'Bröns byrjar kl. 11:00.');
  await hafna('kvöld á virkum degi kl. 11:00 (fyrir opnun)', { timi: 'Kvöld', dagsetning: '2026-12-10', klukkan: '11:00' }, 'Við opnum kl. 11:30 á virkum dögum.');
  await hafna('enginn tími valinn, virkur dagur kl. 11:15', { timi: '', dagsetning: '2026-12-10', klukkan: '11:15' }, 'Við opnum kl. 11:30 á virkum dögum.');
  await hafna('jólaseðill 5. febrúar', { timi: 'Kvöld', sedill: 'Kvöld · Jólaseðill 2026 · 10.900 kr á mann', dagsetning: '2027-02-05', klukkan: '19:00' }, 'Jólaseðillinn er í boði 19. nóvember – 6. janúar.');
  {
    // Tími sem er liðinn í dag en eftir opnun (prófið á aðeins við eftir kl. 11:31 UTC)
    const nu = new Date().toISOString(), kl = nu.slice(11, 16), helgi = [0, 6].includes(new Date().getUTCDay());
    if (kl > '11:31') await hafna('liðinn tími í dag', { timi: '', dagsetning: nu.slice(0, 10), klukkan: '11:30' }, 'Þessi tími er liðinn í dag.');
    else console.log('  – liðinn tími í dag: sleppt (prófið keyrt fyrir kl. 11:31)' + (helgi ? '' : ''));
  }
  await taka('bröns á sunnudegi kl. 11:00', { timi: 'Bröns', dagsetning: '2026-12-13', klukkan: '11:00' });
  await taka('bröns á laugardegi kl. 15:00', { timi: 'Bröns', dagsetning: '2026-12-12', klukkan: '15:00' });
  await hafna('kvöld á laugardegi kl. 15:00', { timi: 'Kvöld', dagsetning: '2026-12-12', klukkan: '15:00' }, 'Kvöld er ekki í boði fyrir kl. 16:00 um helgar.');
  await taka('kvöld á laugardegi kl. 16:00', { timi: 'Kvöld', dagsetning: '2026-12-12', klukkan: '16:00' });
  await taka('kvöld á fimmtudegi kl. 12:00 (kvöldseðlar fást í hádeginu)', { timi: 'Kvöld', dagsetning: '2026-12-10', klukkan: '12:00' });

  console.log('\nnetfang með íslenskum stöfum (vafrinn sendir punycode)');
  sent = [];
  r = await call({ body: Object.assign({}, GOD, { netfang: 'jon@xn--rageri-pta4je.is' }) });
  ok('í póstinum stendur jon@ráðagerði.is, svarnetfangið helst punycode', r.status === 200 && sent[0] && /Netfang: jon@ráðagerði\.is/.test(sent[0].body.text) && /jon@ráðagerði\.is/.test(sent[0].body.html) && sent[0].body.reply_to === 'jon@xn--rageri-pta4je.is');

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
    ['ekkert nafn', { nafn: '' }, 'Nafn vantar.'], ['ekkert netfang', { netfang: '' }, 'Netfang vantar.'], ['enginn sími', { simi: '' }, 'Símanúmer vantar.'], ['engin dagsetning', { dagsetning: '' }, 'Veljið dagsetningu.'], ['engin klukka', { klukkan: '' }, 'Veljið klukkan hvað.'], ['hvorki netfang né sími', { netfang: '', simi: '' }, 'Netfang vantar.'],
    ['rangt netfang', { netfang: 'anna@' }, 'Netfangið virðist ekki rétt.'], ['of stuttur sími', { simi: '1234' }, 'Símanúmerið virðist ekki rétt.']]) {
    sent = [];
    r = await call({ body: Object.assign({}, GOD, patch) });
    ok(lbl + ' → 400 „' + villa + '“, ekkert sent', r.status === 400 && sent.length === 0 && r.json && r.json.error === villa);
  }
  sent = [];
  r = await call({ body: Object.assign({}, GOD, { timi: 'toString' }) });
  ok('óþekktur tími („toString“) → sleppt, ekki villa', r.status === 200 && sent[0] && !/Hvenær: /.test(sent[0].body.text));
  sent = [];
  r = await call({ body: { fjoldi: '8', nafn: 'Siggi', simi: '5551234', netfang: 'siggi@example.com', dagsetning: GOD.dagsetning, klukkan: GOD.klukkan } });
  ok('færri en 11 og ekkert annað valið → samt sent (starfsfólkið metur)', r.status === 200 && sent[0] && /^Hópabókun: 8 gestir · .+ kl\. \d\d:\d\d — Siggi$/.test(sent[0].body.subject));
  sent = [];
  r = await call({ body: Object.assign({}, GOD, { timi: 'Kvöld', sedill: 'Kvöld · Jólaseðill 2026 · 10.900 kr á mann', dagsetning: '2026-12-18', klukkan: '19:00' }) });
  ok('jólaseðill 18. desember kl. 19 → sent', r.status === 200 && sent.length === 1);
  sent = [];
  r = await call({ body: Object.assign({}, GOD, { fjoldi: '31' }) });
  ok('31 gestur → 400 (hópabókunin tekur að hámarki 30, eins og síðan)', r.status === 400 && sent.length === 0 && r.json.error === 'Veljið fjölda gesta.');
  sent = [];
  await call({ body: Object.assign({}, GOD, { sedill: '<img src=x onerror=alert(1)>', oskir: '<script>x</script>' }) });
  ok('allt stafað út í HTML-póstinum', sent[0] && !/<img |<script>/.test(sent[0].body.html) && /&lt;img/.test(sent[0].body.html));

  console.log('\nhvert villuboð á sér enska þýðingu (sömu orð og enska síðan, en-hopar.html)');
  const TAFLA = [
    ['Veljið fjölda gesta.', 'Please choose the number of guests.'],
    ['Dagsetningin er liðin.', 'That date has already passed.'],
    ['Nafn vantar.', 'Please enter your name.'],
    ['Netfang eða símanúmer vantar svo hægt sé að svara.', 'Please enter an email address or phone number so we can reply.'],
    ['Netfangið virðist ekki rétt.', 'The email address does not look right.'],
    ['Símanúmerið virðist ekki rétt.', 'The phone number does not look right.'],
    ['Netfang vantar.', 'Please enter your email address.'],
    ['Símanúmer vantar.', 'Please enter your phone number.'],
    ['Veljið dagsetningu.', 'Please choose a date.'],
    ['Veljið klukkan hvað.', 'Please choose a time.'],
    ['Bröns er aðeins um helgar — veljið laugardag eða sunnudag.', 'Brunch is only at weekends — please choose a Saturday or Sunday.'],
    ['Bröns byrjar kl. 11:00.', 'Brunch starts at 11:00.'],
    ['Síðasti komutími hópa í bröns er kl. 15:00.', 'The latest arrival time for groups at brunch is 15:00.'],
    ['Hádegi er aðeins á virkum dögum — um helgar er bröns.', 'Lunch is only on weekdays — at weekends we serve brunch.'],
    ['Hádegi byrjar kl. 11:30.', 'Lunch starts at 11:30.'],
    ['Síðasti komutími hópa í hádeginu er kl. 15:00.', 'The latest arrival time for groups at lunch is 15:00.'],
    ['Kvöld er ekki í boði fyrir kl. 16:00 um helgar.', 'Dinner is not available before 16:00 at weekends.'],
    ['Við opnum kl. 11:30 á virkum dögum.', 'We open at 11:30 on weekdays.'],
    ['Þessi tími er liðinn í dag.', 'That time has already passed today.'],
    ['Jólaseðillinn er í boði 19. nóvember – 6. janúar.', 'The Christmas menu is available 19 November – 6 January.'],
  ];
  const ENSKA = handler.ENSKA;
  ok('þýðingin er nákvæmlega taflan sem síðan og API deila (' + TAFLA.length + ' boð, ekkert umfram)', ENSKA instanceof Map && ENSKA.size === TAFLA.length && TAFLA.every(([is, en]) => ENSKA.get(is) === en));
  {
    // Öll boð sem reglur() í api/hopur.js og athugaGrunn() í api/_pontun.js geta skilað, lesin úr kóðanum sjálfum
    const fs = require('fs');
    const fall = (skra, upphaf) => { const s = fs.readFileSync(path.join(__dirname, '..', 'api', skra), 'utf8'), i = s.indexOf(upphaf), j = s.indexOf('\n}\n', i); return i >= 0 && j > i ? s.slice(i, j) : ''; };
    const bod = (kodi) => [...kodi.matchAll(/(?:return|!==) '([^'\\]+)'/g)].map((x) => x[1]);
    const ur = bod(fall('hopur.js', 'function reglur(g)')), urGrunni = bod(fall('_pontun.js', 'function athugaGrunn(g)'));
    const vantar = ur.concat(urGrunni).filter((x) => !ENSKA.has(x));
    ok('hvert boð sem reglur() (' + ur.length + ') og athugaGrunn() (' + urGrunni.length + ') skila hefur enska þýðingu' + (vantar.length ? ' — vantar: ' + vantar.join(' | ') : ''), ur.length >= 15 && urGrunni.length >= 5 && vantar.length === 0);
    ok('…og taflan hefur engin boð sem kóðinn skilar ekki', TAFLA.every(([is]) => ur.includes(is) || urGrunni.includes(is)));
  }

  console.log('\nenska síðan (en-hopar): sömu reglur, svörin á ensku, pósturinn til okkar á íslensku');
  const EN = Object.assign({}, GOD, { mal: 'en', sedill: 'Kvöld · Option 2 · 9.900 kr per person', oskir: 'Birthday. One nut allergy.' });
  sent = [];
  r = await call({ body: EN });
  ok('200 og ok', r.status === 200 && r.json && r.json.ok === true && sent.length === 1);
  const me = sent[0] && sent[0].body;
  ok('efnislína „Hópabókun (á ensku): …“', me && me.subject === 'Hópabókun (á ensku): 14 gestir · Kvöld · föstudagur 11. desember 2026 kl. 19:00 — Anna Jónsdóttir');
  ok('„Tungumál: Enska — svarið gestinum á ensku“ beint á eftir „Fjöldi“', me && /^Fjöldi: 14 gestir\nTungumál: Enska — svarið gestinum á ensku\nHvenær: Kvöld\nHópaseðill: Kvöld · Option 2 · 9\.900 kr per person\n/.test(me.text));
  ok('…líka í HTML-póstinum, með fyrirsögninni', me && /Fjöldi<\/td><td>14 gestir<\/td><\/tr><tr><td[^>]*>Tungumál<\/td><td>Enska — svarið gestinum á ensku<\/td>/.test(me.html) && /<h2[^>]*>Hópabókun \(á ensku\)<\/h2>/.test(me.html));
  ok('sent af radagerdi.is/en-hopar, svarið beint til gestsins', me && /— Sent af radagerdi\.is\/en-hopar\. Svarið beint á þennan póst til að svara Anna Jónsdóttir\.$/.test(me.text) && me.reply_to === 'anna@example.com' && JSON.stringify(me.to) === JSON.stringify(['radagerdi@radagerdi170.is']));
  ok('íslenski pósturinn óbreyttur: engin Tungumál-lína, radagerdi.is/hopar', m && /^Fjöldi: 14 gestir\nHvenær: Kvöld\n/.test(m.text) && !/Tungumál|á ensku|en-hopar/.test(m.text + m.html) && /— Sent af radagerdi\.is\/hopar\./.test(m.text));

  const hafnaEn = async (lbl, patch, villa) => { sent = []; r = await call({ body: Object.assign({}, EN, patch) }); ok(lbl + ' → 400 „' + villa + '“, ekkert sent', r.status === 400 && sent.length === 0 && r.json && r.json.error === villa); };
  const takaEn = async (lbl, patch) => { sent = []; r = await call({ body: Object.assign({}, EN, patch) }); ok(lbl + ' → sent', r.status === 200 && sent.length === 1 && /^Hópabókun \(á ensku\): /.test(sent[0].body.subject)); };
  await hafnaEn('brunch á föstudegi', { timi: 'Bröns', dagsetning: '2026-12-11', klukkan: '12:00' }, 'Brunch is only at weekends — please choose a Saturday or Sunday.');
  await hafnaEn('brunch kl. 10:45', { timi: 'Bröns', dagsetning: '2026-12-12', klukkan: '10:45' }, 'Brunch starts at 11:00.');
  await hafnaEn('brunch kl. 15:15', { timi: 'Bröns', dagsetning: '2026-12-13', klukkan: '15:15' }, 'The latest arrival time for groups at brunch is 15:00.');
  await hafnaEn('lunch á laugardegi', { timi: 'Hádegi', dagsetning: '2026-12-12', klukkan: '12:00' }, 'Lunch is only on weekdays — at weekends we serve brunch.');
  await hafnaEn('lunch kl. 11:00', { timi: 'Hádegi', dagsetning: '2026-12-10', klukkan: '11:00' }, 'Lunch starts at 11:30.');
  await hafnaEn('lunch kl. 15:15', { timi: 'Hádegi', dagsetning: '2026-12-10', klukkan: '15:15' }, 'The latest arrival time for groups at lunch is 15:00.');
  await hafnaEn('dinner á laugardegi kl. 15:00', { timi: 'Kvöld', dagsetning: '2026-12-12', klukkan: '15:00' }, 'Dinner is not available before 16:00 at weekends.');
  await hafnaEn('virkur dagur kl. 11:00 (fyrir opnun)', { timi: 'Kvöld', dagsetning: '2026-12-10', klukkan: '11:00' }, 'We open at 11:30 on weekdays.');
  await hafnaEn('Christmas Menu 5. febrúar', { timi: 'Kvöld', sedill: 'Kvöld · Christmas Menu 2026 · 10.900 kr per person', dagsetning: '2027-02-05', klukkan: '19:00' }, 'The Christmas menu is available 19 November – 6 January.');
  await hafnaEn('Christmas Menu 18. nóvember', { timi: 'Kvöld', sedill: 'Kvöld · Christmas Menu 2026 · 10.900 kr per person', dagsetning: '2026-11-18', klukkan: '19:00' }, 'That date has already passed.');
  await takaEn('Christmas Menu 18. desember kl. 19', { timi: 'Kvöld', sedill: 'Kvöld · Christmas Menu 2026 · 10.900 kr per person', dagsetning: '2026-12-18', klukkan: '19:00' });
  await takaEn('Christmas Menu 6. janúar kl. 19 (síðasti dagur)', { timi: 'Kvöld', sedill: 'Kvöld · Christmas Menu 2026 · 10.900 kr per person', dagsetning: '2027-01-06', klukkan: '19:00' });
  sent = [];
  r = await call({ body: Object.assign({}, GOD, { sedill: 'Kvöld · Christmas Menu 2026 · 10.900 kr per person', dagsetning: '2027-02-05' }) });
  ok('enskt nafn jólaseðilsins án mal → sama regla, íslensk villa', r.status === 400 && sent.length === 0 && r.json.error === 'Jólaseðillinn er í boði 19. nóvember – 6. janúar.');
  {
    // Tími sem er liðinn í dag: klukkan fest á fimmtudaginn 10. desember 2026 kl. 14:00 UTC, svo prófið gildi alltaf
    const D = global.Date, FAST = D.UTC(2026, 11, 10, 14, 0);
    global.Date = class extends D { constructor(...a) { if (a.length) super(...a); else super(FAST); } };
    try {
      await hafnaEn('liðinn tími í dag (lunch kl. 12:00, klukkan 14:00)', { timi: 'Hádegi', dagsetning: '2026-12-10', klukkan: '12:00' }, 'That time has already passed today.');
      await hafna('…og á íslensku', { timi: 'Hádegi', dagsetning: '2026-12-10', klukkan: '12:00' }, 'Þessi tími er liðinn í dag.');
    } finally { global.Date = D; }
  }
  for (const [lbl, patch, villa] of [['enginn fjöldi', { fjoldi: '' }, 'Please choose the number of guests.'], ['31 gestur', { fjoldi: '31' }, 'Please choose the number of guests.'],
    ['liðin dagsetning', { dagsetning: '2020-01-01' }, 'That date has already passed.'], ['ekkert nafn', { nafn: '' }, 'Please enter your name.'],
    ['ekkert netfang', { netfang: '' }, 'Please enter your email address.'], ['enginn sími', { simi: '' }, 'Please enter your phone number.'],
    ['hvorki netfang né sími', { netfang: '', simi: '' }, 'Please enter your email address.'], ['engin dagsetning', { dagsetning: '' }, 'Please choose a date.'],
    ['engin klukka', { klukkan: '' }, 'Please choose a time.'], ['rangt netfang', { netfang: 'anna@' }, 'The email address does not look right.'],
    ['of stuttur sími', { simi: '1234' }, 'The phone number does not look right.']]) {
    await hafnaEn(lbl, patch, villa);
  }

  console.log('\nmal sem er ekki nákvæmlega „en“ → íslenska, kastar ekki');
  for (const [lbl, mal] of [['„EN“', 'EN'], ['["en"]', ['en']], ['{"toString":1}', { toString: 1 }], ['„de“', 'de'], ['„ en“', ' en'], ['null', null], ['1', 1], ['{}', {}]]) {
    sent = [];
    const r1 = await call({ body: Object.assign({}, GOD, { mal, nafn: '' }) });
    sent = [];
    const r2 = await call({ body: Object.assign({}, GOD, { mal }) });
    ok('mal ' + lbl + ' → „Nafn vantar.“ og íslenskur póstur', r1.status === 400 && r1.json && r1.json.error === 'Nafn vantar.' && r2.status === 200 && sent.length === 1 && /^Hópabókun: /.test(sent[0].body.subject) && !/Tungumál|en-hopar/.test(sent[0].body.text));
  }

  console.log('\nenska síðan án JavaScript: vísað aftur á /en-hopar');
  sent = [];
  r = await call({ body: EN, json: false });
  ok('sent → 303 á /en-hopar?sent=1#v-takk, póstur á ensku-merktur', r.status === 303 && r.h.location === '/en-hopar?sent=1#v-takk' && sent.length === 1 && /^Hópabókun \(á ensku\): /.test(sent[0].body.subject));
  sent = [];
  r = await call({ body: Object.assign({}, EN, { nafn: '' }), json: false });
  ok('villa → 303 á /en-hopar?villa=1#v-villa-anjs, ekkert sent', r.status === 303 && r.h.location === '/en-hopar?villa=1#v-villa-anjs' && sent.length === 0);
  sent = [];
  r = await call({ body: Object.assign({}, EN, { timi: 'Bröns' }), json: false });
  ok('regluvilla (brunch á föstudegi) → /en-hopar?villa=1#v-villa-anjs', r.status === 303 && r.h.location === '/en-hopar?villa=1#v-villa-anjs' && sent.length === 0);
  sent = [];
  r = await call({ body: Object.assign({}, EN, { vefsida: 'http://spam.example' }), json: false });
  ok('gildran fyllt → eins og sent (/en-hopar?sent=1#v-takk) en ekkert sent', r.status === 303 && r.h.location === '/en-hopar?sent=1#v-takk' && sent.length === 0);
  for (const mal of ['EN', 'de', '']) {
    r = await call({ body: Object.assign({}, GOD, { mal, nafn: '' }), json: false });
    ok('mal „' + mal + '“ án JavaScript → íslenska síðan /hopar', r.status === 303 && r.h.location === '/hopar?villa=1#v-villa-anjs');
  }
  r = await call({ body: GOD, json: false });
  ok('íslenska óbreytt: sent → /hopar?sent=1#v-takk', r.status === 303 && r.h.location === '/hopar?sent=1#v-takk');
  r = await new Promise((resolve) => {
    // Of löng sending (yfir 20000 bæti) fellur áður en hún er lesin: þá er tungumálið óþekkt
    const h = {}, stor = Buffer.from('mal=en&nafn=Anna&oskir=' + 'x'.repeat(25000));
    const req = { method: 'POST', url: '/api/hopur', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://radagerdi.is', 'x-forwarded-for': '10.3.0.1' }, async *[Symbol.asyncIterator]() { yield stor; } };
    const res = { statusCode: 200, setHeader(k, v) { h[k.toLowerCase()] = v; }, end() { resolve({ status: this.statusCode, h }); } };
    Promise.resolve(handler(req, res)).catch((e) => resolve({ status: 'KASTAÐI', err: e.stack }));
  });
  ok('villa áður en sendingin er lesin (of löng) → sjálfgefna síðan /hopar', r.status === 303 && r.h.location === '/hopar?villa=1#v-villa-anjs');

  console.log('\nsvör _pontun.js á ensku (enginn lykill, bilun, hemill) — íslenskan óbreytt');
  {
    const lykill = process.env.RESEND_API_KEY; delete process.env.RESEND_API_KEY;
    r = await call({ body: EN });
    ok('enginn lykill → 503 „Booking requests are not set up here.“', r.status === 503 && r.json && r.json.error === 'Booking requests are not set up here.');
    r = await call({ body: EN, json: false });
    ok('…án JavaScript → /en-hopar?villa=1#v-villa-anjs', r.status === 303 && r.h.location === '/en-hopar?villa=1#v-villa-anjs');
    r = await call({ body: GOD });
    ok('…á íslensku óbreytt', r.status === 503 && r.json.error === 'Bókunarbeiðnir eru ekki uppsettar hér');
    process.env.RESEND_API_KEY = lykill;

    const f = global.fetch, ce = console.error;
    global.fetch = async () => ({ ok: false, status: 500, text: async () => 'bilun' }); console.error = () => {};
    r = await call({ body: EN });
    const r2 = await call({ body: GOD });
    global.fetch = f; console.error = ce;
    ok('Resend bilar → 502 „We could not send your request.“', r.status === 502 && r.json && r.json.error === 'We could not send your request.');
    ok('…á íslensku óbreytt („Ekki tókst að senda beiðnina“)', r2.status === 502 && r2.json && r2.json.error === 'Ekki tókst að senda beiðnina');

    const svorEn = [], svorIs = [];
    for (let i = 0; i < 6; i++) svorEn.push(await call({ body: EN, headers: { 'x-forwarded-for': '10.4.4.4' } }));
    for (let i = 0; i < 6; i++) svorIs.push(await call({ body: GOD, headers: { 'x-forwarded-for': '10.4.4.5' } }));
    ok('hemill á IP-tölu → 429 á ensku', svorEn.slice(0, 5).every((x) => x.status === 200) && svorEn[5].status === 429 && svorEn[5].json.error === 'Too many requests in a row — please call 546-1700 or email radagerdi@radagerdi170.is.');
    ok('…á íslensku óbreytt', svorIs[5].status === 429 && svorIs[5].json.error === 'Of margar beiðnir í röð — hringið í 546-1700 eða sendið póst á radagerdi@radagerdi170.is');
  }

  console.log('\nán JavaScript og af öðrum vef');
  r = await call({ body: GOD, json: false });
  ok('sent → 303 á /hopar, beint á þakkirnar', r.status === 303 && r.h.location === '/hopar?sent=1#v-takk');
  r = await call({ body: Object.assign({}, GOD, { nafn: '' }), json: false });
  ok('villa → 303 á villuboðin', r.status === 303 && r.h.location === '/hopar?villa=1#v-villa-anjs');
  sent = [];
  r = await call({ body: GOD, headers: { origin: 'https://illt.example' } });
  ok('af öðrum vef → 403, ekkert sent', r.status === 403 && sent.length === 0);

  console.log('\ndagsþak (60 á sólarhring á tilvik) — síðast, því eftir það er öllu hafnað');
  {
    const ce = console.error; console.error = () => {};
    let x = null;
    for (let i = 0; i < 80 && !x; i++) { const y = await call({ body: EN }); if (y.status === 429) x = y; }
    const is = await call({ body: GOD }), anjs = await call({ body: EN, json: false });
    console.error = ce;
    ok('dagsþak → 429 á ensku', x && x.json && x.json.error === 'The booking form is closed for now — please call 546-1700 or email radagerdi@radagerdi170.is.');
    ok('…á íslensku óbreytt', is.status === 429 && is.json.error === 'Bókunarformið er lokað í bili — hringið í 546-1700 eða sendið póst á radagerdi@radagerdi170.is');
    ok('…án JavaScript → /en-hopar?villa=1#v-villa-anjs', anjs.status === 303 && anjs.h.location === '/en-hopar?villa=1#v-villa-anjs');
  }

  console.log(`\nsamtals: ${pass} í lagi, ${fail} brugðust`);
  process.exit(fail ? 1 : 0);
})();
