/* Veislupöntun (veisluthjonusta.html) → tölvupóstur til Ráðagerðis.
 *
 * Gesturinn velur fjölda, veislu og rétti, hvort hann sækir eða fær sent, dag og tíma og hvernig
 * á að ná í hann; pósturinn fer til okkar frá fyrirspurn.radagerdi.is (staðfesta léninu hjá Resend)
 * með netfang gestsins sem svarnetfang, svo hægt er að svara beint og staðfesta pöntunina.
 * Ekkert er greitt á netinu og verðið sem síðan sýnir er aðeins áætlun.
 *
 * Aðeins Ráðagerði fær póst héðan — gesturinn aldrei. Annars mætti nota formið til að senda
 * hverjum sem er póst í nafni Ráðagerðis.
 *
 * Varnir: aðeins af vefnum sjálfum (Origin/Referer), gildra fyrir vélmenni (falinn reitur),
 * hemill á IP-tölu, hámarkslengd á öllu, og allt sem gesturinn skrifar er stafað út í HTML.
 */
'use strict';
const S = require('./_store');

const TO = process.env.FYRIRSPURN_TO || 'radagerdi@radagerdi170.is';
const FROM = process.env.FYRIRSPURN_FROM || 'Ráðagerði · vefurinn <fyrirspurn@fyrirspurn.radagerdi.is>';
const LIMIT = [5, 3600000];          // 5 pantanir á klukkustund frá sömu IP-tölu (eða IPv6-neti)
const DAGUR = [60, 86400000];        // og aldrei fleiri en 60 á sólarhring frá sama tilviki — sami Resend-kvóti
                                     // og innskráningarpósturinn, svo hann má ekki klárast á ruslpósti
const SIDA = '/veisluthjonusta';
const MAN = ['janúar', 'febrúar', 'mars', 'apríl', 'maí', 'júní', 'júlí', 'ágúst', 'september', 'október', 'nóvember', 'desember'];
const DAG = ['sunnudagur', 'mánudagur', 'þriðjudagur', 'miðvikudagur', 'fimmtudagur', 'föstudagur', 'laugardagur'];

const clientIp = (req) =>
  String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '').split(',')[0].trim() || 'óþekkt';
// IPv6: hvert heimili fær heilt /64-net, svo talið er á netið en ekki staka tölu
function ipLykill(ip) {
  if (!ip.includes(':') || /^::ffff:\d/i.test(ip)) return ip.replace(/^::ffff:/i, '');
  const [a, b = ''] = ip.split('::');
  const h = a ? a.split(':') : [], t = b ? b.split(':') : [];
  return h.concat(Array(Math.max(0, 8 - h.length - t.length)).fill('0'), t).slice(0, 4).map(x => (parseInt(x, 16) || 0).toString(16)).join(':') + '::/64';
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const one = (v) => (Array.isArray(v) ? v[0] : v);
const txt = (v, max) => String(one(v) == null ? '' : one(v)).replace(/\r\n?/g, '\n')
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g, '').trim().slice(0, max);
const line = (v, max) => txt(v, max).replace(/\s+/g, ' ');   // ein lína (fer m.a. í efnislínu póstsins)

// Aðeins beiðnir af vefnum sjálfum. Allir vafrar senda Origin með POST; án hans og Referer er
// þetta forrit eða skrifta, ekki gestur á síðunni. Á forskoðun (Vercel Preview) er vefurinn á
// eigin slóð, og þar gildir sama regla: síðan og fyrirspurnin verða að vera á sama léni.
function fraVefnum(req) {
  const o = req.headers.origin || req.headers.referer || '';
  if (!o) return false;
  let h; try { h = new URL(o).hostname; } catch (e) { return false; }
  if (h === 'radagerdi.is' || h === 'www.radagerdi.is' || h === 'localhost' || h === '127.0.0.1') return true;
  const self = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().replace(/:\d+$/, '').toLowerCase();
  return !S.IS_PROD && !!self && h === self;
}

