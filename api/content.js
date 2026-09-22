/* Efni vefsins: opinn lestur, vistun aðeins fyrir innskráðan eiganda. */
'use strict';
const S = require('./_store');

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const c = await S.readJSON('content', S.EMPTY_CONTENT);
    return S.sendJSON(res, 200, c);
  }
  if (req.method === 'PUT') {
    if (!(await S.requireAuth(req, res))) return;
    const body = await S.readBody(req);
    // Ferskur lestur rétt fyrir vistun: annars gæti vistun frá öðrum glatast.
    const cur = await S.readJSON('content', Object.assign({}, S.EMPTY_CONTENT), { fresh: true });
    for (const k of ['texts', 'images', 'bg', 'html', 'hidden', 'order', 'style', 'settings']) {
      if (body[k] && typeof body[k] === 'object') cur[k] = body[k];
    }
    await S.writeJSON('content', cur, 'CMS: efni uppfært af vefnum');
    return S.sendJSON(res, 200, { ok: true, durable: true });
  }
  return S.sendJSON(res, 405, { error: 'Óþekkt aðferð' });
};
