/* Gjafabréf — listi og útgáfa. Gögnin eru dulkóðuð í GitHub, aldrei í læsilegu formi. */
'use strict';
const crypto = require('crypto');
const S = require('./_store');

module.exports = async (req, res) => {
  if (!(await S.requireAuth(req, res))) return;

  if (req.method === 'GET') {
    try {
      const g = await S.readJSON('gift', { cards: {} }, { strict: true });
      const cards = Object.values(g.cards || {}).sort((a, b) => (a.created < b.created ? 1 : -1));
      return S.sendJSON(res, 200, { ok: true, cards });
    } catch (e) {
      return S.sendJSON(res, 503, { error: 'Næ ekki í gjafabréfin núna: ' + e.message });
    }
  }

  if (req.method === 'POST') {
    const body = await S.readBody(req);
    const name = String(body.name || '').trim();
    const phone = String(body.phone || '').trim();
    const amount = Math.round(Number(body.amount));
    if (!name) return S.sendJSON(res, 400, { error: 'Nafn vantar' });
    if (!Number.isFinite(amount) || amount <= 0) return S.sendJSON(res, 400, { error: 'Inneign verður að vera hærri en 0' });
    const id = crypto.randomBytes(12).toString('hex');
    const now = new Date().toISOString();
    const card = { id, name, phone, balance: amount, created: now, history: [{ ts: now, type: 'create', amount, balanceAfter: amount }] };
    try {
      await S.update('gift', { cards: {} }, (g) => { g.cards = g.cards || {}; g.cards[id] = card; return g; },
        'CMS: gjafabréf gefið út af vefnum');
      return S.sendJSON(res, 200, { ok: true, card, url: '/gjafabref/' + id });
    } catch (e) { return S.sendWriteError(res, e); }
  }

  return S.sendJSON(res, 405, { error: 'Óþekkt aðferð' });
};
