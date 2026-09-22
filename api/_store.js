/* Ráðagerði — sameiginlegt geymslulag fyrir Vercel.
 *
 * Á Render skrifaði þjónninn á disk og speglaði í GitHub. Á Vercel er enginn diskur
 * og ekkert ferli sem lifir milli beiðna, svo GitHub er eina geymslan: hver lestur
 * sækir þangað (með stuttu skyndiminni í heitum keyrslum) og hver vistun skrifar þangað
 * beint.
 *
 * Tvær varnir eru teknar beint úr Render-þjóninum og mega aldrei falla út:
 *   1. Aldrei skrifa ofan á gögn sem tókst ekki að lesa (ghBlocked þar, { strict:true } hér).
 *      Annars skrifast tómt skjal yfir efni eigandans eða gjafabréf viðskiptavina.
 *   2. Ef einhver annar skrifaði á milli (409) þarf að LESA UPP Á NÝTT og beita
 *      breytingunni aftur — ekki endursenda sama bunkann, því þá tapast hin vistunin.
 *
 * Einkagögn eru dulkóðuð með AES-256-GCM á sama sniði og áður ('RG1'|salt|iv|tag|dulmál)
 * svo gögn sem þegar eru til afkóðist óbreytt.
 */
'use strict';
const crypto = require('crypto');

const GH_TOKEN = process.env.GH_TOKEN || '';
const GH_REPO = process.env.GH_REPO || 'robertspano/radagerdi';
const GH_BRANCH = process.env.GH_BRANCH || 'main';
const GH_ON = !!GH_TOKEN;
const DATA_KEY = process.env.DATA_KEY || GH_TOKEN;          // sami lykill og á Render
const SESSION_KEY = process.env.SESSION_SECRET || DATA_KEY;

// Forskoðunarútgáfur nota SÖMU GitHub-hlöðu og vefurinn í loftinu. Þær mega því lesa
// en aldrei skrifa — annars gæti prufuútgáfa breytt efni eigandans í alvörunni.
const IS_PROD = (process.env.VERCEL_ENV || 'production') === 'production';

const PATHS = {
  content: 'content/content.json',
  gift: 'content/private/giftcards.enc',
  auth: 'content/private/auth.enc',
};
const emptyContent = () => ({ texts: {}, images: {}, bg: {}, html: {}, hidden: {}, order: {}, style: {}, settings: {} });

