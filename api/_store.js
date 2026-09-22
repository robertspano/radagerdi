/* Ráðagerði — sameiginlegt geymslulag fyrir Vercel.
 *
 * Á Render skrifaði þjónninn á disk og speglaði í GitHub. Á Vercel er enginn diskur
 * og ekkert ferli sem lifir milli beiðna, svo GitHub er eina geymslan: hver lestur
 * sækir þangað (með stuttu skyndiminni í heitum keyrslum) og hver vistun skrifar þangað
 * beint. Enginn biðtími, engin röð sem getur glatast við endurræsingu.
 *
 * Einkagögn (gjafabréf og lykilorð) fara aldrei í GitHub í læsilegu formi — þau eru
 * dulkóðuð með AES-256-GCM á nákvæmlega sama sniði og áður ('RG1'|salt|iv|tag|dulmál)
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

const PATHS = {
  content: 'content/content.json',
  gift: 'content/private/giftcards.enc',
  auth: 'content/private/auth.enc',
};
const EMPTY_CONTENT = { texts: {}, images: {}, bg: {}, html: {}, hidden: {}, order: {}, style: {}, settings: {} };

// ---------- dulkóðun einkagagna: 'RG1' | salt(16) | iv(12) | tag(16) | dulmál ----------
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

async function ghGet(repoPath) {
  const r = await fetch(
    `https://api.github.com/repos/${GH_REPO}/contents/${encodeURI(repoPath)}?ref=${GH_BRANCH}`,
    { headers: ghHeaders() }
  );
  if (r.status === 404) return { missing: true };
  if (!r.ok) throw new Error('GitHub ' + r.status + ' við lestur á ' + repoPath);
  const j = await r.json();
  let buf = Buffer.from(j.content || '', 'base64');
  if (!j.content && j.download_url) {            // skrár yfir 1 MB koma ekki innbyggðar
    const b = await fetch(j.download_url, { headers: ghHeaders() });
    if (!b.ok) throw new Error('GitHub ' + b.status + ' við niðurhal á ' + repoPath);
    buf = Buffer.from(await b.arrayBuffer());
  }
  return { sha: j.sha, buf };
}

async function ghPut(repoPath, buf, message, knownSha) {
  let sha = knownSha;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!sha) {
      const cur = await ghGet(repoPath);
      if (cur && !cur.missing) sha = cur.sha;
    }
    const body = { message, content: buf.toString('base64'), branch: GH_BRANCH };
    if (sha) body.sha = sha;
    const r = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${encodeURI(repoPath)}`, {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, ghHeaders()),
      body: JSON.stringify(body),
    });
    if (r.ok) return (await r.json()).content.sha;
    if (r.status === 409 || r.status === 422) { sha = null; continue; }   // einhver skrifaði á milli
    throw new Error('GitHub ' + r.status + ' við vistun á ' + repoPath + ': ' + (await r.text()).slice(0, 200));
  }
  throw new Error('GitHub-vistun á ' + repoPath + ' mistókst eftir þrjár tilraunir');
}

// ---------- lestur með stuttu skyndiminni ----------
// Heit keyrsla heldur efninu í minni í nokkrar sekúndur svo hver síðuflettning kosti
// ekki GitHub-beiðni. Vistun hreinsar minnið strax í þeirri keyrslu sem vistaði.
const TTL_MS = 15000;
const memo = new Map();   // slóð -> { t, text, sha }

async function readRaw(repoPath, { enc = false, fresh = false } = {}) {
  const hit = memo.get(repoPath);
  if (!fresh && hit && Date.now() - hit.t < TTL_MS) return hit;
  if (!GH_ON) throw new Error('GH_TOKEN vantar');
  const got = await ghGet(repoPath);
  if (got.missing) { const rec = { t: Date.now(), text: null, sha: null }; memo.set(repoPath, rec); return rec; }
  const text = enc ? decBuf(got.buf) : got.buf.toString('utf8');
  const rec = { t: Date.now(), text, sha: got.sha };
  memo.set(repoPath, rec);
  return rec;
}

async function readJSON(name, fallback, opts) {
  try {
    const rec = await readRaw(PATHS[name], Object.assign({ enc: name !== 'content' }, opts));
    if (rec.text == null) return fallback;
    return JSON.parse(rec.text);
  } catch (e) {
    if (opts && opts.strict) throw e;
    return fallback;
  }
}

async function writeJSON(name, obj, message) {
  const repoPath = PATHS[name];
  const enc = name !== 'content';
  const text = JSON.stringify(obj, null, 2);
  const buf = enc ? encBuf(text) : Buffer.from(text, 'utf8');
  const hit = memo.get(repoPath);
  const sha = await ghPut(repoPath, buf, message, hit && hit.sha);
  memo.set(repoPath, { t: Date.now(), text, sha });
  return sha;
}

// ---------- innskráning (sama kerfi og á Render) ----------
async function getAuth() {
  const a = await readJSON('auth', null, { strict: true });
  if (!a || !a.salt || !a.hash) throw new Error('Lykilorðsskrá fannst ekki');
  return a;
}
async function verifyPassword(pw) {
  const a = await getAuth();
  const h = crypto.scryptSync(String(pw), a.salt, 32).toString('hex');
  const want = Buffer.from(a.hash), got = Buffer.from(h);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}
// Leyndarmál þjónsins er hluti af lyklinum: þótt lykilorðs-hashið kæmist út er ekki
// hægt að búa til gilda innskráningarköku úr því einu. v2 heldur sama gildi og áður,
// svo innskráningar sem eru í gildi haldast þegar skipt er um hýsingu.
async function sessionToken() {
  const a = await getAuth();
  return crypto.createHmac('sha256', SESSION_KEY + ':' + (a.hash || 'x')).update('cms-authed-v2').digest('hex');
}
async function isAuthed(req) {
  const m = String((req.headers && req.headers.cookie) || '').match(/cms_session=([a-f0-9]+)/);
  if (!m) return false;
  try {
    const want = Buffer.from(await sessionToken()), got = Buffer.from(m[1]);
    return want.length === got.length && crypto.timingSafeEqual(want, got);
  } catch (e) { return false; }
}
async function setPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 32).toString('hex');
  await writeJSON('auth', { salt, hash }, 'CMS: lykilorð uppfært af vefnum');
}
const cookieFor = (token) =>
  `cms_session=${token}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=2592000`;

// ---------- svarhjálp ----------
function sendJSON(res, code, obj, headers) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (headers) for (const k of Object.keys(headers)) res.setHeader(k, headers[k]);
  res.end(JSON.stringify(obj));
}
async function readBody(req, maxMB = 12) {
  if (req.body !== undefined) {                    // Vercel les JSON sjálfkrafa
    return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  }
  const limit = maxMB * 1024 * 1024;
  const chunks = []; let n = 0;
  for await (const c of req) {
    n += c.length;
    if (n > limit) throw new Error('Gögnin eru of stór');
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}
async function requireAuth(req, res) {
  if (await isAuthed(req)) return true;
  sendJSON(res, 401, { error: 'Óheimilt' });
  return false;
}

module.exports = {
  GH_ON, GH_REPO, GH_BRANCH, PATHS, EMPTY_CONTENT,
  encBuf, decBuf, ghGet, ghPut, readRaw, readJSON, writeJSON,
  getAuth, verifyPassword, sessionToken, isAuthed, setPassword, cookieFor,
  sendJSON, readBody, requireAuth,
};
