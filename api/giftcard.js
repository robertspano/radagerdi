/* Eitt gjafabréf: lestur opinn (auðkennið í slóðinni er leyndarmálið), eyðing krefst innskráningar. */
'use strict';
const S = require('./_store');

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const id = String((req.query && req.query.id) || url.searchParams.get('id') || '');
  if (!/^[a-f0-9]{16,64}$/.test(id)) return S.sendJSON(res, 404, { error: 'Gjafabréf fannst ekki' });

  if (req.method === 'GET') {
    const g = await S.readJSON('gift', { cards: {} });
    const card = g.cards[id];
    if (!card) return S.sendJSON(res, 404, { error: 'Gjafabréf fannst ekki' });
    return S.sendJSON(res, 200, { ok: true, card });
  }

  if (req.method === 'DELETE') {
    if (!(await S.requireAuth(req, res))) return;
    const g = await S.readJSON('gift', { cards: {} }, { fresh: true });
    if (!g.cards[id]) return S.sendJSON(res, 404, { error: 'Gjafabréf fannst ekki' });
    delete g.cards[id];
    await S.writeJSON('gift', g, 'CMS: gjafabréf fjarlægt af vefnum');
    return S.sendJSON(res, 200, { ok: true });
  }

  return S.sendJSON(res, 405, { error: 'Óþekkt aðferð' });
};
