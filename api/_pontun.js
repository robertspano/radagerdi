/* Sameiginlegt fyrir formin sem senda Ráðagerði tölvupóst: veislupöntun (api/fyrirspurn.js) og
 * hópabókun (api/hopur.js).
 *
 * Pósturinn fer til okkar frá fyrirspurn.radagerdi.is (staðfesta léninu hjá Resend) með netfang
 * gestsins sem svarnetfang, svo hægt er að svara beint. Aðeins Ráðagerði fær póst héðan — gesturinn
 * aldrei. Annars mætti nota formin til að senda hverjum sem er póst í nafni Ráðagerðis.
 *
 * Varnir: aðeins af vefnum sjálfum (Origin/Referer), gildra fyrir vélmenni (falinn reitur),
 * hemill á IP-tölu og á tilvikið allt, hámarkslengd á öllu, og allt sem gesturinn skrifar er
 * stafað út í HTML. Skrár sem byrja á _ eru ekki slóðir á Vercel.
 */
'use strict';
const S = require('./_store');
const { domainToUnicode } = require('url');

const TO = process.env.FYRIRSPURN_TO || 'radagerdi@radagerdi170.is';
const FROM = process.env.FYRIRSPURN_FROM || 'Ráðagerði · vefurinn <fyrirspurn@fyrirspurn.radagerdi.is>';
const LIMIT = [5, 3600000];          // 5 sendingar á klukkustund frá sömu IP-tölu (eða IPv6-neti), bæði formin saman
const DAGUR = [60, 86400000];        // og aldrei fleiri en 60 á sólarhring frá sama tilviki — sami Resend-kvóti
                                     // og innskráningarpósturinn, svo hann má ekki klárast á ruslpósti
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
// Aðeins texti og tölur teljast gildi — hlutur (t.d. {"toString":1}) yrði annars að villu sem enginn grípur
const one = (v) => { v = Array.isArray(v) ? v[0] : v; return typeof v === 'string' || typeof v === 'number' ? String(v) : ''; };
const txt = (v, max) => one(v).replace(/\r\n?/g, '\n')
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u061c\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, '').trim().slice(0, max);
const line = (v, max) => txt(v, max).replace(/\s+/g, ' ');   // ein lína (fer m.a. í efnislínu póstsins)
const gestir = (n) => n + (n % 10 === 1 && n % 100 !== 11 ? ' gestur' : ' gestir');
// Gildi sem verður að vera eitt af fáum leyfðum (aldrei uppfletting í hlut: „toString“ o.fl. væru þá leyfð)
const eittAf = (v, leyfd) => { const x = line(v, 40); return leyfd.indexOf(x) >= 0 ? x : ''; };

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

// „2026-12-12“ → { iso, texti: „laugardagur 12. desember 2026“, vikudagur: 6 }; ógild dagsetning → tómt
function dagsetning(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(line(v, 10));
  if (!m) return { iso: '', texti: '', vikudagur: -1 };
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
  if (isNaN(d) || d.getUTCMonth() !== +m[2] - 1) return { iso: '', texti: '', vikudagur: -1 };
  return { iso: m[0], texti: DAG[d.getUTCDay()] + ' ' + d.getUTCDate() + '. ' + MAN[d.getUTCMonth()] + ' ' + d.getUTCFullYear(), vikudagur: d.getUTCDay() };
}

// Það sem bæði formin spyrja um: fjöldi, dagur og klukka, óskir og hvernig á að ná í gestinn
// Vafrinn sendir lén með íslenskum stöfum á punycode („jon@xn--rageri-pta4je.is“); svarnetfangið helst
// þannig, en í póstinum til okkar er það sýnt eins og gesturinn skrifaði það („jon@ráðagerði.is“)
function birta(netfang) {
  const i = netfang.lastIndexOf('@'); if (i < 0) return netfang;
  const lid = domainToUnicode(netfang.slice(i + 1));
  return lid ? netfang.slice(0, i + 1) + lid : netfang;
}

