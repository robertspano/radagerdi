/* Bókunarbeiðni fyrir hóp (hopar.html og enska útgáfan en-hopar.html) → tölvupóstur til Ráðagerðis.
 *
 * Gesturinn velur fjölda, hvenær (hádegi, kvöld eða bröns), hópaseðil, dag og tíma og hvernig á
 * að ná í hann. Þetta er beiðni, ekki bókun: við bókum hópinn inn ef borð er laust og staðfestum
 * það við gestinn. Sendingin sjálf og varnirnar eru í api/_pontun.js.
 *
 * Enska síðan sendir mal: 'en'. Reglurnar eru þær sömu; aðeins svörin til gestsins eru á ensku
 * (ENSKA og ENSK_SVOR hér fyrir neðan). Pósturinn til okkar er alltaf á íslensku, merktur „á ensku“.
 */
'use strict';
const P = require('./_pontun');

const TIMAR = ['Hádegi', 'Kvöld', 'Bröns'];   // gildin eru á íslensku á báðum síðum — aðeins merkingarnar eru þýddar
const JOL = ['2026-11-19', '2027-01-06'];   // jólaseðillinn 2026 — uppfæra (eða taka út) fyrir næstu jól

// Villuboðin á ensku, orð fyrir orð eins og enska síðan (en-hopar.html) hefur þau. Hvert boð sem
// reglur() og P.athugaGrunn() geta skilað verður að vera hér — test/hopur.test.js gáir að því
const ENSKA = new Map([
  ['Veljið fjölda gesta.', 'Please choose the number of guests.'],
  ['Dagsetningin er liðin.', 'That date has already passed.'],
  ['Nafn vantar.', 'Please enter your name.'],
  ['Netfang eða símanúmer vantar svo hægt sé að svara.', 'Please enter an email address or phone number so we can reply.'],
  ['Netfangið virðist ekki rétt.', 'The email address does not look right.'],
  ['Símanúmerið virðist ekki rétt.', 'The phone number does not look right.'],
  ['Netfang vantar.', 'Please enter your email address.'],
  ['Símanúmer vantar.', 'Please enter your phone number.'],
  ['Veljið dagsetningu.', 'Please choose a date.'],
  ['Veljið klukkan hvað.', 'Please choose a time.'],
  ['Bröns er aðeins um helgar — veljið laugardag eða sunnudag.', 'Brunch is only at weekends — please choose a Saturday or Sunday.'],
  ['Bröns byrjar kl. 11:00.', 'Brunch starts at 11:00.'],
  ['Síðasti komutími hópa í bröns er kl. 15:00.', 'The latest arrival time for groups at brunch is 15:00.'],
  ['Hádegi er aðeins á virkum dögum — um helgar er bröns.', 'Lunch is only on weekdays — at weekends we serve brunch.'],
  ['Hádegi byrjar kl. 11:30.', 'Lunch starts at 11:30.'],
  ['Síðasti komutími hópa í hádeginu er kl. 15:00.', 'The latest arrival time for groups at lunch is 15:00.'],
  ['Kvöld er ekki í boði fyrir kl. 16:00 um helgar.', 'Dinner is not available before 16:00 at weekends.'],
  ['Við opnum kl. 11:30 á virkum dögum.', 'We open at 11:30 on weekdays.'],
  ['Þessi tími er liðinn í dag.', 'That time has already passed today.'],
  ['Jólaseðillinn er í boði 19. nóvember – 6. janúar.', 'The Christmas menu is available 19 November – 6 January.'],
]);
// Svör _pontun.js sjálfs til ensku síðunnar (hemill, bilun, enginn lykill) og síðan sem vísað er á án JavaScript
const ENSK_SVOR = {
  sida: '/en-hopar',
  margar: 'Too many requests in a row — please call 546-1700 or email radagerdi@radagerdi170.is.',
  lokad: 'The booking form is closed for now — please call 546-1700 or email radagerdi@radagerdi170.is.',
  sending: 'We could not send your request.',
  uppsett: 'Booking requests are not set up here.',
};

