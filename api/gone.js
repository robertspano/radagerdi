/* Gömlu Webflow-bloggfærslurnar eru farnar fyrir fullt og allt — 410 með merktu síðunni. */
'use strict';
const fs = require('fs');
const path = require('path');
let page;
module.exports = async (req, res) => {
  if (page === undefined) {
    page = null;
    for (const root of [process.cwd(), path.join(__dirname, '..')]) {
      try { page = fs.readFileSync(path.join(root, 'cms/404.html'), 'utf8'); break; } catch (e) { }
    }
  }
  res.statusCode = 410;
  res.setHeader('Content-Type', page ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.end(page || 'Gone');
};
