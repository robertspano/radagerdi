'use strict';
const S = require('./_store');
module.exports = async (req, res) => S.sendJSON(res, 200, { mode: S.EMAIL_LOGIN ? 'email' : 'off' });
