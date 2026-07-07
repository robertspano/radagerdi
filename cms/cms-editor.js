/* Ráðagerði CMS — visual editor (loaded only in edit mode for logged-in users). */
(function () {
  'use strict';
  const CMS = window.__CMS__;
  const PAGE = CMS.PAGE;
  const content = CMS.content || {};
  ['texts', 'images', 'bg', 'html', 'hidden', 'order'].forEach(k => { content[k] = content[k] || {}; content[k][PAGE] = content[k][PAGE] || {}; });
  let dirty = false;

  const PAGES = [
    ['index.html', 'Forsíða'], ['matsedill.html', 'Matseðill'], ['um-okkur.html', 'Um okkur'], ['hafa-samband.html', 'Hafa samband'],
    ['en-radagerdi.html', 'EN · Home'], ['en-menu.html', 'EN · Menu'], ['en-about-us.html', 'EN · About'], ['en-contact-us.html', 'EN · Contact'], ['en-seltjarnarnes-iceland-travel-guide.html', 'EN · Travel guide'],
  ];

  // ---------- helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  // ---------- auto-save ----------
  let saveT = null, saving = false;
  function setStatus(s) {
    const b = $('#cms-status'); if (!b) return;
    b.className = 'cms-status ' + s;
    b.textContent = s === 'saving' ? 'Vistar…' : s === 'pending' ? 'Vista sjálfkrafa…' : 'Allt vistað ✓';
  }
  function scheduleSave() { clearTimeout(saveT); saveT = setTimeout(save, 600); }
  function markDirty() { dirty = true; setStatus('pending'); scheduleSave(); }
  function setOverride(type, k, v) { content[type][PAGE][k] = v; markDirty(); }
  const payload = () => JSON.stringify({ texts: content.texts, images: content.images, bg: content.bg, html: content.html, hidden: content.hidden, order: content.order });

  function paneClean(pane) {
    const c = pane.cloneNode(true);
    c.querySelectorAll('[data-cms-ctl]').forEach(e => e.remove());
    c.querySelectorAll('[contenteditable]').forEach(e => e.removeAttribute('contenteditable'));
    c.querySelectorAll('.cms-hover,.cms-active').forEach(e => { e.classList.remove('cms-hover'); e.classList.remove('cms-active'); });
    return c.innerHTML;
  }
  function savePane(pane) {
    const key = CMS.key(pane);
    const after = paneClean(pane);
    const before = content.html[PAGE][key] !== undefined ? content.html[PAGE][key] : (pane._cmsBase !== undefined ? pane._cmsBase : after);
    if (after === before) return;
    content.html[PAGE][key] = after;
    pushRecord('html', key, before, after);
    markDirty();
  }
  function saveContext(node) {
    const pane = node.closest && node.closest('.w-tab-pane');
    if (pane) { savePane(pane); return true; }
    return false;
  }

  async function api(path, opts) {
    const r = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts));
    return r.json().catch(() => ({}));
  }
  async function save() {
    if (saving) { scheduleSave(); return; }
    if (!dirty) { setStatus('ok'); return; }
    saving = true; setStatus('saving');
    const res = await api('/api/content', { method: 'PUT', body: payload() });
    saving = false;
    if (res.ok) { dirty = false; setStatus('ok'); }
    else { setStatus('pending'); scheduleSave(); }
  }
  async function flush() { clearTimeout(saveT); if (dirty && !saving) await save(); }

  // ---------- undo / redo ----------
  const undoStack = [], redoStack = [];
  function pushRecord(type, key, before, after) {
    if (before === after) return;
    undoStack.push({ type, key, before, after });
    if (undoStack.length > 120) undoStack.shift();
    redoStack.length = 0;
    updateHistUI();
  }
  function applyState(type, key, value) {
    const el = CMS.elByKey(key);
    if (type === 'html') { if (value == null) delete content.html[PAGE][key]; else content.html[PAGE][key] = value; if (el && value != null) el.innerHTML = value; decorateMenus(); }
    else if (type === 'texts') { if (value == null) delete content.texts[PAGE][key]; else content.texts[PAGE][key] = value; if (el && value != null) el.innerHTML = value; }
    else if (type === 'images') { content.images[PAGE][key] = value; if (el) { el.src = value; el.removeAttribute('srcset'); el.removeAttribute('sizes'); } }
    else if (type === 'bg') { content.bg[PAGE][key] = value; if (el) el.style.backgroundImage = 'url("' + value + '")'; }
    else if (type === 'order') { content.order[PAGE].__tabs__ = value; liveReorderTabs(value); }
  }
  function undo() { const r = undoStack.pop(); if (!r) return; applyState(r.type, r.key, r.before); redoStack.push(r); markDirty(); updateHistUI(); toast('Afturkallað'); }
  function redo() { const r = redoStack.pop(); if (!r) return; applyState(r.type, r.key, r.after); undoStack.push(r); markDirty(); updateHistUI(); toast('Endurtekið'); }
  function updateHistUI() { const u = $('#cms-undo'), rd = $('#cms-redo'); if (u) u.disabled = !undoStack.length; if (rd) rd.disabled = !redoStack.length; }
  function liveReorderTabs(order) {
    const menu = $('.w-tab-menu'), cont = $('.w-tab-content'); if (!menu || !cont) return;
    order.forEach(v => { const p = menu.querySelector(`[data-w-tab="${CSS.escape(v)}"]`); const pa = cont.querySelector(`[data-w-tab="${CSS.escape(v)}"]`); if (p) menu.appendChild(p); if (pa) cont.appendChild(pa); });
  }
  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey; if (!mod) return;
    const k = (e.key || '').toLowerCase();
    if (k === 'z') {
      if (activeEl && document.activeElement === activeEl) return; // let the browser undo typing inside the field you're editing
      e.preventDefault(); if (e.shiftKey) redo(); else undo();
    } else if (k === 'y') { e.preventDefault(); redo(); }
  });
  function toast(msg) {
    const t = el('div', 'cms-toast', msg); document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
  }

  // ---------- toolbar ----------
  function buildToolbar() {
    document.body.classList.add('cms-on');
    const bar = el('div', 'cms-bar');
    bar.appendChild(el('div', 'cms-brand', 'RÁÐAGERÐI <span>CMS</span>'));
    bar.appendChild(el('div', 'cms-spacer'));
    const undoBtn = btn('↶ Afturkalla', 'cms-hist cms-undo', undo); undoBtn.id = 'cms-undo'; undoBtn.title = 'Afturkalla síðustu breytingu (⌘Z)'; undoBtn.disabled = true; bar.appendChild(undoBtn);
    const redoBtn = btn('↷ Endurtaka', 'cms-hist cms-redo', redo); redoBtn.id = 'cms-redo'; redoBtn.title = 'Endurtaka (⇧⌘Z)'; redoBtn.disabled = true; bar.appendChild(redoBtn);
    const status = el('div', 'cms-status ok', 'Allt vistað ✓'); status.id = 'cms-status'; status.title = 'Breytingar vistast sjálfkrafa'; bar.appendChild(status);
    const kebab = btn('⋯', 'cms-kebab', (e) => { e.stopPropagation(); toggleKebab(kebab); }); kebab.title = 'Meira';
    bar.appendChild(kebab);
    document.body.appendChild(bar);
    const help = el('div', 'cms-help', 'Smelltu á texta eða mynd til að breyta · smelltu á hlekk til að fara þangað (tvísmelltu til að breyta hann)');
    document.body.appendChild(help);
    setTimeout(() => help.classList.add('fade'), 5000);
  }
  function toggleKebab(anchor) {
    const existing = document.querySelector('.cms-kebab-menu');
    if (existing) { existing.remove(); return; }
    const m = el('div', 'cms-kebab-menu');
    const add = (label, fn) => { const b = el('button', 'cms-kebab-item', label); b.type = 'button'; b.onclick = () => { m.remove(); fn(); }; m.appendChild(b); };
    add('🎁 Gjafabréf', openGiftcards);
    add('Matseðlar / flipar', openMenus);
    add('Opna skanna (/skann)', () => window.open('/skann', '_blank'));
    add('Breyta lykilorði', openSettings);
    add('Skoða vef (án ritils)', () => confirmLeave(() => location.href = location.pathname));
    add('Útskrá', async () => { await flush(); await api('/api/logout', { method: 'POST' }); location.href = '/admin'; });
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    m.style.top = (r.bottom + 6) + 'px';
    m.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
    setTimeout(() => document.addEventListener('click', function h() { m.remove(); document.removeEventListener('click', h); }, { once: true }), 0);
  }
  function labeled(lbl, node) { const w = el('label', 'cms-field'); w.appendChild(el('span', null, lbl)); w.appendChild(node); return w; }
  function btn(label, cls, fn) { const b = el('button', 'cms-btn ' + (cls || ''), label); b.type = 'button'; b.onclick = fn; return b; }
  async function confirmLeave(go) { await flush(); go(); }

  // ---------- text editing + navigation ----------
  // Click a link/button → go to that page (staying in edit mode). Double-click any text → edit it.
  // Plain (non-link) text → single click edits. Images → single click replaces.
  function linkKind(a) {
    if (a.classList.contains('w-tab-link')) return 'tab';       // switches menu tab (let Webflow)
    const h = a.getAttribute('href') || '';
    if (h === '' || h === '#' || h.charAt(0) === '#') return 'inpage'; // hamburger / lightbox (let JS)
    return 'nav';
  }
  function withCms(href) {
    const hi = href.indexOf('#'); const hash = hi >= 0 ? href.slice(hi) : ''; let path = hi >= 0 ? href.slice(0, hi) : href;
    path += (path.indexOf('?') >= 0 ? '&' : '?') + 'cms=1';
    return path + hash;
  }
  function navigate(a) {
    const href = a.getAttribute('href');
    if (/^https?:\/\//i.test(href)) { window.open(href, '_blank'); return; } // external → new tab, keep editor
    flush().then(() => { location.href = withCms(href); });
  }
  let activeEl = null, activeOrig = '', navTimer = null;
  function enableText() {
    document.body.addEventListener('mouseover', (e) => {
      document.querySelectorAll('.cms-hover').forEach(x => x.classList.remove('cms-hover'));
      if (e.target.closest('.cms-bar') || e.target.closest('.cms-panel')) return;
      const leaf = closestLeaf(e.target);
      if (leaf && leaf !== activeEl) leaf.classList.add('cms-hover');
    });
    document.body.addEventListener('click', (e) => {
      if (e.target.closest('.cms-bar') || e.target.closest('.cms-panel') || e.target.closest('[data-cms-ctl]') || e.target.closest('.cms-imgbtn') || e.target.closest('.cms-kebab-menu')) return;
      if (e.target.closest('img')) return; // images: handled by their own capture handler / native
      const a = e.target.closest('a');
      if (a) {
        const kind = linkKind(a);
        if (kind === 'tab' || kind === 'inpage') return; // let the tab switch / hamburger happen
        e.preventDefault();
        clearTimeout(navTimer);
        navTimer = setTimeout(() => navigate(a), 200); // brief delay so a double-click edits instead of navigating
        return;
      }
      const leaf = closestLeaf(e.target);
      if (leaf) { startEdit(leaf); return; }
      const bg = closestBgEl(e.target);
      if (bg) pickImage(bg, true); // click a photo tile → replace it
    });
    document.body.addEventListener('dblclick', (e) => {
      if (e.target.closest('.cms-bar') || e.target.closest('.cms-panel') || e.target.closest('[data-cms-ctl]')) return;
      clearTimeout(navTimer);
      if (e.target.closest('img')) return;
      const leaf = closestLeaf(e.target);
      if (leaf) { e.preventDefault(); startEdit(leaf); }
    });
  }
  function closestLeaf(node) {
    let n = node;
    while (n && n !== document.body) {
      if (n.nodeType === 1 && !n.closest('.cms-bar') && !n.closest('.cms-panel') && !n.hasAttribute('data-cms-ctl') && CMS.isTextLeaf(n)) return n;
      n = n.parentElement;
    }
    return null;
  }
  function startEdit(leaf) {
    if (activeEl === leaf) return;
    finishEdit();
    activeEl = leaf; activeOrig = leaf.innerHTML;
    leaf.classList.add('cms-active'); leaf.classList.remove('cms-hover');
    leaf.setAttribute('contenteditable', 'true'); leaf.focus();
    leaf.addEventListener('blur', onBlur);
    leaf.addEventListener('keydown', onKey);
    document.getSelection().selectAllChildren(leaf);
  }
  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey && activeEl && activeEl.tagName !== 'DIV') { e.preventDefault(); activeEl.blur(); }
    if (e.key === 'Escape') { activeEl.innerHTML = activeOrig; activeEl.blur(); }
  }
  function onBlur() { finishEdit(); }
  function finishEdit() {
    if (!activeEl) return;
    const leaf = activeEl; activeEl = null;
    leaf.removeEventListener('blur', onBlur); leaf.removeEventListener('keydown', onKey);
    leaf.removeAttribute('contenteditable'); leaf.classList.remove('cms-active');
    const html = leaf.innerHTML;
    if (html !== activeOrig) {
      if (!saveContext(leaf)) { // non-menu text leaf → text override (pane text is recorded by savePane)
        const key = CMS.key(leaf);
        const before = content.texts[PAGE][key] !== undefined ? content.texts[PAGE][key] : activeOrig;
        content.texts[PAGE][key] = html;
        pushRecord('texts', key, before, html);
        markDirty();
      }
    }
  }

  // ---------- image editing ----------
  function isEditableImg(img) {
    if (!img || img.tagName !== 'IMG') return false;
    if (img.closest('.cms-bar') || img.closest('.cms-panel') || img.closest('.cms-toast')) return false;
    // real content photos only — excludes small icons/logos/burger so links & menu buttons stay clickable
    return img.offsetWidth >= 48 && img.offsetHeight >= 48;
  }
  // an element whose CSS background-image is a real photo (e.g. the home gallery tiles)
  function closestBgEl(node) {
    let n = node;
    while (n && n !== document.body) {
      if (n.nodeType === 1 && n.tagName !== 'IMG' && !n.closest('.cms-bar') && !n.closest('.cms-panel') && !n.hasAttribute('data-cms-ctl')) {
        const b = getComputedStyle(n).backgroundImage;
        if (b && b.includes('assets/') && /\.(jpe?g|png|webp|gif)/i.test(b) && n.offsetWidth >= 40 && n.offsetHeight >= 40) return n;
      }
      n = n.parentElement;
    }
    return null;
  }
  function enableImages() {
    // mark editable <img> now, on load, and as each lazy image finishes loading
    const mark = () => document.querySelectorAll('img').forEach(img => { if (isEditableImg(img)) img.classList.add('cms-img'); });
    mark(); window.addEventListener('load', mark);
    document.querySelectorAll('img').forEach(im => im.addEventListener('load', () => { if (isEditableImg(im)) im.classList.add('cms-img'); }));

    let btnEl = null, curTarget = null, hideT = null;
    const clearBtn = () => { if (btnEl) { btnEl.remove(); btnEl = null; curTarget = null; } };
    function showBtn(target, isBg) {
      clearTimeout(hideT);
      if (curTarget === target && btnEl) return;
      clearBtn(); curTarget = target;
      btnEl = el('button', 'cms-imgbtn', '🖼 Skipta um mynd'); btnEl.type = 'button';
      const r = target.getBoundingClientRect();
      btnEl.style.top = (r.top + window.scrollY + 8) + 'px';
      btnEl.style.left = (r.left + window.scrollX + 8) + 'px';
      btnEl.onmousedown = (ev) => { ev.preventDefault(); ev.stopPropagation(); pickImage(target, isBg); };
      btnEl.onmouseenter = () => clearTimeout(hideT);
      btnEl.onmouseleave = () => { hideT = setTimeout(clearBtn, 150); };
      document.body.appendChild(btnEl);
    }
    document.body.addEventListener('mouseover', (e) => {
      const img = e.target.closest('img');
      if (img && isEditableImg(img)) { img.classList.add('cms-img'); showBtn(img, false); return; }
      const bg = closestBgEl(e.target);
      if (bg) { bg.classList.add('cms-bgimg'); showBtn(bg, true); }
    });
    document.body.addEventListener('mouseout', (e) => {
      const to = e.relatedTarget;
      if (!btnEl) return;
      if (to && (to === btnEl || to === curTarget)) return;
      hideT = setTimeout(clearBtn, 150);
    });
    // clicking directly on an <img> also replaces it (bg elements use the hover button so text stays editable)
    document.addEventListener('click', (e) => {
      const img = e.target.closest('img');
      if (img && isEditableImg(img)) { e.preventDefault(); e.stopPropagation(); pickImage(img, false); }
    }, true);
  }
  function pickImage(target, isBg) {
    const inp = el('input'); inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      if (f.size > 8 * 1024 * 1024) { toast('Myndin er of stór (hámark 8MB)'); return; }
      const data = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
      toast('Hleð upp mynd…');
      const res = await api('/api/upload', { method: 'POST', body: JSON.stringify({ name: f.name, data }) });
      if (res.ok) {
        if (isBg) {
          const before = (getComputedStyle(target).backgroundImage.match(/url\(["']?([^"')]+)/) || [])[1] || '';
          target.style.backgroundImage = 'url("' + res.url + '")';
          if (!saveContext(target)) {
            const key = CMS.key(target), b = content.bg[PAGE][key] !== undefined ? content.bg[PAGE][key] : before;
            content.bg[PAGE][key] = res.url; pushRecord('bg', key, b, res.url); markDirty();
          }
        } else {
          const before = target.getAttribute('src') || target.src || '';
          target.src = res.url; target.removeAttribute('srcset'); target.removeAttribute('sizes');
          if (!saveContext(target)) {
            const key = CMS.key(target), b = content.images[PAGE][key] !== undefined ? content.images[PAGE][key] : before;
            content.images[PAGE][key] = res.url; pushRecord('images', key, b, res.url); markDirty();
          }
        }
        toast('Mynd uppfærð');
      } else toast('Villa: ' + (res.error || ''));
    };
    inp.click();
  }

  // ---------- menu item / category controls ----------
  const PLACEHOLDER_ITEM = 'div-meal';
  function decorateMenus() {
    CMS.panes().forEach(pane => {
      if (pane._cmsBase === undefined) pane._cmsBase = paneClean(pane); // baseline for undo
      pane.querySelectorAll('.w-dyn-items').forEach(list => {
        list.querySelectorAll(':scope > .w-dyn-item').forEach(item => addItemCtls(item, list, pane));
        // "add item" button (sibling right after the list; guard against duplicates on re-decorate)
        if (!(list.nextElementSibling && list.nextElementSibling.hasAttribute && list.nextElementSibling.hasAttribute('data-cms-add'))) {
          const add = el('button', 'cms-add', '＋ Bæta við rétti'); add.type = 'button'; add.setAttribute('data-cms-ctl', '1'); add.setAttribute('data-cms-add', '1');
          add.onclick = () => addItem(list, pane);
          list.after(add);
        }
      });
    });
  }
  function addItemCtls(item, list, pane) {
    if (item.querySelector(':scope > [data-cms-item-ctl]')) return;
    item.style.position = item.style.position || 'relative';
    const bar = el('div', 'cms-itemctl'); bar.setAttribute('data-cms-ctl', '1'); bar.setAttribute('data-cms-item-ctl', '1');
    // clear, obvious green drag handle — smooth pointer-based dragging (no fiddly HTML5 drag)
    const grip = el('button', 'cms-grip', '⠿ Draga'); grip.type = 'button'; grip.title = 'Haltu inni og dragðu til að færa réttinn'; grip.setAttribute('data-cms-ctl', '1');
    grip.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); startItemDrag(item, list, pane); });
    bar.appendChild(grip);
    bar.appendChild(mini('⎘', 'Afrita', () => { const c = item.cloneNode(true); c.querySelectorAll('[data-cms-ctl]').forEach(e => e.remove()); item.after(c); addItemCtls(c, list, pane); savePane(pane); }));
    bar.appendChild(mini('%', 'Afsláttur', () => discount(item, pane)));
    bar.appendChild(mini('🗑', 'Eyða', () => { if (confirm('Eyða þessum rétti?')) { item.remove(); savePane(pane); } }));
    item.appendChild(bar);
    // keep the bar reachable, but only ONE bar visible at a time
    let hideT;
    const show = () => {
      clearTimeout(hideT);
      document.querySelectorAll('.cms-itemctl.cms-show').forEach(b => { if (b !== bar) b.classList.remove('cms-show'); });
      bar.classList.add('cms-show');
    };
    const hideSoon = () => { clearTimeout(hideT); hideT = setTimeout(() => bar.classList.remove('cms-show'), 300); };
    item.addEventListener('mouseenter', show); item.addEventListener('mouseleave', hideSoon);
    bar.addEventListener('mouseenter', show); bar.addEventListener('mouseleave', hideSoon);
  }
  function startItemDrag(item, list, pane) {
    document.body.classList.add('cms-dragging-active');
    item.classList.add('cms-dragging');
    const onMove = (ev) => {
      const after = dragAfter(list, ev.clientY);
      if (after == null) { if (list.lastElementChild !== item) list.appendChild(item); }
      else if (after !== item) list.insertBefore(item, after);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.classList.remove('cms-dragging-active');
      item.classList.remove('cms-dragging');
      savePane(pane);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }
  function dragAfter(list, y) {
    const items = [...list.querySelectorAll(':scope > .w-dyn-item:not(.cms-dragging)')];
    let closest = null, closestOffset = -Infinity;
    for (const it of items) {
      const box = it.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closestOffset) { closestOffset = offset; closest = it; }
    }
    return closest;
  }
  function mini(txt, title, fn) { const b = el('button', 'cms-mini', txt); b.type = 'button'; b.title = title; b.setAttribute('data-cms-ctl', '1'); b.onclick = (e) => { e.stopPropagation(); fn(); }; return b; }
  function addItem(list, pane) {
    const last = list.querySelector(':scope > .w-dyn-item:last-of-type');
    let item;
    if (last) { item = last.cloneNode(true); item.querySelectorAll('[data-cms-ctl]').forEach(e => e.remove()); }
    else { item = el('div', 'w-dyn-item', '<div class="div-meal"><div class="h3">Nýr réttur</div><div class="h4">Lýsing á réttinum</div></div>'); item.setAttribute('role', 'listitem'); }
    // clear texts to placeholders
    const h3 = item.querySelector('.h3'); if (h3) h3.textContent = 'Nýr réttur';
    const h4 = item.querySelector('.h4'); if (h4) h4.textContent = 'Lýsing á réttinum';
    list.appendChild(item);
    addItemCtls(item, list, pane);
    savePane(pane);
    const h = item.querySelector('.h3'); if (h) startEdit(h);
  }
  function discount(item, pane) {
    const priceEl = item.querySelector('[class*=price]:not(.strike)') || item.querySelector('[class*=price]');
    const cur = priceEl ? priceEl.textContent.trim() : '';
    const panel = makePanel('Afsláttur', 'Fulla verðið birtist yfirstrikað og tilboðsverðið við hliðina — eins og á vefnum.');
    const o = field('Fullt verð (yfirstrikað)'); o.input.value = cur;
    const n = field('Tilboðsverð'); n.input.placeholder = 't.d. 2990 kr.';
    panel.body.append(o.wrap, n.wrap);
    panel.foot.appendChild(btn('Fjarlægja afslátt', '', () => {
      if (priceEl) priceEl.textContent = o.input.value.trim() || cur;
      savePane(pane); closePanel(panel); toast('Afsláttur fjarlægður');
    }));
    panel.foot.appendChild(btn('Setja afslátt', 'cms-primary', () => {
      const oldp = o.input.value.trim(), nw = n.input.value.trim();
      if (!nw) { toast('Sláðu inn tilboðsverð'); return; }
      const html = `<span style="text-decoration:line-through;opacity:.5;margin-right:.45em">${esc(oldp)}</span><span>${esc(nw)}</span>`;
      if (priceEl) priceEl.innerHTML = html;
      else { const meal = item.querySelector('.div-meal, .div-meal-price-2, .div-block-31') || item; meal.appendChild(el('div', 'menu-price-single', html)); }
      savePane(pane); closePanel(panel); toast('Afsláttur settur');
    }));
  }
  function esc(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

  // ---------- tabs (menus) panel ----------
  function tabInfo() {
    const menu = $('.w-tab-menu'); if (!menu) return [];
    return [...menu.querySelectorAll('.w-tab-link')].map(pill => ({
      pill, v: pill.getAttribute('data-w-tab'),
      label: (pill.textContent || '').trim(),
      pane: $(`.w-tab-content [data-w-tab="${CSS.escape(pill.getAttribute('data-w-tab'))}"]`),
    }));
  }
  function openMenus() {
    const tabs = tabInfo();
    if (!tabs.length) { toast('Engir matseðils-flipar á þessari síðu. Opnaðu „Matseðill“ síðuna.'); return; }
    const panel = makePanel('Matseðlar / flipar', 'Dragðu til að endurraða. Fela flipa með því að taka hakið úr „Sýnilegt“.');
    const listWrap = el('div', 'cms-tablist');
    let rowDrag = null;
    tabs.forEach(t => {
      const row = el('div', 'cms-tabrow');
      row.dataset.v = t.v; row.setAttribute('draggable', 'true');
      row.appendChild(el('span', 'cms-drag', '⠿'));
      row.appendChild(el('span', 'cms-tablabel', t.label));
      const vis = el('label', 'cms-vis'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = getComputedStyle(t.pill).display !== 'none'; vis.appendChild(cb); vis.appendChild(el('span', null, 'Sýnilegt'));
      row._pill = t.pill; row._pane = t.pane; row._cb = cb;
      row.appendChild(vis);
      row.addEventListener('dragstart', () => { rowDrag = row; row.classList.add('cms-dragging'); });
      row.addEventListener('dragend', () => { row.classList.remove('cms-dragging'); rowDrag = null; });
      listWrap.appendChild(row);
    });
    listWrap.addEventListener('dragover', (e) => {
      if (!rowDrag) return; e.preventDefault();
      const rows = [...listWrap.querySelectorAll('.cms-tabrow:not(.cms-dragging)')];
      let after = null, co = -Infinity;
      for (const r of rows) { const b = r.getBoundingClientRect(); const off = e.clientY - b.top - b.height / 2; if (off < 0 && off > co) { co = off; after = r; } }
      if (after == null) listWrap.appendChild(rowDrag); else listWrap.insertBefore(rowDrag, after);
    });
    panel.body.appendChild(listWrap);
    const applyBtn = btn('Nota', 'cms-primary', () => {
      const beforeOrder = (content.order[PAGE].__tabs__ || tabs.map(t => t.v)).slice();
      const order = [...listWrap.children].map(r => r.dataset.v);
      content.order[PAGE].__tabs__ = order;
      liveReorderTabs(order);
      // visibility
      [...listWrap.children].forEach(r => {
        const show = r._cb.checked;
        [r._pill, r._pane].forEach(node => { if (!node) return; const k = CMS.key(node); if (show) { node.style.display = ''; delete content.hidden[PAGE][k]; } else { node.style.display = 'none'; content.hidden[PAGE][k] = true; } });
      });
      if (JSON.stringify(beforeOrder) !== JSON.stringify(order)) pushRecord('order', '__tabs__', beforeOrder, order);
      markDirty(); closePanel(panel); toast('Uppfært');
    });
    panel.foot.appendChild(applyBtn);
  }
  function btnMini(txt, fn) { const b = el('button', 'cms-mini dark', txt); b.type = 'button'; b.onclick = fn; return b; }

  // ---------- gift cards ----------
  const kr = n => new Intl.NumberFormat('is-IS').format(n) + ' kr.';
  async function openGiftcards() {
    const panel = makePanel('Gjafabréf', 'Búðu til gjafabréf og sendu viðskiptavininum hlekkinn. Starfsfólk skannar QR-kóðann á /skann og dregur af inneigninni.');
    const n = field('Nafn viðskiptavinar');
    const ph = field('Símanúmer'); ph.input.inputMode = 'tel';
    const am = field('Inneign (kr.)'); am.input.type = 'number'; am.input.inputMode = 'numeric';
    const createBtn = btn('＋ Búa til gjafabréf', 'cms-primary', doCreate);
    createBtn.style.width = '100%';
    const urlBox = el('div', 'cms-gcurl'); urlBox.hidden = true;
    const listWrap = el('div', 'cms-gclist');
    panel.body.append(n.wrap, ph.wrap, am.wrap, createBtn, urlBox, el('div', 'cms-gcsep', 'Útgefin gjafabréf'), listWrap);

    async function doCreate() {
      const res = await api('/api/giftcards', { method: 'POST', body: JSON.stringify({ name: n.input.value, phone: ph.input.value, amount: Number(am.input.value) }) });
      if (!res.ok) { toast('Villa: ' + (res.error || '')); return; }
      const full = location.origin + res.url;
      urlBox.hidden = false;
      urlBox.innerHTML = '';
      urlBox.appendChild(el('div', 'cms-gcurl-t', '✓ Gjafabréf búið til — sendu viðskiptavininum þennan hlekk:'));
      const line = el('div', 'cms-gcurl-line');
      const inp = el('input'); inp.value = full; inp.readOnly = true; inp.onclick = () => inp.select();
      const cp = btn('Afrita', 'cms-primary', async () => { try { await navigator.clipboard.writeText(full); toast('Hlekkur afritaður'); } catch (e) { inp.select(); document.execCommand('copy'); toast('Hlekkur afritaður'); } });
      line.append(inp, cp); urlBox.appendChild(line);
      n.input.value = ''; ph.input.value = ''; am.input.value = '';
      refresh();
    }
    async function refresh() {
      const r = await api('/api/giftcards');
      listWrap.innerHTML = '';
      const cards = (r.cards || []);
      if (!cards.length) { listWrap.appendChild(el('div', 'cms-gcempty', 'Engin gjafabréf ennþá.')); return; }
      cards.forEach(c => {
        const row = el('div', 'cms-gcrow');
        const info = el('div', 'cms-gcinfo');
        info.appendChild(el('div', 'cms-gcname', c.name + (c.phone ? ' · ' + c.phone : '')));
        info.appendChild(el('div', 'cms-gcbal', kr(c.balance)));
        row.appendChild(info);
        const full = location.origin + '/gjafabref/' + c.id;
        row.appendChild(btnMini('⧉', async () => { try { await navigator.clipboard.writeText(full); toast('Hlekkur afritaður'); } catch (e) { } }));
        row.appendChild(btnMini('↗', () => window.open(full, '_blank')));
        row.appendChild(btnMini('🗑', async () => {
          if (!confirm('Eyða gjafabréfi ' + c.name + ' (' + kr(c.balance) + ')?')) return;
          await api('/api/giftcards/' + c.id, { method: 'DELETE' });
          toast('Gjafabréfi eytt'); refresh();
        }));
        listWrap.appendChild(row);
      });
    }
    refresh();
  }

  // ---------- settings ----------
  function openSettings() {
    const panel = makePanel('Stillingar', 'Breyttu lykilorði admin-svæðisins.');
    const cur = field('Núverandi lykilorð', 'password');
    const n1 = field('Nýtt lykilorð', 'password');
    const n2 = field('Endurtaktu nýtt lykilorð', 'password');
    panel.body.append(cur.wrap, n1.wrap, n2.wrap);
    panel.foot.appendChild(btn('Breyta lykilorði', 'cms-primary', async () => {
      if (n1.input.value !== n2.input.value) { toast('Lykilorðin passa ekki'); return; }
      const res = await api('/api/password', { method: 'POST', body: JSON.stringify({ current: cur.input.value, next: n1.input.value }) });
      if (res.ok) { toast('Lykilorði breytt'); closePanel(panel); } else toast('Villa: ' + (res.error || ''));
    }));
  }
  function field(label, type) { const wrap = el('label', 'cms-inputrow'); wrap.appendChild(el('span', null, label)); const input = el('input'); input.type = type || 'text'; wrap.appendChild(input); return { wrap, input }; }

  // ---------- panel shell ----------
  let openPanelEl = null;
  function makePanel(title, subtitle) {
    closeAnyPanel();
    const back = el('div', 'cms-backdrop'); back.onclick = (e) => { if (e.target === back) closePanel(p); };
    const p = el('div', 'cms-panel');
    p.appendChild(el('div', 'cms-panel-h', `<h3>${title}</h3>${subtitle ? `<p>${subtitle}</p>` : ''}<button class="cms-x" type="button">✕</button>`));
    const body = el('div', 'cms-panel-b'); const foot = el('div', 'cms-panel-f');
    p.appendChild(body); p.appendChild(foot); back.appendChild(p); document.body.appendChild(back);
    p.querySelector('.cms-x').onclick = () => closePanel(back);
    openPanelEl = back; p.body = body; p.foot = foot; p._back = back; return p;
  }
  function closePanel(p) { const b = p._back || p; if (b && b.remove) b.remove(); openPanelEl = null; }
  function closeAnyPanel() { if (openPanelEl) openPanelEl.remove(); openPanelEl = null; }

  // ---------- flush any pending change if the tab closes mid-edit ----------
  window.addEventListener('pagehide', () => { if (dirty) { try { fetch('/api/content', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: payload(), keepalive: true }); } catch (e) { } } });

  // ---------- init ----------
  function init() {
    buildToolbar();
    enableText();
    enableImages();
    decorateMenus();
    // re-decorate menus if tab content changes
    document.querySelectorAll('.w-tab-link').forEach(l => l.addEventListener('click', () => setTimeout(decorateMenus, 60)));
  }
  init();
})();
