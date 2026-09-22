'use strict';
const S = require('./_store');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return S.sendJSON(res, 405, { error: 'Óþekkt aðferð' });
  const body = await S.readBody(req);
  if (!(await S.verifyPassword(body.current || ''))) return S.sendJSON(res, 401, { error: 'Núverandi lykilorð er rangt' });
  if (!body.next || String(body.next).length < 4) return S.sendJSON(res, 400, { error: 'Nýtt lykilorð verður að vera a.m.k. 4 stafir' });
  await S.setPassword(body.next);
  return S.sendJSON(res, 200, { ok: true }, { 'Set-Cookie': S.cookieFor(await S.sessionToken()) });
};
