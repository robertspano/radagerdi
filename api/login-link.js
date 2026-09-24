/* Sendir innskráningartengil í tölvupósti.
 *
 * Síðan segir HREINT ÚT ef netfangið er ekki á aðgangslistanum. Áður svaraði hún eins
 * fyrir öll netföng („Tengill var sendur“) svo ekki mætti lesa út hverjir eiga aðgang —
 * en þá beið Viktor eftir pósti sem var aldrei sendur, án þess að nokkuð segði hvers
 * vegna. Fyrir ritil sem þrír eigendur nota er það margfalt verra en að einhver geti
 * komist að því að tiltekið netfang sé á listanum: hann kemst samt ekki inn án
 * pósthólfsins, og hemillinn hér að neðan heldur slíkum þreifingum í skefjum.
 *
 * Sama gildir um sendingarvillur: ef netfangið er á listanum en pósturinn kemst ekki af
 * stað segjum við frá því, í stað þess að sýna „Tengill var sendur“.
 */
'use strict';
const S = require('./_store');

const clientIp = (req) =>
  String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '').split(',')[0].trim() || 'óþekkt';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return S.sendJSON(res, 405, { ok: false });
  if (!S.EMAIL_LOGIN) return S.sendJSON(res, 503, { ok: false, error: 'Innskráning er ekki uppsett — hafðu samband við Róbert' });

  let body;
  try { body = await S.readBody(req, 1); } catch (e) { return S.sendJSON(res, 400, { ok: false }); }
  const email = String(body.email || '').trim().toLowerCase();

  // Talið á IP-tölu og netfang, hvort sem það er á listanum eða ekki — þannig er ekki hægt
  // að þreifa sig í gegnum mörg netföng til að finna hver eru á listanum.
  if (S.overLimit('ip:' + clientIp(req), ...S.LIMITS.ip) ||
      S.overLimit('e:' + email, ...S.LIMITS.email)) {
    return S.sendJSON(res, 429, { ok: false, error: 'Of margar beiðnir í röð — bíddu í nokkrar mínútur og reyndu aftur' });
  }

  if (!S.mayEnter(email)) {
    return S.sendJSON(res, 403, { ok: false, error: 'Netfangið ' + email + ' hefur ekki aðgang að ritlinum. Athugaðu stafsetninguna, eða biddu Róbert að bæta því á listann.' });
  }
  const host = (req.headers['x-forwarded-host'] || req.headers.host || 'radagerdi.is').split(',')[0];
  const next = S.safeNext(body.next, '/?cms=1');
  try {
    await S.sendLoginLink(email, 'https://' + host, next);
  } catch (e) {
    console.error('login link failed:', e.message);
    return S.sendJSON(res, 502, { ok: false, error: 'Pósturinn komst ekki af stað: ' + e.message });
  }
  return S.sendJSON(res, 200, { ok: true });
};
