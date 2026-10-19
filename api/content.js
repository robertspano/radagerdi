/* Efni vefsins: opinn lestur, vistun aðeins fyrir innskráðan eiganda.
 *
 * Mikilvægt: ef ekki næst í gögnin má ALDREI svara 200 með tómu efni — ritillinn
 * myndi þá halda að vefurinn væri tómur og gæti vistað það tóma yfir allt saman.
 *
 * Vistunin sjálf (hvaða breytingum er beitt, og hvernig) er í api/_efni.js.
 */
'use strict';
const S = require('./_store');
const E = require('./_efni');

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    try {
      const c = await S.readJSON('content', null, { strict: true });
      const all = c || S.emptyContent();
      return S.sendJSON(res, 200, S.sessionEmail(req) ? all : E.withoutDrafts(all));
    } catch (e) {
      return S.sendJSON(res, 503, { error: 'Næ ekki í efnið núna: ' + e.message });
    }
  }

  if (req.method === 'PUT') {
    if (!(await S.requireAuth(req, res))) return;
    let body;
    try { body = await S.readBody(req); }
    catch (e) { return S.sendJSON(res, 413, { error: 'Of stór vistun', durable: false }); }
    // Ógild sending fær skýrt svar strax, áður en nokkuð er lesið eða skrifað
    try { E.applyEdit(S.emptyContent(), body); }
    catch (e) { return S.sendJSON(res, 400, { error: e.message, durable: false }); }
    try {
      // Beitt á nýjasta efnið; S.update keyrir þetta aftur á ferskum gögnum ef annar vistaði á sama tíma
      await S.update('content', S.emptyContent(), (cur) => E.applyEdit(cur, body), 'CMS: efni uppfært af vefnum');
      return S.sendJSON(res, 200, { ok: true, durable: true });
    } catch (e) {
      return S.sendWriteError(res, e);
    }
  }

  return S.sendJSON(res, 405, { error: 'Óþekkt aðferð' });
};
