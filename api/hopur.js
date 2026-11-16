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
    return P.athugaGrunn(g);
  },

  skeyti(g) {
    const hvenaer = [g.dagsetning, g.klukkan && 'kl. ' + g.klukkan].filter(Boolean).join(' ');
    // Síðan varar gestinn við ef dagur eða klukka passar ekki við seðilinn, en beiðnin fer samt —
    // starfsfólkið sér það hér. Hádegi: virka daga 11:30–16:00; kvöld: frá 16:00; bröns: helgar 11:00–15:30.
    const helgi = g.vikudagur === 0 || g.vikudagur === 6, kl = g.klukkan, a = [];
    if (g.timi === 'Hádegi' && helgi) a.push('Hádegisseðlarnir eru virka daga, en dagurinn er um helgi.');
    if (g.timi === 'Bröns' && g.vikudagur > 0 && !helgi) a.push('Bröns er um helgar, en dagurinn er virkur dagur.');
    if (kl && g.timi === 'Hádegi' && (kl < '11:30' || kl > '16:00')) a.push('Hádegisseðlarnir eru frá 11:30 til 16:00.');
    if (kl && g.timi === 'Kvöld' && kl < '16:00') a.push('Kvöldseðlarnir eru frá kl. 16:00.');
    if (kl && g.timi === 'Bröns' && (kl < '11:00' || kl > '15:30')) a.push('Bröns er frá 11:00 til 15:30.');
    const athugid = a.join(' ');
    return {
      fyrirsogn: 'Hópabókun', slod: 'radagerdi.is/hopar',
      efni: [P.gestir(g.fjoldi), g.timi, hvenaer],
      rows: [['Fjöldi', P.gestir(g.fjoldi)], ['Hvenær', g.timi], ['Hópaseðill', g.sedill], ['Áætlað verð', g.aaetlad], ['Dagur', hvenaer], ['Athugið', athugid],
        ['Nafn', g.nafn], ['Sími', g.simi], ['Netfang', g.netfang]],
      blokkir: [['Óskir', g.oskir]],
    };
  },
});
