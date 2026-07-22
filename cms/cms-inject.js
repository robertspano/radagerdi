/* Ráðagerði CMS — public injector.
 * Runs on every page. Fetches saved content and applies it:
 *   - html[]   : full innerHTML of menu panes (.w-tab-pane)   [structural regions]
 *   - texts[]  : innerHTML of text leaves NOT inside a region
 *   - images[] : src of <img> NOT inside a region
 *   - hidden[] : elements to hide
 *   - order[]  : tab reorder (__tabs__)
 * If ?cms=1 and the visitor is logged in, it loads the editor.
 */
(function () {
  'use strict';
  const PAGE = (location.pathname.split('/').pop() || 'index.html') || 'index.html';
  const INLINE = new Set(['A', 'SPAN', 'STRONG', 'B', 'EM', 'I', 'BR', 'U', 'S', 'DEL', 'STRIKE', 'SMALL', 'SUP', 'SUB', 'MARK', 'WBR', 'LABEL', 'FONT']);
  const SKIP = new Set(['SCRIPT', 'STYLE', 'IMG', 'VIDEO', 'SOURCE', 'NOSCRIPT', 'IFRAME', 'svg', 'SVG']);

  // ---- stable element keys (path from body) ----
  function key(el) {
    const parts = [];
    let n = el;
    while (n && n !== document.body && n.parentElement) {
      const p = n.parentElement, tag = n.tagName;
      let idx = 0, i = 0;
      for (const c of p.children) { if (c.tagName === tag) { if (c === n) { idx = i; break; } i++; } }
      parts.unshift(tag + idx);
      n = p;
    }
    return parts.join('>');
  }
  function elByKey(k) {
    let node = document.body;
    for (const part of k.split('>')) {
      const tag = part.replace(/\d+$/, ''), idx = +part.slice(tag.length);
      let i = 0, found = null;
      for (const c of node.children) { if (c.tagName === tag) { if (i === idx) { found = c; break; } i++; } }
      if (!found) return null; node = found;
    }
    return node;
  }
  function isTextLeaf(el) {
    if (SKIP.has(el.tagName) || el.closest('svg')) return false;
    if (!el.textContent || !el.textContent.trim()) return false;
    for (const c of el.children) if (!INLINE.has(c.tagName)) return false;
    return true;
  }
  function textLeaves() {
    return [...document.body.querySelectorAll('*')].filter(isTextLeaf);
  }
  const REGION_SEL = '.w-tab-pane, .card, .redbox';
  function panes() { return [...document.querySelectorAll('.w-tab-pane')]; }
  function regions() { return [...document.querySelectorAll(REGION_SEL)]; }
  function inRegion(el) { return !!el.closest(REGION_SEL); }

  function reorderTabs(order) {
    const menu = document.querySelector('.w-tab-menu'), content = document.querySelector('.w-tab-content');
    if (!menu || !content) return;
    order.forEach(v => {
      const pill = menu.querySelector(`[data-w-tab="${CSS.escape(v)}"]`);
      const pane = content.querySelector(`[data-w-tab="${CSS.escape(v)}"]`);
      if (pill) menu.appendChild(pill);
      if (pane) content.appendChild(pane);
    });
  }

  function apply(content) {
    const g = (o) => (o && o[PAGE]) || {};
    const H = g(content.html), T = g(content.texts), I = g(content.images), BG = g(content.bg), HID = g(content.hidden), O = g(content.order);
    // 1. structural regions first (menu panes + themed cards)
    regions().forEach(el => { const k = key(el); if (H[k] != null) el.innerHTML = H[k]; });
    // 2. text leaves outside regions
    textLeaves().forEach(el => { if (inRegion(el)) return; const k = key(el); if (T[k] != null) el.innerHTML = T[k]; });
    // 3. images outside regions
    document.querySelectorAll('img').forEach(img => {
      if (inRegion(img)) return; const k = key(img);
      if (I[k] != null) { img.src = I[k]; img.removeAttribute('srcset'); img.removeAttribute('sizes'); }
    });
    // 3b. background-image overrides (elements not in a region)
    Object.keys(BG).forEach(k => { const el = elByKey(k); if (el && !inRegion(el)) el.style.backgroundImage = 'url("' + BG[k] + '")'; });
    // 4. tab order (before hidden, so index-based hidden keys still resolve)
    if (Array.isArray(O.__tabs__)) reorderTabs(O.__tabs__);
    // 5. hidden
    Object.keys(HID).forEach(k => { if (HID[k]) { const el = elByKey(k); if (el) el.style.display = 'none'; } });
  }

  // expose helpers for the editor
  window.__CMS__ = { PAGE, key, elByKey, textLeaves, panes, regions, inRegion, isTextLeaf, REGION_SEL };

  async function boot() {
    let content = {};
    try {
      const r = await fetch('/api/content', { cache: 'no-store' });
      if (!r.ok) throw new Error('no api');
      content = await r.json();
    } catch (e) {
      // static hosting (e.g. GitHub Pages): fall back to the committed content file
      try { content = await (await fetch('content/content.json', { cache: 'no-store' })).json(); } catch (e2) { }
    }
    window.__CMS__.content = content;
    try { apply(content); } catch (e) { console.warn('CMS apply error', e); }

    // editor bootstrap
    const editParam = new URLSearchParams(location.search).has('cms');
    if (editParam) {
      let authed = false;
      try { authed = (await (await fetch('/api/session')).json()).authed; } catch (e) { }
      if (authed) {
        const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/cms/cms-editor.css'; document.head.appendChild(css);
        const s = document.createElement('script'); s.src = '/cms/cms-editor.js'; document.body.appendChild(s);
      } else {
        location.replace('/admin?next=' + encodeURIComponent(location.pathname + '?cms=1'));
      }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
