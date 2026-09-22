/* Sendir innskráningartengil í tölvupósti.
 *
 * Tvennt togast á hér og það er meðvitað leyst svona:
 *
 *   Netfang sem er EKKI á listanum fær alltaf sama svar og eitt sem er á honum (200,
 *   enginn póstur sendur) — annars mætti lesa út úr svörunum hverjir eiga aðgang.
 *
 *   En ef netfangið ER á listanum og pósturinn kemst samt ekki af stað, þá SEGJUM VIÐ
 *   FRÁ ÞVÍ. Áður var villan gleypt og skjárinn sagði „Tengill var sendur“ hvað sem
 *   gekk á. Þar með gat röng uppsetning (óstaðfest lén hjá Resend, útrunninn lykill,
 *   fullur dagskammtur) læst báðum eigendum úti án þess að nokkurs staðar sæist hvers
 *   vegna — og það er engin lykilorðsleið til baka lengur. Villuboð sem ljóstra upp um
 *   að netfang sé á listanum meðan póstþjónustan liggur niðri eru margfalt minna tjón.
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

  // Talið á netfangið hvort sem það er á listanum eða ekki, svo þakið ljóstri engu upp.
  if (S.overLimit('ip:' + clientIp(req), ...S.LIMITS.ip) ||
      S.overLimit('e:' + email, ...S.LIMITS.email)) {
    return S.sendJSON(res, 429, { ok: false, error: 'Of margar beiðnir í röð — bíddu í nokkrar mínútur og reyndu aftur' });
  }

  if (S.mayEnter(email)) {
    const host = (req.headers['x-forwarded-host'] || req.headers.host || 'radagerdi.is').split(',')[0];
    const next = S.safeNext(body.next, '/?cms=1');
    try {
      await S.sendLoginLink(email, 'https://' + host, next);
    } catch (e) {
      console.error('login link failed:', e.message);
      return S.sendJSON(res, 502, { ok: false, error: 'Pósturinn komst ekki af stað: ' + e.message });
    }
  }
  return S.sendJSON(res, 200, { ok: true });
};
