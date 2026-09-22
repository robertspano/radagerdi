'use strict';
const S = require('./_store');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return S.sendJSON(res, 405, { ok: false });
  let body;
  try { body = await S.readBody(req); } catch (e) { return S.sendJSON(res, 400, { ok: false, error: 'Ógild beiðni' }); }
  try {
    if (await S.verifyPassword(body.password || '')) {
      return S.sendJSON(res, 200, { ok: true }, { 'Set-Cookie': S.cookieFor(await S.sessionToken()) });
    }
  } catch (e) {
    // Náum ekki í lykilorðsskrána (t.d. rangur DATA_KEY) — segjum það hreint út í stað þess að hleypa inn.
    return S.sendJSON(res, 503, { ok: false, error: 'Næ ekki í lykilorðsskrána — hafðu samband' });
  }
  return S.sendJSON(res, 401, { ok: false, error: 'Rangt lykilorð' });
};
