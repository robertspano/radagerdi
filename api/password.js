/* Lykilorðsbreyting — krefst BÆÐI innskráningar og núverandi lykilorðs, eins og á Render. */
'use strict';
const S = require('./_store');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return S.sendJSON(res, 405, { error: 'Óþekkt aðferð' });
  if (!(await S.requireAuth(req, res))) return;
  const body = await S.readBody(req);
  let ok = false;
  try { ok = await S.verifyPassword(body.current || ''); }
  catch (e) { return S.sendJSON(res, 503, { error: 'Næ ekki í lykilorðsskrána — ekkert var vistað' }); }
  if (!ok) return S.sendJSON(res, 401, { error: 'Núverandi lykilorð er rangt' });
  if (!body.next || String(body.next).length < 4) return S.sendJSON(res, 400, { error: 'Nýtt lykilorð verður að vera a.m.k. 4 stafir' });
  try {
    await S.setPassword(body.next);
    return S.sendJSON(res, 200, { ok: true }, { 'Set-Cookie': S.cookieFor(await S.sessionToken()) });
  } catch (e) { return S.sendWriteError(res, e); }
};
