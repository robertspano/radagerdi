/* Efni vefsins: opinn lestur, vistun aðeins fyrir innskráðan eiganda.
 *
 * Mikilvægt: ef ekki næst í gögnin má ALDREI svara 200 með tómu efni — ritillinn
 * myndi þá halda að vefurinn væri tómur og gæti vistað það tóma yfir allt saman.
 */
'use strict';
const S = require('./_store');
const DROG = require('./_drog');
const BUCKETS = ['texts', 'images', 'bg', 'html', 'hidden', 'order', 'style', 'settings'];
const isDrog = (p) => Object.prototype.hasOwnProperty.call(DROG, p);

// Efni faldra síðna (api/_drog.js) er aðeins fyrir innskráða — annars mætti lesa textann hér.
function withoutDrafts(c) {
  const out = Object.assign({}, c);
  for (const k of BUCKETS) {
    if (!out[k] || typeof out[k] !== 'object') continue;
    out[k] = Object.assign({}, out[k]);
    for (const p of Object.keys(out[k])) if (isDrog(p)) delete out[k][p];
  }
  return out;
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    try {
      const c = await S.readJSON('content', null, { strict: true });
      const all = c || S.emptyContent();
      return S.sendJSON(res, 200, S.sessionEmail(req) ? all : withoutDrafts(all));
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
        for (const k of BUCKETS) {
          if (!body[k] || typeof body[k] !== 'object') continue;
          // Vistun sem barst án efnis faldrar síðu (t.d. ritill sem fékk efnið óinnskráður)
          // má ekki þurrka það út — það sem vantar í sendinguna er látið standa.
          const keep = cur[k] && typeof cur[k] === 'object' ? cur[k] : {};
          for (const p of Object.keys(keep)) if (isDrog(p) && !(p in body[k])) body[k][p] = keep[p];
          cur[k] = body[k];
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