function grunnur(body) {
  const fjoldi = parseInt(line(body.fjoldi, 5), 10), dags = dagsetning(body.dagsetning), kl = line(body.klukkan, 5);
  const netfang = line(body.netfang, 200).toLowerCase();
  return {
    fjoldi: fjoldi >= 1 && fjoldi <= 500 ? fjoldi : 0,   // hvert form getur haft lægra hámark (hópar: 30, í api/hopur.js)
    dagsetning: dags.texti, dagIso: dags.iso, vikudagur: dags.vikudagur,
    klukkan: /^([01]\d|2[0-3]):[0-5]\d$/.test(kl) ? kl : '',
    oskir: txt(body.oskir, 3000),
    nafn: line(body.nafn, 100),
    netfang, netfangBirt: birta(netfang),
    simi: line(body.simi, 30),
    gildra: line(body.vefsida, 200),
  };
}
function athugaGrunn(g) {
  // Ísland er á UTC allt árið, svo dagurinn í dag er sá sami hér og á Íslandi
  if (g.dagIso && g.dagIso < new Date().toISOString().slice(0, 10)) return 'Dagsetningin er liðin.';
  if (!g.nafn) return 'Nafn vantar.';
  if (!g.netfang && !g.simi) return 'Netfang eða símanúmer vantar svo hægt sé að svara.';
  if (g.netfang && !/^[^\s@<>,;]+@[^\s@<>,;.]+(\.[^\s@<>,;.]+)+$/.test(g.netfang)) return 'Netfangið virðist ekki rétt.';
  // Síminn fer aðeins í meginmál póstsins (stafaður út), svo „s. 899-1234“ og „899 1234 / 699 1234“ mega standa
  if (g.simi && (g.simi.match(/\d/g) || []).length < 7) return 'Símanúmerið virðist ekki rétt.';
  return null;
}

