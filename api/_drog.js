/* Faldar síður (drög).
 *
 * Síða á þessum lista er komin á vefinn svo eigendurnir geti unnið í henni í ritlinum,
 * en ENGINN annar sér hana: hvorki gestir, Google né sá sem giskar á slóðina. Aðeins
 * þeir sem eru skráðir inn í ritilinn (netfang á CMS_EMAILS) fá síðuna. Aðrir fá
 * tímabundna tilvísun (302) á slóðina hér til hliðar, eins og síðan væri ekki til.
 *
 * Síðan er líka utan sitemap og efni hennar utan /api/content fyrir óinnskráða.
 *
 * Til að BIRTA síðu: taka hana af listanum og senda í loftið. Ekkert annað.
 */
'use strict';

module.exports = {
  // Nýja veisluþjónustan (nóv. 2026): Gísli og Viktor vinna í henni í ritlinum á
  // radagerdi.is/veisluthjonusta-nytt?cms=1. Gamla síðan stendur óbreytt á /veisluthjonusta á meðan,
  // og gestir sem rata hingað fá hana. (Nýja Hópa-síðan var hér líka og var birt á /hopar 26. nóv. 2026.)
  //
  // Til að BIRTA (þegar Róbert segir til) — ekki bara taka af listanum, því síðurnar eiga að taka við
  // af gömlu slóðunum:
  //   1. Færa breytingar eigendanna í ritlinum af 'veisluthjonusta-nytt.html' yfir á 'veisluthjonusta.html'
  //      í content.json, með vistunarleið ritilsins (les ferskt, skrifar með sha), ekki með commit.
  //      Lyklarnir eru staðsetning í síðunni og síðan er sú sama, svo þeir passa óbreyttir.
  //   2. Setja skrárnar í stað gömlu skránna (veisluthjonusta-nytt.html → veisluthjonusta.html o.s.frv.),
  //      taka þær af þessum lista og vísa -nytt slóðunum á réttar slóðir.
  //   3. Taka „(Væntanleg)“ af valmyndinni og opna Veisluþjónustu-reitinn á forsíðunni.
  'veisluthjonusta-nytt.html': '/veisluthjonusta',
  // Jólasíðan (jolasedill.html, en-jolasedill.html) var hér 20.–21. okt. 2026; Róbert birti hana 21. okt.
};
