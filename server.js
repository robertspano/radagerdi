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

// ---------- storage helpers ----------
function ensure() {
  fs.mkdirSync(CONTENT_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (!fs.existsSync(CONTENT_FILE)) {
    fs.writeFileSync(CONTENT_FILE, JSON.stringify({
      texts: {}, images: {}, bg: {}, html: {}, hidden: {}, order: {}, settings: {}
    }, null, 2));
  }
  if (!fs.existsSync(GIFT_FILE)) writeJSON(GIFT_FILE, { cards: {} });
  if (!fs.existsSync(AUTH_FILE)) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(DEFAULT_PASSWORD, salt, 32).toString('hex');
    fs.writeFileSync(AUTH_FILE, JSON.stringify({ salt, hash }, null, 2));
    console.log('\n  ⚙  Default admin password set to:  ' + DEFAULT_PASSWORD + '   (change it in /admin → Stillingar)\n');
  }
}
const readJSON = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } };
const writeJSON = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 2));

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
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' });
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
  if (p === '/api/login' && req.method === 'POST') {
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
    for (const k of ['texts', 'images', 'bg', 'html', 'hidden', 'order', 'settings']) {
      if (body[k] && typeof body[k] === 'object') cur[k] = body[k];
    }
    writeJSON(CONTENT_FILE, cur);
    return sendJSON(res, 200, { ok: true });
  }
  if (p === '/api/upload' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    const m = /^data:([\w/+.-]+);base64,(.*)$/s.exec(body.data || '');
    if (!m) return sendJSON(res, 400, { error: 'Ógilt myndsnið' });
    const extByType = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'image/svg+xml': '.svg' };
    const ext = extByType[m[1]] || '.png';
    const safe = String(body.name || 'mynd').replace(/[^\w.-]+/g, '-').replace(/\.[^.]+$/, '').slice(0, 40) || 'mynd';
    const fname = `${Date.now()}-${safe}${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, fname), Buffer.from(m[2], 'base64'));
    return sendJSON(res, 200, { ok: true, url: `assets/uploads/${fname}` });
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
http.createServer(async (req, res) => {
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
    if (/^\/gjafabref\/[a-f0-9]{16,64}$/.test(url.pathname)) {
      return serveStatic(req, res, '/cms/wallet.html');
    }
    return serveStatic(req, res, url.pathname);
  } catch (e) {
    console.error(e); sendJSON(res, 500, { error: String(e.message || e) });
  }
}).listen(PORT, () => {
  console.log(`\n  Ráðagerði CMS keyrir á  http://localhost:${PORT}\n  Vefur:  http://localhost:${PORT}/\n  Admin:  http://localhost:${PORT}/admin\n`);
});