// ---------- dulkóðun einkagagna ----------
function encBuf(plain) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', crypto.scryptSync(DATA_KEY, salt, 32), iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return Buffer.concat([Buffer.from('RG1'), salt, iv, c.getAuthTag(), ct]);
}
function decBuf(buf) {
  if (buf.slice(0, 3).toString('utf8') !== 'RG1') throw new Error('óþekkt snið');
  const salt = buf.slice(3, 19), iv = buf.slice(19, 31), tag = buf.slice(31, 47), ct = buf.slice(47);
  const d = crypto.createDecipheriv('aes-256-gcm', crypto.scryptSync(DATA_KEY, salt, 32), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
}

// ---------- GitHub ----------
const ghHeaders = () => ({
  Authorization: 'Bearer ' + GH_TOKEN,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'radagerdi-cms',
});

async function ghGet(repoPath, { binary = false } = {}) {
  if (!GH_ON) throw new Error('GH_TOKEN vantar');
  const r = await fetch(
    `https://api.github.com/repos/${GH_REPO}/contents/${encodeURI(repoPath)}?ref=${GH_BRANCH}`,
    { headers: ghHeaders() }
  );
  if (r.status === 404) return { missing: true };
  if (!r.ok) throw new Error('GitHub ' + r.status + ' við lestur á ' + repoPath);
  const j = await r.json();
  // content-reiturinn úr Contents-API-inu er EKKI orðréttur fyrir tvíundarskrár:
  // GitHub túlkar þær sem texta og skilar þeim endurkóðuðum (mælt: 173 bæti → 256).
  // Dulkóðuðu skrárnar verða því alltaf að koma um download_url, sem er orðrétt.
  if ((binary || !j.content) && j.download_url) {
    const b = await fetch(j.download_url, { headers: ghHeaders() });
    if (!b.ok) throw new Error('GitHub ' + b.status + ' við niðurhal á ' + repoPath);
    return { sha: j.sha, buf: Buffer.from(await b.arrayBuffer()) };
  }
  return { sha: j.sha, buf: Buffer.from(j.content || '', 'base64') };
}

async function ghPutOnce(repoPath, buf, message, sha) {
  const body = { message, content: buf.toString('base64'), branch: GH_BRANCH };
  if (sha) body.sha = sha;
  const r = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${encodeURI(repoPath)}`, {
    method: 'PUT',
    headers: Object.assign({ 'Content-Type': 'application/json' }, ghHeaders()),
    body: JSON.stringify(body),
  });
  if (r.ok) return { ok: true, sha: (await r.json()).content.sha };
  if (r.status === 409 || r.status === 422) return { ok: false, conflict: true };
  throw new Error('GitHub ' + r.status + ' við vistun á ' + repoPath + ': ' + (await r.text()).slice(0, 200));
}

async function ghPut(repoPath, buf, message) {
  const cur = await ghGet(repoPath);
  const res = await ghPutOnce(repoPath, buf, message, cur && !cur.missing ? cur.sha : null);
  if (res.ok) return res.sha;
  const again = await ghGet(repoPath);
  const res2 = await ghPutOnce(repoPath, buf, message, again && !again.missing ? again.sha : null);
  if (res2.ok) return res2.sha;
  throw new Error('GitHub-vistun á ' + repoPath + ' mistókst (árekstur)');
}

// ---------- lestur ----------
// Heit keyrsla heldur efninu í minni í stutta stund svo hver síðuflettning kosti ekki
// GitHub-beiðni. Vistun uppfærir minnið strax í þeirri keyrslu sem vistaði.
const TTL_MS = 15000;
const memo = new Map();   // slóð -> { t, text, sha }

async function readRaw(repoPath, { enc = false, fresh = false } = {}) {
  const hit = memo.get(repoPath);
  if (!fresh && hit && Date.now() - hit.t < TTL_MS) return hit;
  const got = await ghGet(repoPath, { binary: enc });
  if (got.missing) { const rec = { t: Date.now(), text: null, sha: null }; memo.set(repoPath, rec); return rec; }
  let text;
  if (enc) {
    // Aðgreint frá lesvillu: hér næst í skrána en lykillinn gengur ekki.
    try { text = decBuf(got.buf); }
    catch (e) { const err = new Error('Dulkóðunarlykillinn gengur ekki upp (DATA_KEY/GH_TOKEN er ekki sá sami og gögnin voru dulkóðuð með)'); err.code = 'BADKEY'; throw err; }
  } else {
    text = got.buf.toString('utf8');
  }
  const rec = { t: Date.now(), text, sha: got.sha };
  memo.set(repoPath, rec);
  return rec;
}

// strict:true → kastar ef ekki næst í gögnin. Notað alls staðar þar sem á eftir að SKRIFA.
async function readJSON(name, fallback, opts = {}) {
  try {
    const rec = await readRaw(PATHS[name], Object.assign({ enc: name !== 'content' }, opts));
    if (rec.text == null) return fallback;
    return JSON.parse(rec.text);
  } catch (e) {
    if (opts.strict) throw e;
    return fallback;
  }
}

function serialize(name, obj) {
  const text = JSON.stringify(obj, null, 2);
  return name === 'content' ? Buffer.from(text, 'utf8') : encBuf(text);
}

/* Les – breytir – skrifar, með raunverulegri árekstrarvörn:
 * rekist tvær vistanir á lesum við ferskt eintak og beitum breytingunni aftur á það,
 * svo hin vistunin tapist ekki. mutate fær núverandi gögn og skilar nýjum.
 */
async function update(name, fallback, mutate, message) {
  if (!IS_PROD) { const e = new Error('Forskoðunarútgáfur mega ekki vista'); e.code = 'READONLY'; throw e; }
  const repoPath = PATHS[name];
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    const rec = await readRaw(repoPath, { enc: name !== 'content', fresh: true });   // kastar ef lestur bregst
    const cur = rec.text == null ? fallback : JSON.parse(rec.text);
    const next = await mutate(cur);
    if (next === undefined) return { skipped: true };
    const buf = serialize(name, next);
    const res = await ghPutOnce(repoPath, buf, message, rec.sha);
    if (res.ok) {
      memo.set(repoPath, { t: Date.now(), text: JSON.stringify(next, null, 2), sha: res.sha });
      return { ok: true, value: next };
    }
    last = res;
  }
  const e = new Error('Vistun mistókst vegna árekstra — reyndu aftur');
  e.code = 'CONFLICT';
  throw e;
}

// ---------- innskráning: tengill í tölvupósti, ekkert sameiginlegt lykilorð ----------
//
// Ekkert er geymt milli beiðna (það er enginn diskur og ekkert langlíft ferli), svo bæði
// tengillinn og lotan eru undirrituð með leyndarmáli þjónsins og staðfest með útreikningi.
// Aðgangslistinn (CMS_EMAILS) er lesinn við hverja staðfestingu: sé netfang tekið af
// listanum lokast það strax, líka þótt kakan sé enn í gildi.
const CMS_EMAILS = (process.env.CMS_EMAILS || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const EMAIL_LOGIN = !!(process.env.RESEND_API_KEY && CMS_EMAILS.length);
// Resend sendir EKKERT frá léni sem er ekki staðfest hjá þeim — það svarar 403 og
// pósturinn fer aldrei af stað. radagerdi.is er ekki staðfest þar (athugað 22.9.2026),
// svo sjálfgefni sendandinn er reikningsfangið hjá Resend sjálfum, sem virkar án
// staðfestingar en aðeins á netfang eigandans. Þegar radagerdi.is er staðfest í Resend
// er MAIL_FROM sett í Vercel og þá má bæta fleirum á CMS_EMAILS.
const MAIL_FROM = process.env.MAIL_FROM || 'Ráðagerði CMS <onboarding@resend.dev>';
const LINK_MINUTES = 15;

const norm = (e) => String(e || '').trim().toLowerCase();

// Slóð sem berst utan frá (?next=) má aðeins vísa innan vefsins. Það dugir EKKI að
// heimta '/' fremst: '//annad-len.is' er líka gild slóð fyrir vafrann — hann les hana
// sem annað lén og lætur samskiptaregluna fylgja síðunni. Tengill úr pósti sem skilar
// fólki á ókunnugt lén er nákvæmlega veiðibragðið sem innskráningin á að útiloka.
function safeNext(raw, fallback) {
  const s = String(raw || '');
  if (!s.startsWith('/')) return fallback;
  if (s.startsWith('//') || s.startsWith('/\\')) return fallback;
  return /^\/[A-Za-z0-9._\-\/?=&]*$/.test(s) ? s : fallback;
}
const mayEnter = (email) => CMS_EMAILS.includes(norm(email));
const sign = (msg) => crypto.createHmac('sha256', SESSION_KEY).update(msg).digest('hex');
const sameSig = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// --- tengillinn ---
function loginLink(email, origin, next) {
  const exp = Date.now() + LINK_MINUTES * 60 * 1000;
  const e = norm(email);
  const sig = sign('link|' + e + '|' + exp);
  return origin + '/api/login-verify?e=' + encodeURIComponent(e) + '&exp=' + exp + '&sig=' + sig +
    (next ? '&next=' + encodeURIComponent(next) : '');
}
function checkLink(email, exp, sig) {
  const e = norm(email);
  if (!mayEnter(e)) return false;
  const n = Number(exp);
  if (!Number.isFinite(n) || n < Date.now()) return false;
  return sameSig(sign('link|' + e + '|' + n), sig);
}

// --- lotan ---
// Gildistíminn er UNDIRRITAÐUR með í kökunni. Max-Age eitt og sér er aðeins tilmæli til
// vafrans: kaka sem lekur (afrituð úr tæki, úr annál) myndi annars opna ritilinn um
// aldur og ævi. Hér deyr hún á þjóninum á settum degi, hvar sem hún er niðurkomin.
const SESSION_DAYS = 30;
function sessionCookieValue(email, exp) {
  const e = norm(email);
  return Buffer.from(e).toString('base64url') + '.' + exp + '.' + sign('cms-v4|' + e + '|' + exp);
}
function sessionEmail(req) {
  // Akkerað við upphaf kökunnar: án þess passar líka kaka sem HEITIR eitthvað annað og
  // endar á cms_session (t.d. a_cms_session frá undirléni) og skyggir á þá réttu.
  const m = String((req.headers && req.headers.cookie) || '').match(/(?:^|;\s*)cms_session=([A-Za-z0-9_\-]+\.\d+\.[a-f0-9]+)/);
  if (!m) return null;
  const [b64, exp, sig] = m[1].split('.');
  let e;
  try { e = Buffer.from(b64, 'base64url').toString('utf8'); } catch (x) { return null; }
  const n = Number(exp);
  if (!Number.isFinite(n) || n < Date.now()) return null;
  if (!mayEnter(e)) return null;                       // tekinn af listanum → lokað strax
  return sameSig(sign('cms-v4|' + e + '|' + n), sig) ? e : null;
}
async function isAuthed(req) { return !!sessionEmail(req); }

/* Hemill á beiðnir.
 *
 * Render-þjónninn hafði þak (5 á 15 mín) sem datt út í flutningnum, því Vercel deilir
 * ekki minni milli keyrslna. Án þaks má keyra endapunktinn í hring: pósthólf eigandans
 * fyllist og dagskammturinn hjá Resend klárast — og þá kemst ENGINN inn þann daginn.
 *
 * Þetta er per-keyrslu og stöðvar því ekki dreifða árás ein og sér; Vercel Firewall
 * (leiðarregla á /api/login-link) er lagið sem gerir það. Saman duga þau.
 *
 * Talið er á netfangið HVORT SEM ÞAÐ ER Á LISTANUM EÐA EKKI — annars mætti lesa út úr
 * því hverjir eiga aðgang að ritlinum.
 */
const hits = new Map();
function overLimit(key, max, windowMs) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter(t => now - t < windowMs);
  if (list.length >= max) { hits.set(key, list); return true; }
  list.push(now);
  hits.set(key, list);
  if (hits.size > 500) for (const k of hits.keys()) { if (!hits.get(k).length) hits.delete(k); }
  return false;
}
const LIMITS = { email: [3, 900000], ip: [10, 900000] };   // 15 mínútna gluggi

async function sendLoginLink(email, origin, next) {
  const link = loginLink(email, origin, next);
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: MAIL_FROM, to: [norm(email)],
      subject: 'Skrá mig inn í Ráðagerði CMS',
      html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:16px;line-height:1.6;color:#1a1b1f">
        <p>Smelltu hér til að opna ritilinn:</p>
        <p><a href="${link}" style="display:inline-block;background:#629F67;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600">Opna Ráðagerði CMS</a></p>
        <p style="color:#6b7280;font-size:14px">Tengillinn gildir í ${LINK_MINUTES} mínútur og aðeins fyrir þetta netfang.
        Ef þú baðst ekki um hann máttu hunsa þennan póst — enginn kemst inn án hans.</p>
      </div>`,
    }),
  });
  if (!r.ok) throw new Error('Resend ' + r.status + ': ' + (await r.text()).slice(0, 200));
}

