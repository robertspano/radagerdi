/* Myndir sem eigandinn hleður upp fara beint í GitHub og birtast strax (sjá api/asset.js). */
'use strict';
const S = require('./_store');

const EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'image/svg+xml': '.svg' };

module.exports = async (req, res) => {
  if (req.method !== 'POST') return S.sendJSON(res, 405, { error: 'Óþekkt aðferð' });
  if (!(await S.requireAuth(req, res))) return;
  let body;
  try { body = await S.readBody(req, 12); } catch (e) { return S.sendJSON(res, 413, { error: 'Myndin er of stór' }); }
  const m = /^data:([\w/+.-]+);base64,(.*)$/s.exec(body.data || '');
  if (!m) return S.sendJSON(res, 400, { error: 'Ógilt myndsnið' });
  const ext = EXT[m[1]] || '.png';
  const safe = String(body.name || 'mynd').replace(/[^\w.-]+/g, '-').replace(/\.[^.]+$/, '').slice(0, 40) || 'mynd';
  const fname = `${Date.now()}-${safe}${ext}`;
  const buf = Buffer.from(m[2], 'base64');
  try {
    await S.ghPut('content/uploads/' + fname, buf, 'CMS: mynd bætt við af vefnum');
  } catch (e) {
    return S.sendJSON(res, 502, { error: 'Vistun myndarinnar mistókst: ' + e.message, durable: false });
  }
  return S.sendJSON(res, 200, { ok: true, url: `assets/uploads/${fname}`, durable: true });
};
