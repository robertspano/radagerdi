/* Efni vefsins: opinn lestur, vistun aðeins fyrir innskráðan eiganda.
 *
 * Mikilvægt: ef ekki næst í gögnin má ALDREI svara 200 með tómu efni — ritillinn
 * myndi þá halda að vefurinn væri tómur og gæti vistað það tóma yfir allt saman.
 */
'use strict';
const S = require('./_store');

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    try {
      const c = await S.readJSON('content', null, { strict: true });
      return S.sendJSON(res, 200, c || S.emptyContent());
    } catch (e) {
      return S.sendJSON(res, 503, { error: 'Næ ekki í efnið núna: ' + e.message });
    }
  }

  if (req.method === 'PUT') {
    if (!(await S.requireAuth(req, res))) return;
    let body;
    try { body = await S.readBody(req); }
    catch (e) { return S.sendJSON(res, 413, { error: 'Of stór vistun', durable: false }); }
    try {
      await S.update('content', S.emptyContent(), (cur) => {
        for (const k of ['texts', 'images', 'bg', 'html', 'hidden', 'order', 'style', 'settings']) {
          if (body[k] && typeof body[k] === 'object') cur[k] = body[k];
        }
        return cur;
      }, 'CMS: efni uppfært af vefnum');
      return S.sendJSON(res, 200, { ok: true, durable: true });
    } catch (e) {
      return S.sendWriteError(res, e);
    }
  }

  return S.sendJSON(res, 405, { error: 'Óþekkt aðferð' });
};