// Pósturinn til okkar. svar: false þegar Resend hafnaði netfangi gestsins sem svarnetfangi —
// þá dugar ekki að ýta á „Svara“ og pósturinn segir það.
function postur({ fyrirsogn, efni, rows, blokkir, slod }, g, svar) {
  const hvadan = S.IS_PROD ? slod : 'forskoðun vefsins (prófun, ekki radagerdi.is)';
  const subject = (S.IS_PROD ? '' : 'PRÓFUN · ') + fyrirsogn + ': ' + efni.filter(Boolean).join(' · ') + ' — ' + g.nafn;
  const R = rows.filter((r) => r[1]), B = (blokkir || []).filter((b) => b[1]);
  const svarText = g.netfang ? (svar ? '. Svarið beint á þennan póst til að svara ' + g.nafn + '.' : '. Ekki er hægt að svara þessum pósti beint: skrifið nýjan póst á ' + g.netfangBirt + (g.simi ? ' eða hringið í ' + g.simi : '') + '.') : '.';
  const svarHtml = g.netfang ? (svar ? ' · svarið beint á þennan póst til að svara ' + esc(g.nafn) : ' · ekki er hægt að svara þessum pósti beint: skrifið nýjan póst á ' + esc(g.netfangBirt) + (g.simi ? ' eða hringið í ' + esc(g.simi) : '')) : '';
  const text = R.map((r) => r[0] + ': ' + r[1]).join('\n') + B.map((b) => '\n\n' + b[0] + ':\n' + b[1]).join('') + '\n\n— Sent af ' + hvadan + svarText;
  const html = '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#2c3a2d">' +
    '<h2 style="color:#629F67;margin:0 0 14px">' + esc(fyrirsogn) + '</h2>' +
    '<table cellpadding="6" style="border-collapse:collapse">' +
    R.map((r) => '<tr><td style="color:#629F67;font-weight:bold;padding-right:18px">' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td></tr>').join('') +
    '</table>' +
    B.map((b) => '<p style="margin:18px 0 4px;color:#629F67;font-weight:bold">' + esc(b[0]) + '</p><p style="margin:0;white-space:pre-wrap">' + esc(b[1]) + '</p>').join('') +
    '<p style="margin:22px 0 0;color:#7a8a7b;font-size:13px">Sent af ' + esc(hvadan) + svarHtml + '</p></div>';
  return { subject: subject.slice(0, 200), text, html };
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

/* Smíðar slóð (handler) fyrir eitt form.
 *   sida:   síðan sem formið er á, t.d. '/hopar' — án JavaScript er vísað þangað aftur
 *   takk / villa: id-in sem síðan birtir með :target eftir sendingu án JavaScript
 *   ord:    orðin í svörunum, t.d. { nefn: 'pöntun', eint: 'pöntunina', ft: 'pantanir', thgf: 'pöntunum',
 *           titill: 'Pöntunarformið', uppsett: 'Pantanir eru ekki uppsettar hér', log: 'fyrirspurn' }
 *   lesa(body) → g,  athuga(g) → villuboð eða null,  skeyti(g) → { fyrirsogn, efni, rows, blokkir, slod }
 */
function bua({ sida, takk, villa, ord, lesa, athuga, skeyti }) {
  function svara(req, res, code, obj) {
    // Án JavaScript kemur formið sem venjuleg sending: þá er vísað aftur á síðuna
    if (/application\/x-www-form-urlencoded/.test(req.headers['content-type'] || '')) {
      res.statusCode = 303;
      res.setHeader('Location', sida + (obj.ok ? '?sent=1#' + takk : '?villa=1#' + villa));   // síðan birtir þetta með :target
      res.setHeader('Cache-Control', 'no-store');
      return res.end();
    }
    return S.sendJSON(res, code, obj);
  }
  return async (req, res) => {
    if (req.method !== 'POST') return S.sendJSON(res, 405, { ok: false, error: 'Aðeins POST' });
    if (!fraVefnum(req)) return S.sendJSON(res, 403, { ok: false, error: 'Óheimilt' });

    let body;
    try { body = await lesaBody(req); } catch (e) { return svara(req, res, 413, { ok: false, error: 'Of löng ' + ord.nefn }); }
    if (!body || typeof body !== 'object') return svara(req, res, 400, { ok: false, error: 'Ógild ' + ord.nefn });
    const g = lesa(body);

    // Vélmenni fylla út falda reitinn: þau fá „í lagi" en ekkert er sent
    if (g.gildra) return svara(req, res, 200, { ok: true });

    const v = athuga(g);
    if (v) return svara(req, res, 400, { ok: false, error: v });

    if (S.overLimit('fyrirspurn:' + ipLykill(clientIp(req)), ...LIMIT)) {
      return svara(req, res, 429, { ok: false, error: 'Of margar ' + ord.ft + ' í röð — hringið í 546-1700 eða sendið póst á radagerdi@radagerdi170.is' });
    }
    if (S.overLimit('fyrirspurn:dagur', ...DAGUR)) {
      // Þakið á öllu tilvikinu, ekki gestinum að kenna — og sést í loggum Vercel
      console.error(ord.log + ': dagsþak náð (' + DAGUR[0] + ' á sólarhring) — ' + ord.thgf + ' hafnað');
      return svara(req, res, 429, { ok: false, error: ord.titill + ' er lokað í bili — hringið í 546-1700 eða sendið póst á radagerdi@radagerdi170.is' });
    }
    const key = process.env.RESEND_API_KEY;
    if (!key) return svara(req, res, 503, { ok: false, error: ord.uppsett });

    const post = (m) => fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify(m),
    });
    const smida = (svar) => { const p = postur(skeyti(g), g, svar); return Object.assign({ from: FROM, to: [TO], subject: p.subject, text: p.text, html: p.html }, svar && g.netfang ? { reply_to: g.netfang } : {}); };
    try {
      let r = await post(smida(true));
      // Hafni Resend svarnetfanginu er sendingin samt send — netfangið stendur þá í meginmálinu
      if (r.status === 422 && g.netfang) r = await post(smida(false));
      if (!r.ok) throw new Error('Resend ' + r.status + ': ' + (await r.text()).slice(0, 200));
    } catch (e) {
      console.error(ord.log + ' failed:', e.message);
      return svara(req, res, 502, { ok: false, error: 'Ekki tókst að senda ' + ord.eint });
    }
    return svara(req, res, 200, { ok: true });
  };
}

module.exports = { bua, grunnur, athugaGrunn, gestir, eittAf, line, txt };
