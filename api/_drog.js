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
  // Engin falin síða núna. Jólasíðan (jolasedill.html, en-jolasedill.html) var hér 20.–21. okt. 2026
  // á meðan Gísli og Viktor löguðu textann; Róbert birti hana 21. okt.
  // Dæmi:  'jolasedill.html': '/matsedlar',
};
