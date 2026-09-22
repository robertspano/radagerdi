/* Sameiginlega lykilorðið er farið — innskráning fer fram með tengli í tölvupósti. */
'use strict';
const S = require('./_store');
module.exports = async (req, res) =>
  S.sendJSON(res, 410, { ok: false, error: 'Lykilorðsinnskráning er ekki lengur í boði — notaðu netfangið þitt' });
