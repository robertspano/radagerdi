/* Vercel Edge Middleware — keyrir á undan skráakerfinu.
 *
 * Þrennt sem verður að gerast áður en beiðni finnur kyrrstæða skrá:
 *   1. Gamlar Webflow-slóðir fá 301 á réttu síðuna (og /post/* fá 410).
 *   2. Slóðirnar eru án endingar: /matsedlar, ekki /matsedlar.html (Róbert: „það á ekkert
 *      .html að vera“). Gamla .html-slóðin fær 301 á hreinu slóðina, svo tenglar og
 *      leitarniðurstöður halda áfram að virka.
 *   3. Allar síður fara í gegnum /api/page, sem fléttar efni eigandans inn
 *      áður en vafrinn teiknar. Kyrrstæð afhending myndi skila síðunni án þess.
 *      Skrárnar heita áfram x.html, og CMS-ið þekkir síðurnar á því nafni.
 */
import { next, rewrite } from '@vercel/edge';

export const config = {
  // Kyrrstæðar möppur og API sleppa alveg við þetta þrep.
  matcher: ['/((?!api/|assets/|css/|js/|fonts/|cms/|_vercel).*)'],
};

const IS_MENU_TABS = {
  'tab-matsedill-is': '/matsedlar', 'tab-menu-is': '/matsedlar',
  'tab-brons-is': '/brons', 'tab-brunch-is': '/brons',
  'tab-takeaway-is': '/takeaway',
  'tab-hopar-is': '/hopar', 'tab-groups-is': '/hopar',
};
const EN_MENU_TABS = {
  'tab-menu-en': '/en-matsedlar', 'tab-brunch-en': '/en-brons',
  'tab-takeaway-en': '/en-takeaway', 'tab-groups-en': '/en-hopar',
};
// Lyklarnir eru án .html: /matsedill.html og /matsedill fara sömu leið.
// /en, /um-okkur og /hafa-samband voru hér áður (→ .html), en eru nú sjálfar síðurnar.
const LEGACY = {
  '/matsedill': { to: '/matsedlar', tabs: IS_MENU_TABS },
  '/is/matsedill': { to: '/matsedlar', tabs: IS_MENU_TABS },
  '/en/menu': { to: '/en-matsedlar', tabs: EN_MENU_TABS },
  '/en-menu': { to: '/en-matsedlar', tabs: EN_MENU_TABS },
  '/en/radagerdi': { to: '/en' },
  '/en-radagerdi': { to: '/en' },
  '/en/about-us': { to: '/en-about-us' },
  '/en/contact-us': { to: '/en-contact-us' },
  '/en/seltjarnarnes-iceland-travel-guide': { to: '/en-seltjarnarnes-iceland-travel-guide' },
  '/inactive/jolasedill': { to: '/jolasedill' },
  '/en/christmas-menu': { to: '/en-jolasedill' },
};

// Slóð síðu: eitt orð án endingar (/matsedlar). /admin og /skann eru ritillinn, ekki síður.
const SIDA = /^\/[A-Za-z0-9_-]+$/;
const EKKI_SIDUR = new Set(['/admin', '/skann']);

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

// Slóðir sem mega aldrei afhendast, hvað sem stillingum líður. .vercelignore heldur
// þeim utan útgáfunnar — þetta er annað lagið, sem stillingaskrá getur ekki slökkt á.
const BANNAD = /^\/(content|server\.js|render\.yaml|package(-lock)?\.json|vercel\.json|middleware\.js|\.git|\.env)/i;

export default function middleware(req) {
  const url = new URL(req.url);
  const raw = url.pathname;
  const p = raw.length > 1 ? (raw.replace(/\/+$/, '') || '/') : raw;

  if (BANNAD.test(raw)) {
    return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  }

  // Afrit af vefnum á öðrum lénum (t.d. <verkefni>.vercel.app) mega ekki lenda í leitarvélum.
  const host = (url.hostname || req.headers.get('host') || '').toLowerCase();
  const rettLen = host === 'radagerdi.is' || host === 'www.radagerdi.is';

  if (req.method !== 'GET' && req.method !== 'HEAD') return next();

  // gamlar bloggfærslur Webflow eru farnar fyrir fullt og allt
  if (p.startsWith('/post/')) return rewrite(new URL('/api/gone', req.url));

  // /matsedlar.html → /matsedlar, /matsedlar/ → /matsedlar, /index.html og /index → /
  let clean = p.endsWith('.html') ? p.slice(0, -5) : p;
  if (clean === '/index') clean = '/';

  const hit = LEGACY[clean];
  if (hit) {
    const tab = url.searchParams.get('tab');
    const to = hit.tabs && tab && Object.prototype.hasOwnProperty.call(hit.tabs, tab) ? hit.tabs[tab] : hit.to;
    return Response.redirect(new URL(to + queryWithoutTab(url.search), req.url), 301);
  }
  if (clean !== raw && (clean === '/' || SIDA.test(clean))) {
    return Response.redirect(new URL(clean + url.search, req.url), 301);
  }

  // sitemap er búið til úr síðunum sjálfum, svo það uppfærist þegar síða bætist við eða fer
  if (p === '/sitemap.xml') return rewrite(new URL('/api/sitemap', req.url));

  // síðurnar sjálfar: efnið fléttast inn í /api/page (skráin heitir áfram x.html)
  if (clean === '/' || (SIDA.test(clean) && !EKKI_SIDUR.has(clean))) {
    const name = clean === '/' ? 'index.html' : clean.slice(1) + '.html';
    const target = new URL('/api/page', req.url);
    target.search = url.search;
    target.searchParams.set('p', name);
    return rewrite(target, rettLen ? undefined : { headers: { 'X-Robots-Tag': 'noindex, nofollow' } });
  }

  return next(rettLen ? undefined : { headers: { 'X-Robots-Tag': 'noindex, nofollow' } });
}
