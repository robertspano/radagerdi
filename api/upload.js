/* Myndir sem eigandinn hleður upp fara beint í GitHub og birtast strax (sjá api/asset.js).
 * SVG er ekki leyft: slík skrá má innihalda skriftu og væri afhent af sama léni og CMS-ið. */
'use strict';
const S = require('./_store');

const EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' };

module.exports = async (req, res) => {
  if (req.method !== 'POST') return S.sendJSON(res, 405, { error: 'Óþekkt aðferð' });
  if (!(await S.requireAuth(req, res))) return;
  if (!S.IS_PROD) return S.sendJSON(res, 403, { error: 'Þetta er forskoðunarútgáfa — vistun er óvirk hér', durable: false });
  let body;
  try { body = await S.readBody(req, 4); }
  catch (e) { return S.sendJSON(res, 413, { error: 'Myndin er of stór — veldu minni mynd', durable: false }); }
  const m = /^data:([\w/+.-]+);base64,(.*)$/s.exec(body.data || '');
  if (!m) return S.sendJSON(res, 400, { error: 'Ógilt myndsnið' });
  const ext = EXT[m[1]];
  if (!ext) return S.sendJSON(res, 400, { error: 'Aðeins JPG, PNG, WebP og GIF eru leyfð' });
  const safe = String(body.name || 'mynd').replace(/[^\w.-]+/g, '-').replace(/\.[^.]+$/, '').slice(0, 40) || 'mynd';
  const fname = `${Date.now()}-${safe}${ext}`;
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 5 * 1024 * 1024) return S.sendJSON(res, 413, { error: 'Myndin er of stór — veldu minni mynd', durable: false });
  try {
    await S.ghPut('content/uploads/' + fname, buf, 'CMS: mynd bætt við af vefnum');
  } catch (e) {
    return S.sendJSON(res, 502, { error: 'Vistun myndarinnar mistókst: ' + e.message, durable: false });
  }
  return S.sendJSON(res, 200, { ok: true, url: `assets/uploads/${fname}`, durable: true });
};
