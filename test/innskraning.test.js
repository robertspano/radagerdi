/* Innskráningin — prófanir sem má keyra hvenær sem er:  node test/innskraning.test.js
 *
 * Hver lína hér stendur fyrir leið sem einhver gæti reynt að fara inn um. Þetta er
 * eina öryggislagið sem eftir stendur: það er ekkert lykilorð til vara, svo bregðist
 * eitthvað af þessu er annaðhvort opið inn eða lokað á eigandann.
 */
process.env.CMS_EMAILS = 'robertstefansson2404@gmail.com, Viktor@RADAGERDI.is';
process.env.RESEND_API_KEY = 're_test';
process.env.SESSION_SECRET = 'prufulykill-sem-er-nogu-langur-1234567890';
const S = require(require('path').join(__dirname, '..', 'api', '_store.js'));

let pass = 0, fail = 0;
const ok = (name, cond) => { cond ? (pass++, console.log('  ✓ ' + name)) : (fail++, console.log('  ✗ ' + name)); };
const cookieReq = (v) => ({ headers: { cookie: 'cms_session=' + v } });
const OWNER = 'robertstefansson2404@gmail.com';

console.log('\naðgangslisti');
ok('eigandinn er á listanum', S.mayEnter(OWNER));
ok('hástafir og bil skipta ekki máli', S.mayEnter('  VIKTOR@radagerdi.is '));
ok('ókunnugt netfang kemst ekki inn', !S.mayEnter('arasarmadur@evil.com'));
ok('tómt netfang kemst ekki inn', !S.mayEnter(''));
ok('viðskeyti dugir ekki', !S.mayEnter('x' + OWNER));

console.log('\ntengillinn');
const link = S.loginLink(OWNER, 'https://radagerdi.is', '/?cms=1');
const u = new URL(link);
const [e, exp, sig] = ['e', 'exp', 'sig'].map(k => u.searchParams.get(k));
ok('réttur tengill gengur', S.checkLink(e, exp, sig));
ok('fiktað í undirskrift fellur', !S.checkLink(e, exp, sig.slice(0, -1) + (sig.slice(-1) === 'a' ? 'b' : 'a')));
ok('annað netfang með sömu undirskrift fellur', !S.checkLink('viktor@radagerdi.is', exp, sig));
ok('lengdur gildistími fellur', !S.checkLink(e, String(Number(exp) + 60000), sig));
ok('útrunninn tengill fellur', !S.checkLink(e, String(Date.now() - 1), S.loginLink(OWNER, 'https://radagerdi.is').split('sig=')[1]));
ok('tómri undirskrift er hafnað', !S.checkLink(e, exp, ''));
ok('netfang utan lista fellur þótt undirskrift væri rétt', !S.checkLink('arasarmadur@evil.com', exp, sig));

console.log('\nlotan');
const cookie = S.cookieFor(OWNER);
const val = cookie.split(';')[0].split('=')[1];
ok('kakan opnar ritilinn', S.sessionEmail(cookieReq(val)) === OWNER);
ok('HttpOnly + Secure + SameSite', /HttpOnly/.test(cookie) && /Secure/.test(cookie) && /SameSite=Lax/.test(cookie));
ok('fiktuð undirskrift fellur', !S.sessionEmail(cookieReq(val.slice(0, -1) + '0')));
ok('engin kaka → ekki innskráður', !S.sessionEmail({ headers: {} }));
const [b64, cexp, csig] = val.split('.');
ok('lengdur gildistími í köku fellur', !S.sessionEmail(cookieReq(b64 + '.' + (Number(cexp) + 864e5) + '.' + csig)));
ok('útrunnin kaka fellur', !S.sessionEmail(cookieReq(Buffer.from(OWNER).toString('base64url') + '.1000.' + csig)));
ok('kaka fyrir netfang utan lista fellur', !S.sessionEmail(cookieReq(Buffer.from('arasarmadur@evil.com').toString('base64url') + '.' + cexp + '.' + csig)));
ok('gildistími er ~30 dagar', Math.abs(Number(cexp) - Date.now() - 30 * 864e5) < 5000);

console.log('\nslóðin sem tengillinn skilar á');
ok('venjuleg innri slóð helst', S.safeNext('/matsedlar.html', '/admin') === '/matsedlar.html');
ok('ritháttur helst', S.safeNext('/?cms=1', '/admin') === '/?cms=1');
ok('//annad-len.is er STÖÐVAÐ', S.safeNext('//evil.com', '/admin') === '/admin');
ok('///annad-len.is er stöðvað', S.safeNext('///evil.com', '/admin') === '/admin');
ok('/\\annad-len.is er stöðvað', S.safeNext('/\\evil.com', '/admin') === '/admin');
ok('heil slóð á annað lén er stöðvuð', S.safeNext('https://evil.com', '/admin') === '/admin');
ok('línuskil (hausainnspýting) stöðvuð', S.safeNext('/a\r\nSet-Cookie: x=1', '/admin') === '/admin');
ok('tómt fellur á sjálfgefið', S.safeNext('', '/admin') === '/admin');
ok('ekkert (undefined) fellur á sjálfgefið', S.safeNext(undefined, '/admin') === '/admin');

console.log('\nhemill á beiðnir');
const burst = (key, n) => { let blocked = 0; for (let i = 0; i < n; i++) if (S.overLimit(key, ...S.LIMITS.email)) blocked++; return blocked; };
ok('fyrstu þrjár sleppa í gegn', burst('prufa-a', 3) === 0);
ok('sú fjórða er stöðvuð', S.overLimit('prufa-a', ...S.LIMITS.email));
ok('300 beiðnir í röð → 297 stöðvaðar', burst('prufa-b', 300) === 297);
ok('annað netfang er ótengt', !S.overLimit('prufa-c', ...S.LIMITS.email));
ok('IP-þakið er rýmra en netfangsþakið', S.LIMITS.ip[0] > S.LIMITS.email[0]);

console.log('\nkakan er akkeruð');
const good = S.cookieFor(OWNER).split(';')[0].split('=')[1];
ok('nágrannakaka á undan skyggir ekki á', S.sessionEmail({ headers: { cookie: 'a_cms_session=AAAA.1.00; cms_session=' + good } }) === OWNER);
ok('rétt kaka fremst virkar', S.sessionEmail({ headers: { cookie: 'cms_session=' + good + '; other=1' } }) === OWNER);
ok('aðeins nágrannakaka → ekki innskráður', !S.sessionEmail({ headers: { cookie: 'a_cms_session=AAAA.1.00' } }));

console.log('\nsendandinn');
ok('sendandi er ekki óstaðfest lén', !/radagerdi\.is/.test(require('fs').readFileSync(require('path').join(__dirname,'..','api','_store.js'),'utf8').match(/const MAIL_FROM = .*/)[0]));

console.log('\nsamtals: ' + pass + ' í lagi, ' + fail + ' brugðust');
process.exit(fail ? 1 : 0);