function dagsetning(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(line(v, 10));
  if (!m) return '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
  if (isNaN(d) || d.getUTCMonth() !== +m[2] - 1) return '';
  return DAG[d.getUTCDay()] + ' ' + d.getUTCDate() + '. ' + MAN[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
}

function lesa(body) {
  const fjoldi = parseInt(line(body.fjoldi, 5), 10);
  return {
    fjoldi: fjoldi >= 1 && fjoldi <= 500 ? fjoldi : 0,
    veisla: line(body.veisla, 60),
    val: txt(body.val, 3000),                 // réttirnir sem gesturinn valdi, ein lína á hvert val
    aaetlad: line(body.aaetlad, 120),         // áætlað verð eins og síðan sýndi það
    afhending: { 'Sótt': 'Sótt', 'Sent': 'Sent' }[line(body.afhending, 10)] || '',
    heimilisfang: line(body.heimilisfang, 200),
    dagsetning: dagsetning(body.dagsetning),
    klukkan: /^([01]\d|2[0-3]):[0-5]\d$/.test(line(body.klukkan, 5)) ? line(body.klukkan, 5) : '',
    oskir: txt(body.oskir, 3000),
    nafn: line(body.nafn, 100),
    netfang: line(body.netfang, 200).toLowerCase(),
    simi: line(body.simi, 30),
    gildra: line(body.vefsida, 200),
  };
}

function athuga(g) {
  if (!g.fjoldi) return 'Veljið fjölda gesta.';
  if (g.afhending === 'Sent' && !g.heimilisfang) return 'Heimilisfang vantar.';
  if (!g.nafn) return 'Nafn vantar.';
  if (!g.netfang && !g.simi) return 'Netfang eða símanúmer vantar svo hægt sé að svara.';
  if (g.netfang && !/^[^\s@<>,;]+@[^\s@<>,;.]+(\.[^\s@<>,;.]+)+$/.test(g.netfang)) return 'Netfangið virðist ekki rétt.';
  // Síminn fer aðeins í meginmál póstsins (stafaður út), svo „s. 899-1234“ og „899 1234 / 699 1234“ mega standa
  if (g.simi && (g.simi.match(/\d/g) || []).length < 7) return 'Símanúmerið virðist ekki rétt.';
  return null;
}

function postur(g) {
  const gestir = g.fjoldi + (g.fjoldi % 10 === 1 && g.fjoldi % 100 !== 11 ? ' gestur' : ' gestir');
  const hvenaer = [g.dagsetning, g.klukkan && 'kl. ' + g.klukkan].filter(Boolean).join(' ');
  const afhending = g.afhending === 'Sent' ? 'Sent á ' + (g.heimilisfang || '?') : g.afhending === 'Sótt' ? 'Sótt í Ráðagerði' : '';
  const subject = (S.IS_PROD ? '' : 'PRÓFUN · ') + 'Veislupöntun: ' + [gestir, g.veisla, hvenaer, g.afhending && g.afhending.toLowerCase()].filter(Boolean).join(' · ') + ' — ' + g.nafn;
  const rows = [
    ['Fjöldi', gestir], ['Veisla', g.veisla], ['Áætlað verð', g.aaetlad], ['Afhending', afhending], ['Hvenær', hvenaer],
    ['Nafn', g.nafn], ['Sími', g.simi], ['Netfang', g.netfang],
  ].filter((r) => r[1]);
  const blokk = (heiti, v) => '<p style="margin:18px 0 4px;color:#629F67;font-weight:bold">' + heiti + '</p><p style="margin:0;white-space:pre-wrap">' + esc(v) + '</p>';
  const text = rows.map((r) => r[0] + ': ' + r[1]).join('\n') + (g.val ? '\n\nRéttir:\n' + g.val : '') + (g.oskir ? '\n\nÓskir:\n' + g.oskir : '') +
    '\n\n— Sent af ' + (S.IS_PROD ? 'radagerdi.is/veisluthjonusta' : 'forskoðun vefsins (prófun, ekki radagerdi.is)') + (g.netfang ? '. Svarið beint á þennan póst til að svara ' + g.nafn + '.' : '.');
  const html = '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#2c3a2d">' +
    '<h2 style="color:#629F67;margin:0 0 14px">Veislupöntun</h2>' +
    '<table cellpadding="6" style="border-collapse:collapse">' +
    rows.map((r) => '<tr><td style="color:#629F67;font-weight:bold;padding-right:18px">' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td></tr>').join('') +
    '</table>' +
    (g.val ? blokk('Réttir', g.val) : '') + (g.oskir ? blokk('Óskir', g.oskir) : '') +
    '<p style="margin:22px 0 0;color:#7a8a7b;font-size:13px">Sent af ' + (S.IS_PROD ? 'radagerdi.is/veisluthjonusta' : 'forskoðun vefsins (prófun, ekki radagerdi.is)') + (g.netfang ? ' · svarið beint á þennan póst til að svara ' + esc(g.nafn) : '') + '</p></div>';
  return { subject: subject.slice(0, 200), text, html };
}

function svara(req, res, code, obj) {
  // Án JavaScript kemur formið sem venjuleg sending: þá er vísað aftur á síðuna
  if (/application\/x-www-form-urlencoded/.test(req.headers['content-type'] || '')) {
    res.statusCode = 303;
    res.setHeader('Location', SIDA + (obj.ok ? '?sent=1#v-takk' : '?villa=1#v-villa-anjs'));   // síðan birtir þetta með :target
    res.setHeader('Cache-Control', 'no-store');
    return res.end();
  }
  return S.sendJSON(res, code, obj);
}

async function lesaBody(req) {
  const ct = String(req.headers['content-type'] || '');
  if (/application\/x-www-form-urlencoded/.test(ct)) {
    let raw = req.body;
    if (raw === undefined) { const ch = []; let n = 0; for await (const c of req) { n += c.length; if (n > 20000) throw new Error('of stórt'); ch.push(c); } raw = Buffer.concat(ch).toString('utf8'); }
    if (raw && typeof raw === 'object') return raw;
    return Object.fromEntries(new URLSearchParams(String(raw || '')));
  }
  return S.readBody(req, 0.05);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return S.sendJSON(res, 405, { ok: false, error: 'Aðeins POST' });
  if (!fraVefnum(req)) return S.sendJSON(res, 403, { ok: false, error: 'Óheimilt' });

  let body;
  try { body = await lesaBody(req); } catch (e) { return svara(req, res, 413, { ok: false, error: 'Of löng pöntun' }); }
  if (!body || typeof body !== 'object') return svara(req, res, 400, { ok: false, error: 'Ógild pöntun' });
  const g = lesa(body);

  // Vélmenni fylla út falda reitinn: þau fá „í lagi" en ekkert er sent
  if (g.gildra) return svara(req, res, 200, { ok: true });

  const villa = athuga(g);
  if (villa) return svara(req, res, 400, { ok: false, error: villa });

  if (S.overLimit('fyrirspurn:' + ipLykill(clientIp(req)), ...LIMIT) || S.overLimit('fyrirspurn:dagur', ...DAGUR)) {
    return svara(req, res, 429, { ok: false, error: 'Of margar pantanir í röð — hringið í 546-1700 eða sendið póst á radagerdi@radagerdi170.is' });
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) return svara(req, res, 503, { ok: false, error: 'Pantanir eru ekki uppsettar hér' });

  const p = postur(g);
  const msg = Object.assign({ from: FROM, to: [TO], subject: p.subject, text: p.text, html: p.html }, g.netfang ? { reply_to: g.netfang } : {});
  const post = (m) => fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify(m),
  });
  try {
    let r = await post(msg);
    // Hafni Resend svarnetfanginu er pöntunin samt send — netfangið stendur þá í meginmálinu
    if (r.status === 422 && msg.reply_to) { delete msg.reply_to; r = await post(msg); }
    if (!r.ok) throw new Error('Resend ' + r.status + ': ' + (await r.text()).slice(0, 200));
  } catch (e) {
    console.error('fyrirspurn failed:', e.message);
    return svara(req, res, 502, { ok: false, error: 'Ekki tókst að senda pöntunina' });
  }
  return svara(req, res, 200, { ok: true });
};
