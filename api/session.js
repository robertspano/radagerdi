'use strict';
const S = require('./_store');
module.exports = async (req, res) => {
  // publicOrigin: null → ritillinn notar lénið sem verið er að skoða (location.origin)
  S.sendJSON(res, 200, { authed: await S.isAuthed(req), publicOrigin: null });
};
