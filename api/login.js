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
    // Náum ekki í lykilorðsskrána — segjum hreint út hvort skráin vantar eða lykillinn gengur ekki.
    const badKey = e && e.code === 'BADKEY';
    return S.sendJSON(res, 503, {
      ok: false,
      error: badKey
        ? 'Dulkóðunarlykillinn gengur ekki upp — GH_TOKEN hér er ekki sami lykill og gögnin voru dulkóðuð með'
        : 'Næ ekki í lykilorðsskrána: ' + String((e && e.message) || e),
    });
  }
  return S.sendJSON(res, 401, { ok: false, error: 'Rangt lykilorð' });
};
