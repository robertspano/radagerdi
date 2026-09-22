'use strict';
const S = require('./_store');
// Apple Wallet-passar eru ekki uppsettir (engin skírteini) — sama svar og áður.
module.exports = async (req, res) => S.sendJSON(res, 200, { available: false });
