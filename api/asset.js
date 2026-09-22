/* Myndir eigandans: /assets/uploads/<nafn>
 *
 * Þær sem þegar eru í útgáfunni afgreiðast kyrrstætt af hraðnetinu. Þessi leið grípur
 * hinar — nýuppsettar myndir sem eru komnar í GitHub en ekki í útgáfuna — svo þær
 * birtist strax en ekki eftir næstu útgáfu.
 */
'use strict';
const S = require('./_store');

const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml' };

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const raw = url.searchParams.get('name') || '';
  const name = raw.split('/').pop().split('?')[0];
  if (!/^[\w.-]+\.(png|jpe?g|webp|gif|svg)$/i.test(name)) {
    res.statusCode = 404; res.setHeader('Cache-Control', 'no-store'); return res.end('Not found');
  }
  try {
    const got = await S.ghGet('content/uploads/' + name);
    if (got.missing) { res.statusCode = 404; res.setHeader('Cache-Control', 'no-store'); return res.end('Not found'); }
    const ext = ('.' + name.split('.').pop()).toLowerCase();
    res.statusCode = 200;
    res.setHeader('Content-Type', TYPES[ext] || 'application/octet-stream');
    // Nafnið ber tímastimpil og breytist aldrei — óhætt að geyma lengi.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.end(got.buf);
  } catch (e) {
    res.statusCode = 502; res.setHeader('Cache-Control', 'no-store'); return res.end('Upstream error');
  }
};
