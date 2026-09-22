/* Eitt gjafabréf: lestur opinn (auðkennið í slóðinni er leyndarmálið), eyðing krefst innskráningar. */
'use strict';
const S = require('./_store');

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const id = String((req.query && req.query.id) || url.searchParams.get('id') || '');
  if (!/^[a-f0-9]{16,64}$/.test(id)) return S.sendJSON(res, 404, { error: 'Gjafabréf fannst ekki' });

  if (req.method === 'GET') {
    try {
      const g = await S.readJSON('gift', { cards: {} }, { strict: true });
      const card = (g.cards || {})[id];
      if (!card) return S.sendJSON(res, 404, { error: 'Gjafabréf fannst ekki' });
      return S.sendJSON(res, 200, { ok: true, card });
    } catch (e) {
      return S.sendJSON(res, 503, { error: 'Næ ekki í gjafabréfið núna' });
    }
  }

  if (req.method === 'DELETE') {
    if (!(await S.requireAuth(req, res))) return;
    let fannst = true;
    try {
      await S.update('gift', { cards: {} }, (g) => {
        if (!g.cards || !g.cards[id]) { fannst = false; return undefined; }
        delete g.cards[id];
        return g;
      }, 'CMS: gjafabréf fjarlægt af vefnum');
    } catch (e) { return S.sendWriteError(res, e); }
    if (!fannst) return S.sendJSON(res, 404, { error: 'Gjafabréf fannst ekki' });
    return S.sendJSON(res, 200, { ok: true });
  }

  return S.sendJSON(res, 405, { error: 'Óþekkt aðferð' });
};