// Reglurnar, á íslensku; athuga() hér fyrir neðan þýðir boðið fyrir ensku síðuna
function reglur(g) {
  // Hópabókunin tekur að hámarki 30 gesti (eins og síðan); veisluþjónustan leyfir fleiri, svo hámarkið er hér
  if (!g.fjoldi || g.fjoldi > 30) return 'Veljið fjölda gesta.';
  // Hópabókun þarf bæði netfang og síma (veisluþjónustan lætur annað duga, svo þetta er hér en ekki í _pontun.js)
  const v = P.athugaGrunn(g);
  if (v && v !== 'Netfang eða símanúmer vantar svo hægt sé að svara.') return v;
  if (!g.netfang) return 'Netfang vantar.';
  if (!g.simi) return 'Símanúmer vantar.';
  if (!g.dagIso) return 'Veljið dagsetningu.';
  if (!g.klukkan) return 'Veljið klukkan hvað.';
  // Hvaða dagar og klukkan passa við hvern tíma (sömu orð og á síðunni, svo hún bendi á réttan reit)
  // 15:00 er síðasti komutími hópa í hádeginu og bröns (seðlarnir eru bornir fram lengur)
  const helgi = g.vikudagur === 0 || g.vikudagur === 6, kl = g.klukkan;
  if (g.timi === 'Bröns') {
    if (!helgi) return 'Bröns er aðeins um helgar — veljið laugardag eða sunnudag.';
    if (kl < '11:00') return 'Bröns byrjar kl. 11:00.';
    if (kl > '15:00') return 'Síðasti komutími hópa í bröns er kl. 15:00.';
  }
  if (g.timi === 'Hádegi') {
    if (helgi) return 'Hádegi er aðeins á virkum dögum — um helgar er bröns.';
    if (kl < '11:30') return 'Hádegi byrjar kl. 11:30.';
    if (kl > '15:00') return 'Síðasti komutími hópa í hádeginu er kl. 15:00.';
  }
  if (g.timi === 'Kvöld' && helgi && kl < '16:00') return 'Kvöld er ekki í boði fyrir kl. 16:00 um helgar.';
  if (!helgi && kl < '11:30') return 'Við opnum kl. 11:30 á virkum dögum.';
  // Ísland er á UTC: tími sem er liðinn í dag
  const nu = new Date().toISOString();
  if (g.dagIso === nu.slice(0, 10) && kl <= nu.slice(11, 16)) return 'Þessi tími er liðinn í dag.';
  // Jólaseðillinn (spjaldið á síðunni hefur sömu dagsetningar í data-fra/data-til); á ensku síðunni heitir hann „Christmas Menu“
  if (/jólaseðil|christmas/i.test(g.sedill) && (g.dagIso < JOL[0] || g.dagIso > JOL[1])) return 'Jólaseðillinn er í boði 19. nóvember – 6. janúar.';
  return null;
}

const handler = P.bua({
  sida: '/hopar', takk: 'v-takk', villa: 'v-villa-anjs',
  ord: { nefn: 'beiðni', eint: 'beiðnina', ft: 'beiðnir', thgf: 'beiðnum', titill: 'Bókunarformið', uppsett: 'Bókunarbeiðnir eru ekki uppsettar hér', log: 'hopur' },

  lesa(body) {
    return Object.assign(P.grunnur(body), {
      // Aðeins nákvæmlega 'en' er enska; allt annað ('EN', listi, hlutur, ekkert) er íslenska.
      // Beinn samanburður — gildið er aldrei notað til að fletta upp í hlut
      mal: body.mal === 'en' ? 'en' : 'is',
      timi: P.eittAf(body.timi, TIMAR),
      sedill: P.line(body.sedill, 120),           // hópaseðillinn eins og síðan sýndi hann, t.d. „Kvöld · Valkostur 2 · 9.900 kr á mann“
      aaetlad: P.line(body.aaetlad, 120),         // áætlað verð eins og síðan sýndi það
    });
  },

  athuga(g) {
    const v = reglur(g);
    // Lykillinn er alltaf eitt af okkar eigin boðum, aldrei texti frá gestinum
    return v && g.mal === 'en' ? ENSKA.get(v) || v : v;
  },

  svor(g) {
    return g.mal === 'en' ? ENSK_SVOR : null;
  },

  skeyti(g) {
    const hvenaer = [g.dagsetning, g.klukkan && 'kl. ' + g.klukkan].filter(Boolean).join(' ');
    const en = g.mal === 'en';   // pósturinn er á íslensku (starfsfólkið les hann), en segir að svara á ensku
    return {
      fyrirsogn: en ? 'Hópabókun (á ensku)' : 'Hópabókun', slod: en ? 'radagerdi.is/en-hopar' : 'radagerdi.is/hopar',
      efni: [P.gestir(g.fjoldi), g.timi, hvenaer],
      rows: [['Fjöldi', P.gestir(g.fjoldi)], ['Tungumál', en ? 'Enska — svarið gestinum á ensku' : ''], ['Hvenær', g.timi], ['Hópaseðill', g.sedill], ['Áætlað verð', g.aaetlad], ['Dagur', hvenaer],
        ['Nafn', g.nafn], ['Sími', g.simi], ['Netfang', g.netfangBirt]],
      blokkir: [['Óskir', g.oskir]],
    };
  },
});
handler.ENSKA = ENSKA;   // fyrir test/hopur.test.js
module.exports = handler;
