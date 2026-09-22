/* Úttekt af gjafabréfi (skanninn) — krefst innskráningar.
 * Upphæðin er peningar, svo úttektin er framkvæmd inni í les-breyt-skrifa lykkju:
 * rekist tvær úttektir á er sú síðari reiknuð upp á nýtt af ferskri stöðu. */
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

  let villa = null, svar = null;
  try {
    await S.update('gift', { cards: {} }, (g) => {
      const card = (g.cards || {})[id];
      if (!card) { villa = { code: 404, error: 'Gjafabréf fannst ekki' }; return undefined; }
      if (card.balance <= 0) { villa = { code: 400, error: 'Engin inneign eftir á þessu gjafabréfi' }; return undefined; }
      const deducted = Math.min(card.balance, amount);
      card.balance -= deducted;
      card.history.push({ ts: new Date().toISOString(), type: 'redeem', amount: deducted, balanceAfter: card.balance });
      svar = { ok: true, deducted, remainder: amount - deducted, balance: card.balance, card };
      return g;
    }, 'CMS: úttekt af gjafabréfi');
  } catch (e) { return S.sendWriteError(res, e); }

  if (villa) return S.sendJSON(res, villa.code, { error: villa.error });
  return S.sendJSON(res, 200, svar);
};
