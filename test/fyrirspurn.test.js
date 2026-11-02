/* Veislupöntunin — prófanir sem má keyra hvenær sem er:  node test/fyrirspurn.test.js
 *
 * Ekkert fer á netið: sendingin til Resend er gripin og skoðuð. Hver lína hér er annaðhvort
 * eitthvað sem gesturinn þarf að geta (senda pöntun) eða leið sem einhver gæti reynt að
 * misnota formið um (senda öðrum póst, rusl, of mikið, af öðrum vef).
 */
'use strict';
const path = require('path');
process.env.RESEND_API_KEY = 're_prof';
process.env.SESSION_SECRET = 'prufulykill-sem-er-nogu-langur-1234567890';
delete process.env.FYRIRSPURN_TO;
const handler = require(path.join(__dirname, '..', 'api', 'fyrirspurn.js'));

let pass = 0, fail = 0;
const ok = (name, cond) => { cond ? (pass++, console.log('  ✓ ' + name)) : (fail++, console.log('  ✗ ' + name)); };

let sent = [], resendStatus = 200;
let svorRod = null;   // ef listi: svör Resend í röð (t.d. [422, 200])
global.fetch = async (url, opts) => {
  sent.push({ url, body: JSON.parse(opts.body), auth: opts.headers.Authorization });
  const st = svorRod && svorRod.length ? svorRod.shift() : resendStatus;
  return { ok: st < 300, status: st, text: async () => 'villa frá Resend' };
};
let ip = 0;
function call({ body, json = true, method = 'POST', headers = {} } = {}) {
  ip++;
  const req = { method, url: '/api/fyrirspurn', headers: Object.assign({ 'content-type': json ? 'application/json' : 'application/x-www-form-urlencoded', origin: 'https://radagerdi.is', 'x-forwarded-for': '10.1.' + Math.floor(ip / 250) + '.' + (ip % 250) }, headers),
    body: json ? JSON.stringify(body || {}) : new URLSearchParams(body || {}).toString() };
  return new Promise((resolve) => {
    const h = {};
    const res = { statusCode: 200, setHeader(k, v) { h[k.toLowerCase()] = v; }, end(b) { resolve({ status: this.statusCode, h, json: (() => { try { return JSON.parse(b); } catch (e) { return null; } })() }); } };
    Promise.resolve(handler(req, res)).catch((e) => resolve({ status: 'KASTAÐI', err: e.stack }));
  });
}
const GOD = { fjoldi: '30', veisla: 'Stórveisla', val: 'Focaccia-samlokur: Parma, Mortadella\nBruschettur: Caprese, Gullostur, Carpaccio',
  aaetlad: '254.700 kr (30 × 8.490 kr, auk boxagjalds)', afhending: 'Sótt', dagsetning: '2026-12-12', klukkan: '17:00',
  oskir: 'Grænmetisréttir fyrir fimm.\nOg kaka.', nafn: 'Jón Jónsson', netfang: 'jon@example.com', simi: '+354 555 1234', vefsida: '' };

