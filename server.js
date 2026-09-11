#!/usr/bin/env node
/*
 * Ráðagerði CMS — zero-dependency Node.js server.
 *  - Serves the static site (all existing pages/assets).
 *  - /admin            → login page
 *  - /api/*            → auth + content read/write + image upload
 * Content lives in ./content/content.json ; auth secret in ./content/auth.json.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const passkit = require('./cms/pass.js');

const ROOT = __dirname;
// Mutable data lives in DATA_DIR — locally ./content, on Render a persistent disk (/data)
const CONTENT_DIR = process.env.DATA_DIR || path.join(ROOT, 'content');
const CONTENT_FILE = path.join(CONTENT_DIR, 'content.json');
const AUTH_FILE = path.join(CONTENT_DIR, 'auth.json');
const GIFT_FILE = path.join(CONTENT_DIR, 'giftcards.json');
const UPLOAD_DIR = path.join(CONTENT_DIR, 'uploads');
const LEGACY_UPLOAD_DIR = path.join(ROOT, 'assets', 'uploads');
const IS_HTTPS = !!process.env.RENDER; // behind Render's TLS proxy → mark session cookie Secure
const PORT = process.env.PORT || 8787;
const DEFAULT_PASSWORD = 'radagerdi';

// ---------- email-code login (Resend) ----------
// Enabled when BOTH env vars are set (on Render: Environment tab):
//   RESEND_API_KEY = re_...          CMS_EMAILS = netfang1,netfang2,...
const RESEND_KEY = process.env.RESEND_API_KEY || '';
const CMS_EMAILS = (process.env.CMS_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const EMAIL_LOGIN = !!(RESEND_KEY && CMS_EMAILS.length);
const MAIL_FROM = process.env.MAIL_FROM || 'Ráðagerði CMS <cms@fyrirspurn.radagerdi.is>';
// ---------- Instagram gallery feed ----------
// Configured with ONE of (on Render: Environment tab):
//   IG_TOKEN    = long-lived Instagram API token for @radagerdi170  (graph.instagram.com)
//   IG_FEED_URL = ready-made JSON feed URL (e.g. Behold.so) for the account
const IG_TOKEN = process.env.IG_TOKEN || '';
const IG_FEED_URL = process.env.IG_FEED_URL || '';
let igCache = { t: 0, data: null };
async function fetchInstagram() {
  let raw;
  if (IG_TOKEN) {
    const r = await fetch('https://graph.instagram.com/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink&limit=24&access_token=' + encodeURIComponent(IG_TOKEN));
    raw = await r.json();
  } else {
    const r = await fetch(IG_FEED_URL);
    raw = await r.json();
  }
  const list = raw.data || raw.posts || raw.media || (Array.isArray(raw) ? raw : []);
  const media = list.map(m => ({
    url: m.media_type === 'VIDEO' ? (m.thumbnail_url || m.thumbnailUrl) : (m.media_url || m.mediaUrl || m.url),
    link: m.permalink || m.link || 'https://www.instagram.com/radagerdi170/',
    alt: ((m.caption && (m.caption.text || m.caption)) || 'Ráðagerði á Instagram').toString().slice(0, 140),
  })).filter(m => m.url).slice(0, 18);
  return { ok: media.length > 0, media };
}

const loginCodes = new Map();   // email -> { hash, exp, tries }
const codeRequests = new Map(); // email -> [timestamps]
function hashCode(email, code) {
  return crypto.createHmac('sha256', sessionToken()).update(email + ':' + code).digest('hex');
}
async function sendLoginCode(email) {
  const code = ('' + (crypto.randomInt(100000, 1000000)));
  loginCodes.set(email, { hash: hashCode(email, code), exp: Date.now() + 10 * 60 * 1000, tries: 0 });
  if (process.env.DEBUG_CODES) console.log('  ⚙ DEBUG innskráningarkóði fyrir ' + email + ': ' + code);
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: MAIL_FROM, to: [email],
      subject: code + ' er innskráningarkóðinn þinn — Ráðagerði CMS',
      html: '<div style="font-family:-apple-system,sans-serif;max-width:420px;margin:0 auto;padding:28px 8px;text-align:center">' +
            '<p style="font-size:15px;color:#444;margin:0 0 18px">Innskráningarkóðinn þinn á Ráðagerði CMS er:</p>' +
            '<p style="font-size:38px;font-weight:800;letter-spacing:.18em;color:#1B7C38;margin:0 0 18px">' + code + '</p>' +
            '<p style="font-size:13px;color:#888;margin:0">Kóðinn gildir í 10 mínútur. Ef þú baðst ekki um hann máttu hunsa þennan póst.</p></div>',
    }),
  });
  return r.ok;
}

// ---------- varanleg geymsla í GitHub ----------
// Fría hýsingin þurrkar skráakerfið við hverja endurræsingu/útgáfu og svæfir þjóninn
// eftir 15 mínútna aðgerðaleysi. Til að ekkert tapist speglum við gögnin í repo-ið sjálft.
// Virkjast með umhverfisbreytunni GH_TOKEN (fínkornótt token, Contents: read and write).
//
// Repo-ið er OPINBERT, þannig að gjafabréf (nöfn, símanúmer, inneign) og lykilorðs-hashið
// fara aldrei þangað í læsilegu formi — þau eru dulkóðuð (AES-256-GCM) áður en þau eru send.
// Allar speglaðar slóðir eru undir content/ svo Render-síunni sé óhætt að hunsa þær
// (annars kveikti hver vistun í CMS-inu á nýrri útgáfu — endalaus hringur).
const GH_TOKEN = process.env.GH_TOKEN || '';
const GH_REPO = process.env.GH_REPO || 'robertspano/radagerdi';
const GH_BRANCH = process.env.GH_BRANCH || 'main';
const GH_ON = !!GH_TOKEN;
const DATA_KEY = process.env.DATA_KEY || GH_TOKEN;   // dulkóðunarlykill einkagagna

const MIRROR = [
  { file: CONTENT_FILE, repo: 'content/content.json', enc: false, name: 'efni' },
  { file: GIFT_FILE, repo: 'content/private/giftcards.enc', enc: true, name: 'gjafabréf' },
  { file: AUTH_FILE, repo: 'content/private/auth.enc', enc: true, name: 'lykilorð' },
];

const ghSha = new Map();        // repo-slóð -> sha síðustu útgáfu
const ghDirty = new Set();      // skrár sem bíða speglunar
let ghTimer = null, ghBusy = false, ghAgain = false;
let ghBlocked = false;          // satt ef lestur mistókst — þá ýtum við EKKI (annars eyðileggjum við góð gögn)
let ghBaseHash = null;          // hash af efninu sem við ræstum á; notað til að meta hvort óhætt sé að ýta eftir bilun

const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const fileHash = (f) => { try { return sha256(fs.readFileSync(f)); } catch { return null; } };

function ghHeaders() {
  return { Authorization: 'Bearer ' + GH_TOKEN, Accept: 'application/vnd.github+json', 'User-Agent': 'radagerdi-cms' };
}

// --- dulkóðun einkagagna: 'RG1' | salt(16) | iv(12) | tag(16) | dulmál ---
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

async function ghGet(repo) {
  const r = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${encodeURI(repo)}?ref=${GH_BRANCH}`, { headers: ghHeaders() });
  if (r.status === 404) return { missing: true };
  if (!r.ok) throw new Error('GitHub ' + r.status + ' við lestur á ' + repo);
  const j = await r.json();
  let buf = Buffer.from(j.content || '', 'base64');
  if (!j.content && j.download_url) {          // skrár yfir 1 MB koma ekki innbyggðar
    const b = await fetch(j.download_url, { headers: ghHeaders() });
    if (!b.ok) throw new Error('GitHub ' + b.status + ' við niðurhal á ' + repo);
    buf = Buffer.from(await b.arrayBuffer());
  }
  return { sha: j.sha, buf };
}

async function ghPut(repo, buf, message) {
  for (let attempt = 0; attempt < 2; attempt++) {
    let sha = ghSha.get(repo);
    if (!sha) {
      try { const cur = await ghGet(repo); if (cur && !cur.missing) sha = cur.sha; }
      catch (e) { console.error('  ⚠  Næ ekki í útgáfu ' + repo + ':', e.message); return false; }
    }
    const body = { message, content: buf.toString('base64'), branch: GH_BRANCH };
    if (sha) body.sha = sha;
    const r = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${encodeURI(repo)}`, {
      method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, ghHeaders()), body: JSON.stringify(body),
    });
    if (r.ok) { ghSha.set(repo, (await r.json()).content.sha); return true; }
    if (r.status === 409 || r.status === 422) {   // einhver annar skrifaði á milli — sækja nýtt sha og reyna aftur
      ghSha.delete(repo);
      console.warn('  ⚠  Árekstur á ' + repo + ' — reyni strax aftur');
      continue;
    }
    console.error('  ⚠  GitHub-vistun á ' + repo + ' mistókst:', r.status, (await r.text()).slice(0, 200));
    return false;
  }
  console.error('  ⚠  GitHub-vistun á ' + repo + ' mistókst eftir tvær tilraunir');
  return false;
}

// Sækir öll speglaðu gögnin. Skilar false ef eitthvað mistókst — þá er ýting læst
// svo gömul gögn úr útgáfumyndinni skrifist ekki yfir réttu gögnin í GitHub.
async function ghPullAll() {
  if (!GH_ON) return false;
  let allOk = true;
  for (const m of MIRROR) {
    try {
      const got = await ghGet(m.repo);
      if (got.missing) {
        // Ekkert til í GitHub enn — sáum því sem er á disknum (t.d. nýbúna lykilorðsskrá)
        // svo innskráningar og gjafabréf haldist stöðug frá og með næstu ræsingu.
        console.log('  ⓘ  Ekkert vistað ' + m.name + ' í GitHub enn — sái því sem er til staðar');
        if (fs.existsSync(m.file)) { ghDirty.add(m.repo); clearTimeout(ghTimer); ghTimer = setTimeout(() => { ghFlush().catch(() => {}); }, 4000); }
        continue;
      }
      ghSha.set(m.repo, got.sha);
      let text;
      if (m.enc) {
        try { text = decBuf(got.buf); }
        catch (e) {
          // Rangur lykill (t.d. nýtt GH_TOKEN án DATA_KEY) — ekki skrifa yfir og ekki ýta.
          console.error('  ⚠  Næ ekki að afkóða ' + m.name + ' (' + e.message + '). Var skipt um GH_TOKEN? Settu þá DATA_KEY á gamla lykilinn.');
          allOk = false; continue;
        }
      } else {
        text = got.buf.toString('utf8');
      }
      JSON.parse(text);                       // staðfesta gilt JSON áður en skrifað er yfir
      fs.writeFileSync(m.file, text);
      console.log('  ✓  ' + m.name + ' sótt úr GitHub (' + text.length + ' stafir)');
    } catch (e) {
      console.error('  ⚠  Lestur á ' + m.name + ' mistókst:', e.message);
      allOk = false;
    }
  }
  ghBlocked = !allOk;
  if (ghBlocked) {
    ghBaseHash = fileHash(CONTENT_FILE);   // munum á hverju við ræstum
    console.error('  ⛔  Vistun í GitHub LÆST þar til lestur tekst — reyni aftur á 30 sek. fresti');
  } else {
    ghBaseHash = null;
  }
  return allOk;
}

// Myndir sem hlaðið er upp í CMS lenda líka á skráakerfi sem þurrkast — sækjum þær í bakgrunni.
async function ghPullUploads() {
  if (!GH_ON) return;
  try {
    const r = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/content/uploads?ref=${GH_BRANCH}`, { headers: ghHeaders() });
    if (!r.ok) return;                      // engin mappa enn = engar upphlaðnar myndir
    const list = await r.json();
    if (!Array.isArray(list)) return;
    let n = 0;
    for (const f of list) {
      if (f.type !== 'file' || !f.download_url) continue;
      const dest = path.join(UPLOAD_DIR, f.name);
      if (fs.existsSync(dest)) continue;
      const b = await fetch(f.download_url, { headers: ghHeaders() });
      if (!b.ok) continue;
      fs.writeFileSync(dest, Buffer.from(await b.arrayBuffer()));
      n++;
    }
    if (n) console.log('  ✓  ' + n + ' mynd(ir) sóttar úr GitHub');
  } catch (e) { console.error('  ⚠  Myndalestur úr GitHub mistókst:', e.message); }
}

// Reynir að aflæsa vistun eftir að lestur mistókst við ræsingu.
// Óhætt er að ýta EF efnið í GitHub er nákvæmlega það sama og við ræstum á
// (þ.e. útgáfumyndin var í takt) — annars myndum við skrifa yfir nýrri breytingar.
async function ghUnblock() {
  if (!ghBlocked) return true;
  try {
    const got = await ghGet('content/content.json');
    if (got.missing) { ghBlocked = false; console.log('  ✓  Samband við GitHub komið aftur — vistun opnuð'); return true; }
    const same = ghBaseHash && sha256(got.buf) === ghBaseHash;
    if (!same && ghDirty.size) {
      console.error('  ⛔  GitHub svarar aftur EN geymir nýrra efni en þjónninn ræsti á. Ýti ekki (það myndi þurrka nýrri breytingar). Endurræstu þjónustuna á Render til að sækja rétta efnið.');
      return false;
    }
    if (!same) {                            // engar óvistaðar breytingar — óhætt að sækja rétta efnið
      const ok = await ghPullAll();
      if (!ok) return false;
    } else {
      ghSha.set('content/content.json', got.sha);
      ghBlocked = false;
    }
    console.log('  ✓  Samband við GitHub komið aftur — vistun opnuð');
    return true;
  } catch (e) { return false; }
}

async function ghFlush() {
  if (!GH_ON || !ghDirty.size) return;
  if (ghBlocked) {
    const ok = await ghUnblock();
    if (!ok) return;                        // enn læst — skrárnar bíða áfram í ghDirty
  }
  if (ghBusy) { ghAgain = true; return; }   // bíður — ghDirty geymir það sem eftir er
  ghBusy = true;
  try {
    while (ghDirty.size) {
      const repo = ghDirty.values().next().value;
      ghDirty.delete(repo);
      const m = MIRROR.find(x => x.repo === repo);
      if (!m || !fs.existsSync(m.file)) continue;
      const raw = fs.readFileSync(m.file, 'utf8');
      const buf = m.enc ? encBuf(raw) : Buffer.from(raw, 'utf8');
      const ok = await ghPut(m.repo, buf, 'CMS: ' + m.name + ' uppfært af vefnum');
      if (ok) console.log('  ✓  ' + m.name + ' vistað varanlega í GitHub');
      else ghDirty.add(m.repo);             // skila í biðröðina svo næsta vistun reyni aftur
    }
  } catch (e) { console.error('  ⚠  Speglun mistókst:', e.message); }
  ghBusy = false;
  if (ghAgain) { ghAgain = false; return ghFlush(); }
}

// Safnar saman breytingum í 4 sek. svo hvert lyklaslag valdi ekki sínu commit-i.
function ghSchedule(file) {
  if (!GH_ON) return;
  const m = MIRROR.find(x => x.file === file);
  if (!m) return;
  ghDirty.add(m.repo);
  clearTimeout(ghTimer);
  ghTimer = setTimeout(() => { ghFlush().catch(e => console.error('  ⚠  Speglun mistókst:', e.message)); }, 4000);
}

// Bíður þar til ekkert er í gangi OG ekkert bíður — eða þar til tíminn rennur út.
async function ghDrain(maxMs) {
  const t0 = Date.now();
  while ((ghBusy || ghDirty.size) && Date.now() - t0 < maxMs) {
    if (ghBusy) await new Promise(r => setTimeout(r, 150));   // ýting í gangi: bíða eftir henni
    else { try { await ghFlush(); } catch {} }
  }
  return !ghDirty.size;
}

// Render sendir SIGTERM þegar þjónninn er svæfður (og gefur um 30 sek.) — tæmum
// biðröðina áður en hann deyr, annars deyja síðustu breytingarnar með skráakerfinu.
let ghExiting = false;
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, async () => {
    if (ghExiting) return;
    ghExiting = true;
    clearTimeout(ghTimer);
    if (GH_ON && (ghDirty.size || ghBusy)) {
      console.log('  …  Klára að vista í GitHub áður en þjónninn stöðvast');
      const done = await ghDrain(20000);
      console.log(done ? '  ✓  Allt komið til skila' : '  ⚠  Náði ekki að vista allt áður en þjónninn stöðvaðist');
    }
    process.exit(0);
  });
}

// ---------- storage helpers ----------
function ensure() {
  fs.mkdirSync(CONTENT_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (!fs.existsSync(CONTENT_FILE)) {
    fs.writeFileSync(CONTENT_FILE, JSON.stringify({
      texts: {}, images: {}, bg: {}, html: {}, hidden: {}, order: {}, style: {}, settings: {}
    }, null, 2));
  }
  // Sjálfgefnu skrárnar eru skrifaðar hrátt (ekki writeJSON) — tóm byrjunargögn eiga
  // ekki að kveikja á speglun og skrifa yfir raunverulegu gögnin í GitHub.
  if (!fs.existsSync(GIFT_FILE)) fs.writeFileSync(GIFT_FILE, JSON.stringify({ cards: {} }, null, 2));
  if (!fs.existsSync(AUTH_FILE)) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(DEFAULT_PASSWORD, salt, 32).toString('hex');
    fs.writeFileSync(AUTH_FILE, JSON.stringify({ salt, hash }, null, 2));
    console.log('\n  ⚙  Default admin password set to:  ' + DEFAULT_PASSWORD + '   (change it in /admin → Stillingar)\n');
  }
}
const readJSON = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } };
// Hver skrift á gagnaskrá kveikir á speglun í GitHub — þá gleymist hvergi að vista.
const writeJSON = (f, o) => { fs.writeFileSync(f, JSON.stringify(o, null, 2)); ghSchedule(f); };

// ---------- auth (stateless signed cookie) ----------
function verifyPassword(pw) {
  const a = readJSON(AUTH_FILE, null); if (!a) return false;
  const h = crypto.scryptSync(String(pw), a.salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(a.hash));
}
function sessionToken() {
  const a = readJSON(AUTH_FILE, {});
  return crypto.createHmac('sha256', a.hash || 'x').update('cms-authed-v1').digest('hex');
}
function isAuthed(req) {
  const cookie = (req.headers.cookie || '');
  const m = cookie.match(/cms_session=([a-f0-9]+)/);
  if (!m) return false;
  const want = sessionToken();
  try { return crypto.timingSafeEqual(Buffer.from(m[1]), Buffer.from(want)); } catch { return false; }
}
function setPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 32).toString('hex');
  writeJSON(AUTH_FILE, { salt, hash });
}

// ---------- http utilities ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.otf': 'font/otf', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2',
};
function send(res, code, body, headers = {}) {
  res.writeHead(code, Object.assign({ 'Cache-Control': 'no-cache' }, headers));
  res.end(body);
}
function sendJSON(res, code, obj, headers = {}) {
  send(res, code, JSON.stringify(obj), Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, headers));
}
function readBody(req, limitMB = 25) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > limitMB * 1024 * 1024) { reject(new Error('too big')); req.destroy(); } chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ---------- static file serving (with range for media) ----------
function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  // prevent path traversal
  const full = path.normalize(path.join(ROOT, rel));
  if (!full.startsWith(ROOT)) return send(res, 403, 'Forbidden');
  serveFile(req, res, full);
}

// long cache for assets that never change under the same name; short for code; none for HTML
function cacheFor(ext) {
  if (['.otf', '.ttf', '.woff', '.woff2'].includes(ext)) return 'public, max-age=2592000, immutable';
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico', '.mp4', '.webm'].includes(ext)) return 'public, max-age=604800';
  if (['.css', '.js', '.mjs'].includes(ext)) return 'public, max-age=600';
  return 'no-cache';
}
function serveFile(req, res, full) {
  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found');
    const ext = path.extname(full).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const range = req.headers.range;
    if (range && /^bytes=/.test(range)) {
      const [s, e] = range.replace('bytes=', '').split('-');
      const start = parseInt(s, 10) || 0;
      const end = e ? parseInt(e, 10) : st.size - 1;
      res.writeHead(206, {
        'Content-Type': type, 'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1,
      });
      return fs.createReadStream(full, { start, end }).pipe(res);
    }
    // ritilsskrárnar mega aldrei sitja fastar í skyndiminni — annars keyra notendur úrelta útgáfu
    const isCMS = full.includes(path.sep + 'cms' + path.sep);
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': isCMS ? 'no-cache' : cacheFor(ext) });
    fs.createReadStream(full).pipe(res);
  });
}

// ---------- API ----------
async function handleAPI(req, res, url) {
  const p = url.pathname;
  // public read
  if (p === '/api/content' && req.method === 'GET') {
    const c = readJSON(CONTENT_FILE, {});
    return sendJSON(res, 200, c);
  }
  if (p === '/api/session' && req.method === 'GET') {
    return sendJSON(res, 200, { authed: isAuthed(req) });
  }
  if (p === '/api/instagram' && req.method === 'GET') {
    if (!IG_TOKEN && !IG_FEED_URL) return sendJSON(res, 200, { ok: false, media: [] });
    if (igCache.data && Date.now() - igCache.t < 10 * 60 * 1000) return sendJSON(res, 200, igCache.data);
    try {
      const data = await fetchInstagram();
      if (data.ok) igCache = { t: Date.now(), data };
      return sendJSON(res, 200, data.ok ? data : (igCache.data || data));
    } catch (e) {
      console.error('instagram fetch failed:', e.message);
      return sendJSON(res, 200, igCache.data || { ok: false, media: [] });
    }
  }
  if (p === '/api/login-mode' && req.method === 'GET') {
    return sendJSON(res, 200, { mode: EMAIL_LOGIN ? 'email' : 'password' });
  }
  if (p === '/api/login-code' && req.method === 'POST') {
    if (!EMAIL_LOGIN) return sendJSON(res, 400, { ok: false, error: 'Kóða-innskráning er ekki virk' });
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    const email = String(body.email || '').trim().toLowerCase();
    const now = Date.now();
    const times = (codeRequests.get(email) || []).filter(ts => now - ts < 15 * 60 * 1000);
    if (times.length >= 5) return sendJSON(res, 429, { ok: false, error: 'Of margar beiðnir — reyndu aftur eftir smá stund' });
    times.push(now); codeRequests.set(email, times);
    if (CMS_EMAILS.includes(email)) {
      try { await sendLoginCode(email); } catch (e) { console.error('login-code send failed:', e.message); }
    }
    // always the same answer — don't reveal which emails have access
    return sendJSON(res, 200, { ok: true });
  }
  if (p === '/api/login-verify' && req.method === 'POST') {
    if (!EMAIL_LOGIN) return sendJSON(res, 400, { ok: false });
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    const email = String(body.email || '').trim().toLowerCase();
    const code = String(body.code || '').trim();
    const rec = loginCodes.get(email);
    if (!rec || rec.exp < Date.now() || rec.tries >= 5) { loginCodes.delete(email); return sendJSON(res, 401, { ok: false, error: 'Kóðinn er útrunninn — biddu um nýjan' }); }
    rec.tries++;
    const want = Buffer.from(rec.hash), got = Buffer.from(hashCode(email, code));
    if (want.length === got.length && crypto.timingSafeEqual(want, got)) {
      loginCodes.delete(email);
      return sendJSON(res, 200, { ok: true }, {
        'Set-Cookie': `cms_session=${sessionToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${IS_HTTPS ? '; Secure' : ''}`
      });
    }
    return sendJSON(res, 401, { ok: false, error: 'Rangur kóði' });
  }
  if (p === '/api/login' && req.method === 'POST') {
    if (EMAIL_LOGIN) return sendJSON(res, 403, { ok: false, error: 'Innskráning fer fram með tölvupóstkóða' });
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    if (verifyPassword(body.password || '')) {
      return sendJSON(res, 200, { ok: true }, {
        'Set-Cookie': `cms_session=${sessionToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${IS_HTTPS ? '; Secure' : ''}`
      });
    }
    return sendJSON(res, 401, { ok: false, error: 'Rangt lykilorð' });
  }
  if (p === '/api/logout' && req.method === 'POST') {
    return sendJSON(res, 200, { ok: true }, { 'Set-Cookie': 'cms_session=; Path=/; Max-Age=0' });
  }
  // public: is Apple Wallet pass signing configured? (wallet page shows/hides the button)
  if (p === '/api/pass-status' && req.method === 'GET') {
    return sendJSON(res, 200, { available: passkit.isConfigured(CONTENT_DIR) });
  }
  // public: read one gift card (the unguessable id in the URL is the bearer secret)
  const gcPub = p.match(/^\/api\/giftcards\/([a-f0-9]{16,64})$/);
  if (gcPub && req.method === 'GET') {
    const g = readJSON(GIFT_FILE, { cards: {} });
    const card = g.cards[gcPub[1]];
    if (!card) return sendJSON(res, 404, { error: 'Gjafabréf fannst ekki' });
    return sendJSON(res, 200, { ok: true, card });
  }

  // everything below requires auth
  if (!isAuthed(req)) return sendJSON(res, 401, { error: 'Óheimilt' });

  // ---- gift cards (staff) ----
  if (p === '/api/giftcards' && req.method === 'GET') {
    const g = readJSON(GIFT_FILE, { cards: {} });
    const cards = Object.values(g.cards).sort((a, b) => (a.created < b.created ? 1 : -1));
    return sendJSON(res, 200, { ok: true, cards });
  }
  if (p === '/api/giftcards' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    const name = String(body.name || '').trim();
    const phone = String(body.phone || '').trim();
    const amount = Math.round(Number(body.amount));
    if (!name) return sendJSON(res, 400, { error: 'Nafn vantar' });
    if (!Number.isFinite(amount) || amount <= 0) return sendJSON(res, 400, { error: 'Inneign verður að vera hærri en 0' });
    const id = crypto.randomBytes(12).toString('hex');
    const now = new Date().toISOString();
    const card = { id, name, phone, balance: amount, created: now, history: [{ ts: now, type: 'create', amount, balanceAfter: amount }] };
    const g = readJSON(GIFT_FILE, { cards: {} });
    g.cards[id] = card; writeJSON(GIFT_FILE, g);
    return sendJSON(res, 200, { ok: true, card, url: '/gjafabref/' + id });
  }
  const gcRedeem = p.match(/^\/api\/giftcards\/([a-f0-9]{16,64})\/redeem$/);
  if (gcRedeem && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    const amount = Math.round(Number(body.amount));
    if (!Number.isFinite(amount) || amount <= 0) return sendJSON(res, 400, { error: 'Ógild upphæð' });
    const g = readJSON(GIFT_FILE, { cards: {} });
    const card = g.cards[gcRedeem[1]];
    if (!card) return sendJSON(res, 404, { error: 'Gjafabréf fannst ekki' });
    if (card.balance <= 0) return sendJSON(res, 400, { error: 'Engin inneign eftir á þessu gjafabréfi' });
    const deducted = Math.min(card.balance, amount);
    card.balance -= deducted;
    card.history.push({ ts: new Date().toISOString(), type: 'redeem', amount: deducted, balanceAfter: card.balance });
    writeJSON(GIFT_FILE, g);
    return sendJSON(res, 200, { ok: true, deducted, remainder: amount - deducted, balance: card.balance, card });
  }
  const gcDel = p.match(/^\/api\/giftcards\/([a-f0-9]{16,64})$/);
  if (gcDel && req.method === 'DELETE') {
    const g = readJSON(GIFT_FILE, { cards: {} });
    if (!g.cards[gcDel[1]]) return sendJSON(res, 404, { error: 'Gjafabréf fannst ekki' });
    delete g.cards[gcDel[1]]; writeJSON(GIFT_FILE, g);
    return sendJSON(res, 200, { ok: true });
  }

  if (p === '/api/content' && req.method === 'PUT') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    const cur = readJSON(CONTENT_FILE, { texts: {}, images: {}, bg: {}, html: {}, hidden: {}, order: {}, settings: {} });
    for (const k of ['texts', 'images', 'bg', 'html', 'hidden', 'order', 'style', 'settings']) {
      if (body[k] && typeof body[k] === 'object') cur[k] = body[k];
    }
    writeJSON(CONTENT_FILE, cur);         // writeJSON speglar sjálfkrafa í GitHub
    // durable segir ritlinum hvort breytingin lifi endurræsingu af — annars lýgur hann „Allt vistað ✓“
    return sendJSON(res, 200, { ok: true, durable: GH_ON && !ghBlocked });
  }
  if (p === '/api/upload' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req, 1024)).toString('utf8') || '{}');
    const m = /^data:([\w/+.-]+);base64,(.*)$/s.exec(body.data || '');
    if (!m) return sendJSON(res, 400, { error: 'Ógilt myndsnið' });
    const extByType = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'image/svg+xml': '.svg' };
    const ext = extByType[m[1]] || '.png';
    const safe = String(body.name || 'mynd').replace(/[^\w.-]+/g, '-').replace(/\.[^.]+$/, '').slice(0, 40) || 'mynd';
    const fname = `${Date.now()}-${safe}${ext}`;
    const buf = Buffer.from(m[2], 'base64');
    fs.writeFileSync(path.join(UPLOAD_DIR, fname), buf);
    // Bíðum eftir speglun myndarinnar svo við svörum ekki „í lagi“ fyrir mynd sem hverfur við endurræsingu.
    let durable = true;
    if (GH_ON && !ghBlocked) durable = await ghPut('content/uploads/' + fname, buf, 'CMS: mynd bætt við af vefnum');
    else if (GH_ON) durable = false;
    else durable = false;
    if (!durable) console.error('  ⚠  Myndin ' + fname + ' er aðeins til staðbundið — hverfur við endurræsingu');
    return sendJSON(res, 200, { ok: true, url: `assets/uploads/${fname}`, durable });
  }
  if (p === '/api/password' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    if (!verifyPassword(body.current || '')) return sendJSON(res, 401, { error: 'Núverandi lykilorð er rangt' });
    if (!body.next || String(body.next).length < 4) return sendJSON(res, 400, { error: 'Nýtt lykilorð verður að vera a.m.k. 4 stafir' });
    setPassword(body.next);
    return sendJSON(res, 200, { ok: true }, { 'Set-Cookie': `cms_session=${sessionToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${IS_HTTPS ? '; Secure' : ''}` });
  }
  return sendJSON(res, 404, { error: 'Óþekkt slóð' });
}

// ---------- request router ----------
ensure();
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) return await handleAPI(req, res, url);
    if (url.pathname === '/admin' || url.pathname === '/admin/') {
      return serveStatic(req, res, '/cms/admin.html');
    }
    if (url.pathname === '/skann' || url.pathname === '/skann/') {
      return serveStatic(req, res, '/cms/skann.html');
    }
    // uploaded images live on the data disk (mutable), served under the same URL as before
    if (url.pathname.startsWith('/assets/uploads/')) {
      const name = path.basename(decodeURIComponent(url.pathname));
      const onDisk = path.join(UPLOAD_DIR, name);
      if (fs.existsSync(onDisk)) return serveFile(req, res, onDisk);
      const legacy = path.join(LEGACY_UPLOAD_DIR, name);
      if (fs.existsSync(legacy)) return serveFile(req, res, legacy);
      return send(res, 404, 'Not found');
    }
    // Apple Wallet pass download: /gjafabref/<id>/pass  →  signed .pkpass
    const passMatch = url.pathname.match(/^\/gjafabref\/([a-f0-9]{16,64})\/pass$/);
    if (passMatch) {
      const g = readJSON(GIFT_FILE, { cards: {} });
      const card = g.cards[passMatch[1]];
      if (!card) return send(res, 404, 'Gjafabréf fannst ekki');
      const proto = (req.headers['x-forwarded-proto'] || (IS_HTTPS ? 'https' : 'http')).split(',')[0];
      const baseUrl = proto + '://' + (req.headers['x-forwarded-host'] || req.headers.host || 'localhost');
      let pk;
      try { pk = passkit.buildPass(card, baseUrl, CONTENT_DIR); }
      catch (e) { console.error('pass error', e); return send(res, 500, 'Villa við gerð passa'); }
      if (!pk) return send(res, 503, 'Apple Wallet er ekki uppsett ennþá (vantar Apple-skírteini)');
      return send(res, 200, pk, {
        'Content-Type': 'application/vnd.apple.pkpass',
        'Content-Disposition': 'attachment; filename="radagerdi-gjafabref.pkpass"',
      });
    }
    if (/^\/gjafabref\/[a-f0-9]{16,64}$/.test(url.pathname)) {
      return serveStatic(req, res, '/cms/wallet.html');
    }
    return serveStatic(req, res, url.pathname);
  } catch (e) {
    console.error(e); sendJSON(res, 500, { error: String(e.message || e) });
  }
});

function start() {
  server.listen(PORT, () => {
    console.log(`\n  Ráðagerði CMS keyrir á  http://localhost:${PORT}\n  Vefur:  http://localhost:${PORT}/\n  Admin:  http://localhost:${PORT}/admin\n`);
  });
  // Myndirnar mega koma í bakgrunni — þær eru margar og mega ekki tefja ræsingu.
  if (GH_ON) ghPullUploads();
  if (GH_ON) {
    const t = setInterval(() => {
      if (!ghBlocked) return;
      ghUnblock().then(ok => { if (ok && ghDirty.size) ghFlush().catch(() => {}); }).catch(() => {});
    }, 30000);
    if (t.unref) t.unref();
  }
}

if (GH_ON) {
  console.log('  …  Sæki vistuð gögn úr GitHub (' + GH_REPO + ')');
  // Ræsum EKKI fyrr en lesturinn er búinn: annars gæti vistun sem berst í ræsiglugganum
  // verið skrifuð yfir þegar lesturinn skilar sér — og sú vistun væri þar með týnd.
  // Tímamörk svo vefurinn fari samt í loftið þótt GitHub svari ekki.
  let started = false;
  const go = () => { if (!started) { started = true; start(); } };
  const guard = setTimeout(() => { console.error('  ⚠  GitHub svaraði ekki í tæka tíð — ræsi samt (vistun læst þar til samband næst)'); ghBlocked = true; go(); }, 8000);
  ghPullAll().then(() => { clearTimeout(guard); go(); }).catch(() => { clearTimeout(guard); ghBlocked = true; go(); });
} else {
  console.log('  ⚠  GH_TOKEN vantar — CMS-breytingar lifa EKKI af endurræsingu');
  start();
}
