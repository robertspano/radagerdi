'use strict';
const S = require('./_store');
module.exports = async (req, res) =>
  S.sendJSON(res, 200, { ok: true }, { 'Set-Cookie': 'cms_session=; Path=/; Max-Age=0' });