(async () => {
  console.log('\ngóð pöntun');
  sent = [];
  let r = await call({ body: GOD });
  ok('200 og ok', r.status === 200 && r.json && r.json.ok === true);
  ok('einn póstur sendur', sent.length === 1 && sent[0].url === 'https://api.resend.com/emails');
  const m = sent[0] && sent[0].body;
  ok('til Ráðagerðis og engra annarra', m && JSON.stringify(m.to) === JSON.stringify(['radagerdi@radagerdi170.is']) && !m.cc && !m.bcc);
  ok('frá staðfesta léninu fyrirspurn.radagerdi.is', m && /@fyrirspurn\.radagerdi\.is>$/.test(m.from));
  ok('svarnetfang er gesturinn (svarað beint)', m && m.reply_to === 'jon@example.com');
  ok('efnislína segir fjölda, veislu, tíma og afhendingu', m && m.subject === 'Veislupöntun: 30 gestir · Stórveisla · laugardagur 12. desember 2026 kl. 17:00 · sótt — Jón Jónsson');
  ok('textinn hefur allt', m && /Fjöldi: 30 gestir/.test(m.text) && /Veisla: Stórveisla/.test(m.text) && /Sími: \+354 555 1234/.test(m.text) && /Óskir:\nGrænmetisréttir fyrir fimm\.\nOg kaka\./.test(m.text));
  ok('réttirnir og áætlað verð fylgja', m && /Réttir:\nFocaccia-samlokur: Parma, Mortadella\nBruschettur: Caprese, Gullostur, Carpaccio/.test(m.text) && /Áætlað verð: 254\.700 kr/.test(m.text) && /Afhending: Sótt í Ráðagerði/.test(m.text));
  ok('réttirnir líka í HTML-póstinum', m && /Réttir<\/p><p[^>]*>Focaccia-samlokur: Parma, Mortadella\nBruschettur/.test(m.html));
  ok('lykillinn fer aðeins í hausinn', sent[0] && sent[0].auth === 'Bearer re_prof' && !JSON.stringify(m).includes('re_prof'));

  console.log('\nstafað út — ekkert úr forminu verður að HTML í póstinum');
  sent = [];
  await call({ body: Object.assign({}, GOD, { nafn: 'Jón <script>x</script>', oskir: '<img src=x onerror=alert(1)> & "gæsalappir"', val: '<b>Parma</b>', aaetlad: '<i>0 kr</i>', heimilisfang: '<u>x</u>', afhending: 'Sent' }) });
  ok('<script> og <img> stafað út', sent[0] && !/<script>|<img /.test(sent[0].body.html) && /&lt;script&gt;/.test(sent[0].body.html) && /&lt;img/.test(sent[0].body.html));
  ok('réttir, verð og heimilisfang líka stöfuð út', sent[0] && !/<b>Parma|<i>0|<u>x/.test(sent[0].body.html) && /&lt;b&gt;Parma/.test(sent[0].body.html) && /&lt;i&gt;0 kr/.test(sent[0].body.html) && /&lt;u&gt;x/.test(sent[0].body.html));
  sent = [];
  await call({ body: Object.assign({}, GOD, { nafn: 'Jón\r\nBcc: annar@example.com' }) });
  ok('línuskil í nafni verða ekki að nýjum haus', sent[0] && !/\n/.test(sent[0].body.subject) && !sent[0].body.bcc);

  console.log('\nreitir');
  sent = [];
  r = await call({ body: Object.assign({}, GOD, { netfang: '' }) });
  ok('sími dugir án netfangs (ekkert svarnetfang)', r.status === 200 && sent[0] && !('reply_to' in sent[0].body));
  for (const [lbl, patch] of [['enginn fjöldi', { fjoldi: '' }], ['fjöldi 0', { fjoldi: '0' }], ['fjöldi 9999', { fjoldi: '9999' }], ['ekkert nafn', { nafn: '  ' }], ['hvorki netfang né sími', { netfang: '', simi: '' }],
    ['rangt netfang', { netfang: 'jon@' }], ['netfang með kommu (fleiri viðtakendur)', { netfang: 'a@b.is,c@d.is' }], ['tvöfaldur punktur í léni', { netfang: 'jon@gmail..com' }],
    ['punktur aftast', { netfang: 'jon@gmail.com.' }], ['of fáir tölustafir í síma', { simi: '12-34' }]]) {
    sent = [];
    r = await call({ body: Object.assign({}, GOD, patch) });
    ok(lbl + ' → 400, ekkert sent', r.status === 400 && sent.length === 0 && r.json && r.json.error);
  }
  sent = [];
  r = await call({ body: Object.assign({}, GOD, { afhending: 'Sent', heimilisfang: 'Nesvegi 1, 170 Seltjarnarnesi' }) });
  ok('sent → heimilisfangið fylgir', r.status === 200 && sent[0] && /Afhending: Sent á Nesvegi 1, 170 Seltjarnarnesi/.test(sent[0].body.text) && / · sent — /.test(sent[0].body.subject));
  sent = [];
  r = await call({ body: Object.assign({}, GOD, { afhending: 'Sent', heimilisfang: ' ' }) });
  ok('sent án heimilisfangs → 400, ekkert sent', r.status === 400 && sent.length === 0 && r.json.error === 'Heimilisfang vantar.');
  sent = [];
  r = await call({ body: Object.assign({}, GOD, { afhending: 'Flugpóstur', klukkan: '25:99' }) });
  ok('óþekkt afhending og ógild klukka eru slepptar, ekki villa', r.status === 200 && sent[0] && !/Afhending/.test(sent[0].body.text) && !/kl\./.test(sent[0].body.text));
  sent = [];
  r = await call({ body: { fjoldi: '12', nafn: 'Anna', simi: '899 1234' } });
  ok('aðeins fjöldi, nafn og sími dugar', r.status === 200 && sent[0] && sent[0].body.subject === 'Veislupöntun: 12 gestir — Anna' && !/Réttir|Veisla/.test(sent[0].body.text));
  sent = [];
  r = await call({ body: Object.assign({}, GOD, { dagsetning: '2020-01-01' }) });
  ok('liðin dagsetning → 400, ekkert sent', r.status === 400 && sent.length === 0 && r.json.error === 'Dagsetningin er liðin.');
  sent = [];
  r = await call({ body: Object.assign({}, GOD, { dagsetning: new Date().toISOString().slice(0, 10) }) });
  ok('dagurinn í dag er í lagi', r.status === 200 && sent.length === 1);
  for (const x of ['toString', 'valueOf', '__proto__', 'constructor']) {
    sent = [];
    r = await call({ body: Object.assign({}, GOD, { afhending: x }) });
    ok('afhending „' + x + '“ → svarað og sent án afhendingar (kastar ekki)', r.status === 200 && sent.length === 1 && !/Afhending/.test(sent[0].body.text));
  }
  sent = [];
  r = await call({ body: Object.assign({}, GOD, { dagsetning: '2026-02-31' }) });
  ok('ógild dagsetning er slepptur, ekki villa', r.status === 200 && sent[0] && !/Dagsetning/.test(sent[0].body.text));
  sent = [];
  r = await call({ body: Object.assign({}, GOD, { oskir: 'x'.repeat(10000) }) });
  ok('óskir styttar í 3000 stafi', r.status === 200 && sent[0] && sent[0].body.text.length < 3600);
  sent = [];
  r = await call({ body: Object.assign({}, GOD, { fjoldi: ['30', '40'], nafn: ['Jón', 'X'] }) });
  ok('listi í stað gildis → fyrsta gildið', r.status === 200 && sent[0] && /^Veislupöntun: 30 gestir/.test(sent[0].body.subject));

  sent = [];
  r = await call({ body: Object.assign({}, GOD, { simi: 's. 899-1234 / 699 1234' }) });
  ok('sími eins og fólk skrifar hann („s. 899-1234 / 699 1234“) er tekinn gildur', r.status === 200 && sent.length === 1);
  sent = [];
  r = await call({ body: Object.assign({}, GOD, { netfang: 'jon@exa\u200bmple.com' }) });
  ok('ósýnilegir stafir (zero-width) fjarlægðir úr netfangi', r.status === 200 && sent[0] && sent[0].body.reply_to === 'jon@example.com');

  console.log('\nmisnotkun');
  sent = [];
  r = await call({ body: Object.assign({}, GOD, { vefsida: 'http://spam.example' }) });
  ok('vélmenni (gildran fyllt) fær „í lagi" en ekkert er sent', r.status === 200 && r.json.ok && sent.length === 0);
  sent = [];
  r = await call({ body: GOD, headers: { origin: 'https://illt.example' } });
  ok('af öðrum vef → 403, ekkert sent', r.status === 403 && sent.length === 0);
  r = await call({ body: GOD, headers: { origin: undefined, referer: 'https://radagerdi.is.illt.example/x' } });
  ok('líkt lén (radagerdi.is.illt.example) → 403', r.status === 403);
  r = await call({ body: GOD, headers: { origin: undefined, referer: 'https://radagerdi.is/veisluthjonusta' } });
  ok('Referer af vefnum dugir', r.status === 200);
  sent = [];
  r = await call({ body: GOD, headers: { origin: undefined } });
  ok('hvorki Origin né Referer (skrifta, ekki vafri) → 403, ekkert sent', r.status === 403 && sent.length === 0);
  r = await call({ method: 'GET' });
  ok('GET → 405', r.status === 405);
  sent = [];
  const fast = { 'x-forwarded-for': '10.9.9.9' };
  const svor = [];
  for (let i = 0; i < 7; i++) svor.push((await call({ body: GOD, headers: fast })).status);
  ok('hemill: 5 á klukkustund frá sömu IP, svo 429 (' + svor.join(',') + ')', svor.slice(0, 5).every(x => x === 200) && svor[5] === 429 && svor[6] === 429 && sent.length === 5);

  console.log('\nforskoðun (Vercel Preview): eigin slóð gildir, aðrar ekki, og pósturinn er merktur');
  const prev = path.join(__dirname, '..', 'api');
  for (const k of Object.keys(require.cache)) if (k.startsWith(prev)) delete require.cache[k];
  process.env.VERCEL_ENV = 'preview';
  const h2 = require(path.join(prev, 'fyrirspurn.js'));
  const kalla2 = (headers) => new Promise((resolve) => {
    const req = { method: 'POST', url: '/api/fyrirspurn', headers: Object.assign({ 'content-type': 'application/json', 'x-forwarded-for': '10.7.7.' + (++ip % 250) }, headers), body: JSON.stringify(GOD) };
    const res = { statusCode: 200, setHeader() {}, end(b) { resolve({ status: this.statusCode }); } };
    h2(req, res);
  });
  sent = [];
  r = await kalla2({ origin: 'https://radagerdi-git-veisla-x.vercel.app', host: 'radagerdi-git-veisla-x.vercel.app' });
  ok('síða og fyrirspurn á sömu forskoðunarslóð → tekið við', r.status === 200 && sent.length === 1);
  ok('pósturinn frá forskoðun er merktur PRÓFUN', sent[0] && /^PRÓFUN · Veislupöntun: /.test(sent[0].body.subject) && /forskoðun vefsins/.test(sent[0].body.text));
  sent = [];
  r = await kalla2({ origin: 'https://illt.vercel.app', host: 'radagerdi-git-veisla-x.vercel.app' });
  ok('önnur vercel.app-síða → 403, ekkert sent', r.status === 403 && sent.length === 0);
  delete process.env.VERCEL_ENV;
  for (const k of Object.keys(require.cache)) if (k.startsWith(prev)) delete require.cache[k];
  const h3 = require(path.join(prev, 'fyrirspurn.js'));
  sent = [];
  r = await new Promise((resolve) => { h3({ method: 'POST', url: '/api/fyrirspurn', headers: { 'content-type': 'application/json', origin: 'https://radagerdi-git-veisla-x.vercel.app', host: 'radagerdi-git-veisla-x.vercel.app', 'x-forwarded-for': '10.8.8.8' }, body: JSON.stringify(GOD) }, { statusCode: 200, setHeader() {}, end() { resolve({ status: this.statusCode }); } }); });
  ok('í loftinu (production) gildir aðeins radagerdi.is, ekki vercel.app', r.status === 403 && sent.length === 0);

  console.log('\nhemill á IPv6-net (heimili fær heilt /64-net)');
  sent = [];
  const ip6 = [];
  for (let i = 0; i < 7; i++) ip6.push((await call({ body: GOD, headers: { 'x-forwarded-for': '2a01:6f0:4a1:100::' + (i + 1).toString(16) } })).status);
  ok('7 tölur úr sama /64-neti teljast eitt (' + ip6.join(',') + ')', ip6.slice(0, 5).every(x => x === 200) && ip6[5] === 429 && sent.length === 5);

  console.log('\nbilun');
  svorRod = [422, 200]; sent = [];
  r = await call({ body: GOD });
  ok('Resend hafnar svarnetfangi (422) → sent aftur án þess og tekst', r.status === 200 && sent.length === 2 && 'reply_to' in sent[0].body && !('reply_to' in sent[1].body));
  ok('…og þá segir pósturinn ekki „svarið beint“ heldur að skrifa nýjan póst', sent[1] && !/Svarið beint|svarið beint/.test(sent[1].body.text + sent[1].body.html) && /skrifið nýjan póst á jon@example\.com eða hringið í \+354 555 1234/.test(sent[1].body.text) && /Svarið beint/.test(sent[0].body.text));
  svorRod = null;
  resendStatus = 500; sent = [];
  r = await call({ body: GOD });
  ok('Resend bilar → 502 með skilaboðum', r.status === 502 && r.json && !r.json.ok);
  resendStatus = 200;
  const key = process.env.RESEND_API_KEY; delete process.env.RESEND_API_KEY; sent = [];
  r = await call({ body: GOD });
  ok('enginn lykill (localhost) → 503, ekkert sent', r.status === 503 && sent.length === 0);
  process.env.RESEND_API_KEY = key;

  console.log('\nán JavaScript (venjulegt form)');
  sent = [];
  r = await call({ body: GOD, json: false });
  ok('sent → 303 aftur á síðuna, beint á þakkirnar', r.status === 303 && r.h.location === '/veisluthjonusta?sent=1#v-takk' && sent.length === 1);
  r = await call({ body: Object.assign({}, GOD, { nafn: '' }), json: false });
  ok('villa → 303, beint á villuboðin', r.status === 303 && r.h.location === '/veisluthjonusta?villa=1#v-villa-anjs');

  console.log('\ndagsþak (60 á sólarhring á tilvik): eigin skilaboð og skráð í log');
  const villur = []; const ce = console.error; console.error = (...a) => villur.push(a.join(' '));
  let svar429 = null;
  for (let i = 0; i < 80 && !svar429; i++) { const x = await call({ body: GOD, headers: { 'x-forwarded-for': '198.51.' + Math.floor(i / 4) + '.' + (i % 4 + 1) } }); if (x.status === 429) svar429 = x; }
  console.error = ce;
  ok('dagsþakið segir að formið sé lokað í bili, ekki að gesturinn hafi sent of mikið', svar429 && /lokað í bili/.test(svar429.json.error) && !/Of margar/.test(svar429.json.error));
  ok('dagsþakið er skráð í log', villur.some(v => /dagsþak náð/.test(v)));

  console.log(`\nsamtals: ${pass} í lagi, ${fail} brugðust`);
  process.exit(fail ? 1 : 0);
})();
