'use strict';
const S = require('./_store');
module.exports = async (req, res) => S.sendJSON(res, 200, { ok: true, id: process.env.VERCEL_DEPLOYMENT_ID || 'vercel' });
