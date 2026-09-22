/* Ekkert sameiginlegt lykilorð lengur, svo það er ekkert að breyta. */
'use strict';
const S = require('./_store');
module.exports = async (req, res) =>
  S.sendJSON(res, 410, { error: 'Lykilorð er ekki lengur notað — aðgangur er bundinn netfangi' });
