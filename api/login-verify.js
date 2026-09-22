/* Tekur við tenglinum úr póstinum, staðfestir undirskriftina og opnar ritilinn. */
'use strict';
const S = require('./_store');

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const email = url.searchParams.get('e') || '';
  const exp = url.searchParams.get('exp') || '';
  const sig = url.searchParams.get('sig') || '';
  const next = url.searchParams.get('next') || '/admin';

  if (!S.checkLink(email, exp, sig)) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.end('<!doctype html><meta charset="utf-8"><title>Tengillinn gildir ekki</title>' +
      '<div style="font-family:-apple-system,sans-serif;max-width:32rem;margin:18vh auto;padding:0 20px;line-height:1.6">' +
      '<h1 style="font-size:20px">Tengillinn gildir ekki lengur</h1>' +
      '<p>Hann rennur út eftir 15 mínútur. Smelltu hér til að fá nýjan: ' +
      // Slóðin sem verið var að fara á fylgir með, svo nýi tengillinn skili á sama stað.
      '<a href="/admin?next=' + encodeURIComponent(S.safeNext(next, '/?cms=1')) + '">Fá nýjan tengil</a></p></div>');
  }

  // Aðeins innri slóðir — tengill úr pósti má ekki senda fólk á annað lén.
  res.statusCode = 302;
  res.setHeader('Set-Cookie', S.cookieFor(email));
  res.setHeader('Location', S.safeNext(next, '/admin'));
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');   // undirskriftin stendur í slóðinni
  res.end();
};
