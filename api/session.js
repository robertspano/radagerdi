'use strict';
const S = require('./_store');
module.exports = async (req, res) => {
  const email = S.sessionEmail(req);
  S.sendJSON(res, 200, { authed: !!email, email: email || null, publicOrigin: null });
};
