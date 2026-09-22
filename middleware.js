/* Vercel Edge Middleware — keyrir á undan skráakerfinu.
 *
 * Tvennt sem verður að gerast áður en beiðni finnur kyrrstæða skrá:
 *   1. Gamlar Webflow-slóðir fá 301 á réttu síðuna (og /post/* fá 410).
 *   2. Allar .html-síður fara í gegnum /api/page, sem fléttar efni eigandans inn
 *      áður en vafrinn teiknar. Kyrrstæð afhending myndi skila síðunni án þess.
 */
import { next, rewrite } from '@vercel/edge';

export const config = {
  // Kyrrstæðar möppur og API sleppa alveg við þetta þrep.
  matcher: ['/((?!api/|assets/|css/|js/|fonts/|cms/|_vercel).*)'],
};

const IS_MENU_TABS = {
  'tab-matsedill-is': '/matsedlar.html', 'tab-menu-is': '/matsedlar.html',
  'tab-brons-is': '/brons.html', 'tab-brunch-is': '/brons.html',
  'tab-takeaway-is': '/takeaway.html',
  'tab-hopar-is': '/hopar.html', 'tab-groups-is': '/hopar.html',
};
const EN_MENU_TABS = {
  'tab-menu-en': '/en-matsedlar.html', 'tab-brunch-en': '/en-brons.html',
  'tab-takeaway-en': '/en-takeaway.html', 'tab-groups-en': '/en-hopar.html',
};
const LEGACY = {
  '/matsedill': { to: '/matsedlar.html', tabs: IS_MENU_TABS },
  '/is/matsedill': { to: '/matsedlar.html', tabs: IS_MENU_TABS },
  '/matsedill.html': { to: '/matsedlar.html', tabs: IS_MENU_TABS },
  '/en/menu': { to: '/en-matsedlar.html', tabs: EN_MENU_TABS },
  '/en-menu.html': { to: '/en-matsedlar.html', tabs: EN_MENU_TABS },
  '/en': { to: '/en.html' },
  '/en/radagerdi': { to: '/en.html' },
  '/en-radagerdi.html': { to: '/en.html' },
  '/um-okkur': { to: '/um-okkur.html' },
  '/hafa-samband': { to: '/hafa-samband.html' },
  '/en/about-us': { to: '/en-about-us.html' },
  '/en/contact-us': { to: '/en-contact-us.html' },
  '/en/seltjarnarnes-iceland-travel-guide': { to: '/en-seltjarnarnes-iceland-travel-guide.html' },
  '/jolasedill': { to: '/matsedlar.html' },
  '/inactive/jolasedill': { to: '/matsedlar.html' },
};

// ?tab= er Webflow-leifar: fellt burt eftir vörpun, annað (t.d. utm_*) helst óbreytt.
function queryWithoutTab(search) {
  if (!search || search.length < 2) return '';
  const kept = search.slice(1).split('&').filter(kv => {
    if (!kv) return false;
    let k = kv.split('=')[0];
    try { k = decodeURIComponent(k.replace(/\+/g, ' ')); } catch (e) { }
    return k !== 'tab';
  });
  return kept.length ? '?' + kept.join('&') : '';
}

export default function middleware(req) {
  const url = new URL(req.url);
  const raw = url.pathname;
  const p = raw.length > 1 ? (raw.replace(/\/+$/, '') || '/') : raw;

  if (req.method !== 'GET' && req.method !== 'HEAD') return next();

  // gamlar bloggfærslur Webflow eru farnar fyrir fullt og allt
  if (p.startsWith('/post/')) return rewrite(new URL('/api/gone', req.url));

  const hit = LEGACY[p];
  if (hit) {
    const tab = url.searchParams.get('tab');
    const to = hit.tabs && tab && Object.prototype.hasOwnProperty.call(hit.tabs, tab) ? hit.tabs[tab] : hit.to;
    return Response.redirect(new URL(to + queryWithoutTab(url.search), req.url), 301);
  }
  // /index.html er sama síða og / (sama síðu-auðkenni í CMS-inu)
  if (p === '/index.html') return Response.redirect(new URL('/' + url.search, req.url), 301);
  // /brons.html/ → /brons.html
  if (p !== raw && /^\/[^/]+\.html$/.test(p)) return Response.redirect(new URL(p + url.search, req.url), 301);

  // síðurnar sjálfar: efnið fléttast inn í /api/page
  if (p === '/' || /^\/[^/]+\.html$/.test(p)) {
    const name = p === '/' ? 'index.html' : p.slice(1);
    const target = new URL('/api/page', req.url);
    target.search = url.search;
    target.searchParams.set('p', name);
    return rewrite(target);
  }

  return next();
}
