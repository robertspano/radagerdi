/* Veislupöntun (veisluthjonusta.html) → tölvupóstur til Ráðagerðis.
 *
 * Gesturinn velur fjölda, veislu og rétti, hvort hann sækir eða fær sent, dag og tíma og hvernig
 * á að ná í hann. Ekkert er greitt á netinu og verðið sem síðan sýnir er aðeins áætlun; við
 * svörum og staðfestum pöntunina. Sendingin sjálf og varnirnar eru í api/_pontun.js.
 */
'use strict';
const P = require('./_pontun');

module.exports = P.bua({
  sida: '/veisluthjonusta', takk: 'v-takk', villa: 'v-villa-anjs',
  ord: { nefn: 'pöntun', eint: 'pöntunina', ft: 'pantanir', thgf: 'pöntunum', titill: 'Pöntunarformið', uppsett: 'Pantanir eru ekki uppsettar hér', log: 'fyrirspurn' },

  lesa(body) {
    return Object.assign(P.grunnur(body), {
      veisla: P.line(body.veisla, 60),
      val: P.txt(body.val, 3000),                 // réttirnir sem gesturinn valdi, ein lína á hvert val
      aaetlad: P.line(body.aaetlad, 120),         // áætlað verð eins og síðan sýndi það
      afhending: P.eittAf(body.afhending, ['Sótt', 'Sent']),
      heimilisfang: P.line(body.heimilisfang, 200),
    });
  },

  athuga(g) {
    if (!g.fjoldi) return 'Veljið fjölda gesta.';
    if (g.afhending === 'Sent' && !g.heimilisfang) return 'Heimilisfang vantar.';
    return P.athugaGrunn(g);
  },

  skeyti(g) {
    const hvenaer = [g.dagsetning, g.klukkan && 'kl. ' + g.klukkan].filter(Boolean).join(' ');
    const afhending = g.afhending === 'Sent' ? 'Sent á ' + (g.heimilisfang || '?') : g.afhending === 'Sótt' ? 'Sótt í Ráðagerði' : '';
    return {
      fyrirsogn: 'Veislupöntun', slod: 'radagerdi.is/veisluthjonusta',
      efni: [P.gestir(g.fjoldi), g.veisla, hvenaer, g.afhending && g.afhending.toLowerCase()],
      rows: [['Fjöldi', P.gestir(g.fjoldi)], ['Veisla', g.veisla], ['Áætlað verð', g.aaetlad], ['Afhending', afhending], ['Hvenær', hvenaer],
        ['Nafn', g.nafn], ['Sími', g.simi], ['Netfang', g.netfangBirt]],
      blokkir: [['Réttir', g.val], ['Óskir', g.oskir]],
    };
  },
});