const cookieFor = (email) => {
  const exp = Date.now() + SESSION_DAYS * 86400000;
  return `cms_session=${sessionCookieValue(email, exp)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${SESSION_DAYS * 86400}`;
};

// ---------- svarhjálp ----------
function sendJSON(res, code, obj, headers) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  // Ekkert svar héðan á erindi í leitarvél. Sett hér svo það gildi um alla endapunkta,
  // líka þótt leiðastillingum sé breytt seinna.
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (headers) for (const k of Object.keys(headers)) res.setHeader(k, headers[k]);
  res.end(JSON.stringify(obj));
}
async function readBody(req, maxMB = 4) {
  if (req.body !== undefined) {
    return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  }
  const limit = maxMB * 1024 * 1024;
  const chunks = []; let n = 0;
  for await (const c of req) {
    n += c.length;
    if (n > limit) { const e = new Error('Gögnin eru of stór'); e.code = 'TOOBIG'; throw e; }
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}
async function requireAuth(req, res) {
  if (await isAuthed(req)) return true;
  sendJSON(res, 401, { error: 'Óheimilt' });
  return false;
}
// Sameiginleg meðferð á vistunarvillum svo ritillinn fái alltaf satt svar.
function sendWriteError(res, e) {
  if (e && e.code === 'READONLY') return sendJSON(res, 403, { error: 'Þetta er forskoðunarútgáfa — vistun er óvirk hér', durable: false });
  if (e && e.code === 'CONFLICT') return sendJSON(res, 409, { error: 'Einhver annar vistaði á sama tíma — reyndu aftur', durable: false });
  return sendJSON(res, 503, { error: 'Næ ekki í gögnin núna — ekkert var vistað: ' + String((e && e.message) || e), durable: false });
}

module.exports = {
  GH_ON, GH_REPO, GH_BRANCH, PATHS, IS_PROD, emptyContent,
  encBuf, decBuf, ghGet, ghPut, readRaw, readJSON, update,
  EMAIL_LOGIN, CMS_EMAILS, mayEnter, safeNext, loginLink, checkLink, sendLoginLink,
  overLimit, LIMITS,
  isAuthed, sessionEmail, cookieFor,
  sendJSON, readBody, requireAuth, sendWriteError,
};
