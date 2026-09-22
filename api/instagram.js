'use strict';
const S = require('./_store');
// Instagram-straumurinn er ekki tengdur — sama svar og áður svo myndasíðan hagi sér eins.
module.exports = async (req, res) => S.sendJSON(res, 200, { ok: false, media: [] });
