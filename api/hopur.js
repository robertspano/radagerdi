/* Bókunarbeiðni fyrir hóp (hopar.html) → tölvupóstur til Ráðagerðis.
 *
 * Gesturinn velur fjölda, hvenær (hádegi, kvöld eða bröns), hópaseðil, dag og tíma og hvernig á
 * að ná í hann. Þetta er beiðni, ekki bókun: við bókum hópinn inn ef borð er laust og staðfestum
 * það við gestinn. Sendingin sjálf og varnirnar eru í api/_pontun.js.
 */
'use strict';
const P = require('./_pontun');

const TIMAR = ['Hádegi', 'Kvöld', 'Bröns'];

module.exports = P.bua({
  sida: '/hopar', takk: 'v-takk', villa: 'v-villa-anjs',
  ord: { nefn: 'beiðni', eint: 'beiðnina', ft: 'beiðnir', thgf: 'beiðnum', titill: 'Bókunarformið', uppsett: 'Bókunarbeiðnir eru ekki uppsettar hér', log: 'hopur' },

  lesa(body) {
    return Object.assign(P.grunnur(body), {
      timi: P.eittAf(body.timi, TIMAR),
      sedill: P.line(body.sedill, 120),           // hópaseðillinn eins og síðan sýndi hann, t.d. „Kvöld · Valkostur 2 · 9.900 kr á mann“
      aaetlad: P.line(body.aaetlad, 120),         // áætlað verð eins og síðan sýndi það
    });
  },

  athuga(g) {
    if (!g.fjoldi) return 'Veljið fjölda gesta.';
    // Hópabókun þarf bæði netfang og síma (veisluþjónustan lætur annað duga, svo þetta er hér en ekki í _pontun.js)
    const v = P.athugaGrunn(g);
    if (v && v !== 'Netfang eða símanúmer vantar svo hægt sé að svara.') return v;
    if (!g.netfang) return 'Netfang vantar.';
    if (!g.simi) return 'Símanúmer vantar.';
    if (!g.dagIso) return 'Veljið dagsetningu.';
    if (!g.klukkan) return 'Veljið klukkan hvað.';
    // Hvaða dagar og klukkan passa við hvern tíma (sömu orð og á síðunni, svo hún bendi á réttan reit)
    const helgi = g.vikudagur === 0 || g.vikudagur === 6, kl = g.klukkan;
    if (g.timi === 'Bröns') {
      if (!helgi) return 'Bröns er aðeins um helgar — veljið laugardag eða sunnudag.';
      if (kl < '11:00' || kl > '15:00') return 'Bröns er frá kl. 11:00 til 15:00.';
    }
    if (g.timi === 'Hádegi') {
      if (helgi) return 'Hádegi er aðeins á virkum dögum — um helgar er bröns.';
      if (kl < '11:30' || kl > '15:00') return 'Hádegi er frá kl. 11:30 til 15:00.';
    }
    if (g.timi === 'Kvöld' && helgi && kl < '16:00') return 'Kvöld er ekki í boði fyrir kl. 16:00 um helgar.';
    return null;
  },

  skeyti(g) {
    const hvenaer = [g.dagsetning, g.klukkan && 'kl. ' + g.klukkan].filter(Boolean).join(' ');
    return {
      fyrirsogn: 'Hópabókun', slod: 'radagerdi.is/hopar',
      efni: [P.gestir(g.fjoldi), g.timi, hvenaer],
      rows: [['Fjöldi', P.gestir(g.fjoldi)], ['Hvenær', g.timi], ['Hópaseðill', g.sedill], ['Áætlað verð', g.aaetlad], ['Dagur', hvenaer],
        ['Nafn', g.nafn], ['Sími', g.simi], ['Netfang', g.netfangBirt]],
      blokkir: [['Óskir', g.oskir]],
    };
  },
});
