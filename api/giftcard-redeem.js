/* Úttekt af gjafabréfi (skanninn) — krefst innskráningar. */
'use strict';
const S = require('./_store');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return S.sendJSON(res, 405, { error: 'Óþekkt aðferð' });
  if (!(await S.requireAuth(req, res))) return;
  const url = new URL(req.url, 'http://x');
  const id = String((req.query && req.query.id) || url.searchParams.get('id') || '');
  if (!/^[a-f0-9]{16,64}$/.test(id)) return S.sendJSON(res, 404, { error: 'Gjafabréf fannst ekki' });

  const body = await S.readBody(req);
  const amount = Math.round(Number(body.amount));
  if (!Number.isFinite(amount) || amount <= 0) return S.sendJSON(res, 400, { error: 'Ógild upphæð' });

  const g = await S.readJSON('gift', { cards: {} }, { fresh: true });
  const card = g.cards[id];
  if (!card) return S.sendJSON(res, 404, { error: 'Gjafabréf fannst ekki' });
  if (card.balance <= 0) return S.sendJSON(res, 400, { error: 'Engin inneign eftir á þessu gjafabréfi' });

  const deducted = Math.min(card.balance, amount);
  card.balance -= deducted;
  card.history.push({ ts: new Date().toISOString(), type: 'redeem', amount: deducted, balanceAfter: card.balance });
  await S.writeJSON('gift', g, 'CMS: úttekt af gjafabréfi');
  return S.sendJSON(res, 200, { ok: true, deducted, remainder: amount - deducted, balance: card.balance, card });
};
