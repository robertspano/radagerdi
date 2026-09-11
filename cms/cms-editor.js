/* Ráðagerði CMS — visual editor (loaded only in edit mode for logged-in users). */
(function () {
  'use strict';
  const CMS = window.__CMS__;
  const PAGE = CMS.PAGE;
  const content = CMS.content || {};
  ['texts', 'images', 'bg', 'html', 'hidden', 'order', 'style'].forEach(k => { content[k] = content[k] || {}; content[k][PAGE] = content[k][PAGE] || {}; });
  let dirty = false;

  const PAGES = [
    ['index.html', 'Forsíða'], ['matsedlar.html', 'Matseðill'], ['drykkir.html', 'Drykkir'], ['eftirrettir.html', 'Eftirréttir'], ['takeaway.html', 'Take Away'], ['brons.html', 'Bröns'],
    ['hopar.html', 'Hópar'], ['hoparhadegi.html', 'Hópar · Hádegi'], ['hoparbrons.html', 'Hópar · Bröns'], ['hoparkvold.html', 'Hópar · Kvöld'],
    ['veisluthjonusta.html', 'Veisluþjónusta'], ['myndir.html', 'Myndir'],
    ['en.html', 'EN · Home'], ['en-matsedlar.html', 'EN · Menu'], ['en-drykkir.html', 'EN · Drinks'], ['en-eftirrettir.html', 'EN · Desserts'], ['en-takeaway.html', 'EN · Take Away'], ['en-brons.html', 'EN · Brunch'],
    ['en-hopar.html', 'EN · Groups'], ['en-veisluthjonusta.html', 'EN · Catering'], ['en-myndir.html', 'EN · Gallery'],
    ['en-seltjarnarnes-iceland-travel-guide.html', 'EN · Travel guide'],
    ['matsedill.html', 'Gamli matseðillinn'], ['um-okkur.html', 'Um okkur'], ['hafa-samband.html', 'Hafa samband'],
  ];

  // ---------- helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  // ---------- auto-save ----------
  let saveT = null, saving = false;
  function setStatus(s, msg) {
    const b = $('#cms-status'); if (!b) return;
    b.className = 'cms-status ' + s;
    b.textContent = msg || (s === 'saving' ? 'Vistar…' : s === 'pending' ? 'Vista sjálfkrafa…' : s === 'error' ? 'Vistun mistókst' : 'Allt vistað ✓');
    b.title = msg || '';
  }
  function scheduleSave() { clearTimeout(saveT); saveT = setTimeout(save, 600); }
  function markDirty() { dirty = true; setStatus('pending'); scheduleSave(); }
  function setOverride(type, k, v) { content[type][PAGE][k] = v; markDirty(); }
  const payload = () => JSON.stringify({ texts: content.texts, images: content.images, bg: content.bg, html: content.html, hidden: content.hidden, order: content.order, style: content.style });

  function paneClean(pane) {
    const c = pane.cloneNode(true);
    c.querySelectorAll('[data-cms-ctl]').forEach(e => e.remove());
    c.querySelectorAll('[contenteditable]').forEach(e => e.removeAttribute('contenteditable'));
    c.querySelectorAll('.cms-hover,.cms-active,.cms-dragging,.cms-flash').forEach(e => { e.classList.remove('cms-hover'); e.classList.remove('cms-active'); e.classList.remove('cms-dragging'); e.classList.remove('cms-flash'); });
    c.querySelectorAll('[data-cms-item]').forEach(e => e.removeAttribute('data-cms-item'));
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
    const region = node.closest && node.closest(CMS.REGION_SEL || '.w-tab-pane');
    if (region) { savePane(region); return true; }
    return false;
  }

  async function api(path, opts) {
    const r = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts));
    const j = await r.json().catch(() => ({}));
    j.status = r.status;                     // svo köllunarstaðurinn geti greint 401 frá netbilun
    return j;
  }
  let warnedNotDurable = false;
  async function save() {
    if (saving) { scheduleSave(); return; }
    if (!dirty) { setStatus('ok'); return; }
    saving = true; setStatus('saving');
    let res;
    try {
      res = await api('/api/content', { method: 'PUT', body: payload() });
    } catch (e) {
      res = { status: 0 };                   // netbilun — reynum aftur
    } finally {
      saving = false;                        // annars festist vistun í „Vistar…“ að eilífu
    }
    if (res.status === 401) {                // útrunnin innskráning: endalausar tilraunir laga ekkert
      setStatus('error', 'Innskráning útrunnin — skráðu þig inn aftur');
      toast('Innskráningin er útrunnin. Opnaðu /admin og skráðu þig inn aftur — breytingarnar þínar bíða í þessum flipa.');
      return;
    }
    if (res.ok) {
      dirty = false;
      if (res.durable === false) {           // vistað staðbundið en lifir ekki endurræsingu af
        setStatus('error', 'Vistað — EN ekki varanlega (GitHub-tenging vantar)');
        if (!warnedNotDurable) {
          warnedNotDurable = true;
          toast('Breytingin er komin á vefinn en ekki varanlega geymd. Hafðu samband við Róbert — GH_TOKEN vantar á Render.');
        }
      } else {
        warnedNotDurable = false;
        setStatus('ok');
      }
      return;
    }
    setStatus('pending'); scheduleSave();
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
    if (type === 'html') { if (value == null) delete content.html[PAGE][key]; else content.html[PAGE][key] = value; if (el && value != null) el.innerHTML = value; decorateMenus(); decorateGalleries(); decorateGalleryStrips(); }
    else if (type === 'texts') { if (value == null) delete content.texts[PAGE][key]; else content.texts[PAGE][key] = value; if (el && value != null) el.innerHTML = value; }
    else if (type === 'images') { content.images[PAGE][key] = value; if (el) { el.src = value; el.removeAttribute('srcset'); el.removeAttribute('sizes'); } }
    else if (type === 'bg') { content.bg[PAGE][key] = value; if (el) el.style.backgroundImage = 'url("' + value + '")'; }
    else if (type === 'order') { content.order[PAGE].__tabs__ = value; liveReorderTabs(value); }
    else if (type === 'style') {
      const obj = JSON.parse(value || '{}');
      const old = content.style[PAGE][key] || {};
      if (el) Object.keys(old).forEach(p => el.style.removeProperty(p));
      if (Object.keys(obj).length) { content.style[PAGE][key] = obj; if (el) Object.keys(obj).forEach(p => el.style.setProperty(p, obj[p], 'important')); }
      else delete content.style[PAGE][key];
      if (styleTarget) positionStyleBar();
    }
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
    if (!/[?&]cms=1/.test(path)) path += (path.indexOf('?') >= 0 ? '&' : '?') + 'cms=1';
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
      if (e.target.closest('a')) return; // links/buttons: click just navigates — no edit outline (dblclick still edits)
      const leaf = closestLeaf(e.target);
      if (leaf && leaf !== activeEl) leaf.classList.add('cms-hover');
    });
    document.body.addEventListener('click', (e) => {
      if (e.target.closest('.cms-bar') || e.target.closest('.cms-panel') || e.target.closest('[data-cms-ctl]') || e.target.closest('.cms-imgbtn') || e.target.closest('.cms-kebab-menu')) return;
      const imgEl = e.target.closest('img');
      if (imgEl && isEditableImg(imgEl)) return; // editable photos: handled by the image capture handler
      // small icons/logos inside links fall through to the link logic below
      const a = e.target.closest('a');
      if (a) {
        const kind = linkKind(a);
        if (kind === 'tab' || kind === 'inpage') return; // let the tab switch / hamburger happen
        e.preventDefault();
        clearTimeout(navTimer);
        navTimer = setTimeout(() => navigate(a), 340); // delay so a double-click reliably edits instead of navigating
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
    showStyleBar(leaf);
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
  async function uploadImageFile(f) {
    if (!f || !/^image\//.test(f.type)) { toast('Þetta er ekki mynd'); return null; }
    const data = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
    toast('Hleð upp mynd…');
    const res = await api('/api/upload', { method: 'POST', body: JSON.stringify({ name: f.name, data }) });
    if (!res.ok) { toast('Villa: ' + (res.error || '')); return null; }
    return res.url;
  }
  function applyImage(target, isBg, url) {
    if (isBg) {
      const before = (getComputedStyle(target).backgroundImage.match(/url\(["']?([^"')]+)/) || [])[1] || '';
      target.style.backgroundImage = 'url("' + url + '")';
      if (!saveContext(target)) {
        const key = CMS.key(target), b = content.bg[PAGE][key] !== undefined ? content.bg[PAGE][key] : before;
        content.bg[PAGE][key] = url; pushRecord('bg', key, b, url); markDirty();
      }
    } else {
      const before = target.getAttribute('src') || target.src || '';
      target.src = url; target.removeAttribute('srcset'); target.removeAttribute('sizes');
      if (!saveContext(target)) {
        const key = CMS.key(target), b = content.images[PAGE][key] !== undefined ? content.images[PAGE][key] : before;
        content.images[PAGE][key] = url; pushRecord('images', key, b, url); markDirty();
      }
    }
    toast('Mynd uppfærð');
  }
  function pickImage(target, isBg) {
    const inp = el('input'); inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = async () => {
      const url = await uploadImageFile(inp.files[0]);
      if (url) applyImage(target, isBg, url);
    };
    inp.click();
  }

  // ---------- drag & drop: drop a photo on any image to replace it, or on a gallery to add it ----------
  document.addEventListener('dragover', (e) => {
    const img = e.target.closest && e.target.closest('img');
    const gal = e.target.closest && e.target.closest('.card.gal');
    if ((img && isEditableImg(img)) || gal) { e.preventDefault(); (gal || img).classList.add('cms-dropover'); }
  }, true);
  document.addEventListener('dragleave', (e) => { if (e.target && e.target.classList) e.target.classList.remove('cms-dropover'); }, true);
  document.addEventListener('drop', async (e) => {
    const img = e.target.closest && e.target.closest('img');
    const gal = e.target.closest && e.target.closest('.card.gal');
    if (!(img && isEditableImg(img)) && !gal) return;
    e.preventDefault(); e.stopPropagation();
    document.querySelectorAll('.cms-dropover').forEach(x => x.classList.remove('cms-dropover'));
    const files = [...((e.dataTransfer && e.dataTransfer.files) || [])].filter(f => /^image\//.test(f.type));
    if (!files.length) return;
    if (img && isEditableImg(img)) {
      const url = await uploadImageFile(files[0]); if (url) applyImage(img, false, url);
    } else if (gal) {
      for (const f of files) { const url = await uploadImageFile(f); if (url) addGalImage(gal, url); }
    }
  }, true);

  // ---------- photo galleries (.card.gal): drop zone + delete per image ----------
  function decorateGalleries() {
    document.querySelectorAll('.card.gal').forEach(gal => {
      const region = regionOf(gal);
      if (region._cmsBase === undefined) region._cmsBase = paneClean(region);
      let grid = gal.querySelector('.gal-grid');
      if (!grid) { grid = el('div', 'gal-grid'); gal.appendChild(grid); }
      grid.querySelectorAll('figure').forEach(fig => addGalDel(fig, region));
      if (!gal.querySelector(':scope > .cms-galdrop')) {
        const dz = el('div', 'cms-galdrop', '＋ Dragðu myndir hingað — eða smelltu til að velja');
        dz.setAttribute('data-cms-ctl', '1');
        dz.onclick = () => {
          const inp = el('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
          inp.onchange = async () => { for (const f of [...inp.files]) { const url = await uploadImageFile(f); if (url) addGalImage(gal, url); } };
          inp.click();
        };
        gal.appendChild(dz);
      }
    });
  }
  function addGalImage(gal, url) {
    const grid = gal.querySelector('.gal-grid'), region = regionOf(gal);
    const fig = el('figure', 'g', '<img src="' + url + '" alt="Ráðagerði" loading="lazy">');
    grid.appendChild(fig); addGalDel(fig, region); savePane(region); toast('Mynd bætt við');
  }
  function addGalDel(fig, region) {
    if (fig.querySelector('[data-cms-ctl]')) return;
    const d = el('button', 'cms-galdel', '🗑'); d.type = 'button'; d.title = 'Eyða mynd'; d.setAttribute('data-cms-ctl', '1');
    d.onclick = (e) => { e.stopPropagation(); if (confirm('Eyða þessari mynd?')) { fig.remove(); savePane(region); } };
    fig.appendChild(d);
  }


  // ================= ÚTLITSSTJÓRN (fljótandi stika við valið element) =================
  // Notandinn smellir á texta → lítil stika birtist: stærð, feitletrun, jöfnun, litur, bil.
  // Vistast í content.style[PAGE][key] sem CSS-eigindi og beitt aftur af cms-inject.js.
  let styleBar = null, styleTarget = null;

  function styleOf(key) { return content.style[PAGE][key] || (content.style[PAGE][key] = {}); }

  // Hvar á stíllinn heima?
  //   • Element INNI í svæði (réttur í matseðli, lína í korti): stíllinn er geymdur beint
  //     í html-i svæðisins. Þá fylgir hann réttinum þegar hann er færður — og hverfur með
  //     honum þegar honum er eytt. Annars sætu stílarnir eftir á stöðunúmeri og lentu á
  //     næsta rétti fyrir neðan.
  //   • Svæðið sjálft, eða element utan allra svæða: html-ið geymir bara innihaldið, ekki
  //     eigindi svæðisins sjálfs, þannig að stíllinn fer í style-geymsluna.
  function styleInHtml(el) {
    const r = el && el.closest && el.closest(CMS.REGION_SEL || '.w-tab-pane');
    return !!r && r !== el;
  }
  // Gildi sem ritillinn hefur þegar sett — hvort sem það liggur beint á elementinu eða í geymslunni.
  function savedProp(el, prop) {
    const inline = el.style.getPropertyValue(prop);
    if (inline) return inline;
    return (content.style[PAGE][CMS.key(el)] || {})[prop] || '';
  }

  function setStyleProp(target, prop, value) {
    if (styleInHtml(target)) {
      if (value === null || value === '') target.style.removeProperty(prop);
      else target.style.setProperty(prop, value, 'important');
      saveContext(target);                  // endurvistar svæðið svo stíllinn fylgi með
      markDirty();
      positionStyleBar();
      return;
    }
    const key = CMS.key(target);
    const s = styleOf(key);
    const before = JSON.stringify(s);
    if (value === null || value === '') { delete s[prop]; target.style.removeProperty(prop); }
    else { s[prop] = value; target.style.setProperty(prop, value, 'important'); }
    if (!Object.keys(s).length) delete content.style[PAGE][key];
    pushRecord('style', key, before, JSON.stringify(content.style[PAGE][key] || {}));
    markDirty();
    positionStyleBar();
  }

  // Leturstærð er vistuð sem clamp() svo hún haldist í hlutfalli á síma
  function currentFontPx(el) {
    const saved = savedProp(el, 'font-size');
    if (saved) { const m = saved.match(/([\d.]+)px\)?$/); if (m) return Math.round(parseFloat(m[1])); }
    return Math.round(parseFloat(getComputedStyle(el).fontSize));
  }
  function setFontPx(el, px) {
    px = Math.max(10, Math.min(200, px));
    // upprunalega stærðin (áður en ritillinn snerti hana) — svo stækkun minnki aldrei textann
    if (el._cmsBaseFont === undefined) {
      const saved = savedProp(el, 'font-size');
      el._cmsBaseFont = saved ? null : Math.round(parseFloat(getComputedStyle(el).fontSize));
    }
    const base = el._cmsBaseFont;
    if (px <= (base || px)) {
      setStyleProp(el, 'font-size', px + 'px');             // minnkun: föst stærð, fyrirsjáanleg
    } else {
      const min = Math.max(10, Math.min(px, base));         // aldrei minni en upphafleg stærð
      const vw = (px / 12).toFixed(2);        // nær valinni stærð á skjám ≥1200px
      setStyleProp(el, 'font-size', 'clamp(' + min + 'px, ' + vw + 'vw, ' + px + 'px)');
    }
  }

  function sBtn(label, title, fn, cls) {
    const b = el('button', 'cms-sb' + (cls ? ' ' + cls : ''), label);
    b.type = 'button'; b.title = title; b.setAttribute('data-cms-ctl', '1');
    b.addEventListener('mousedown', (e) => e.preventDefault());   // ekki tapa fókus úr textanum
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); fn(); });
    return b;
  }

  function buildStyleBar() {
    const bar = el('div', 'cms-stylebar');
    bar.setAttribute('data-cms-ctl', '1');
    bar.addEventListener('mousedown', (e) => e.stopPropagation());

    bar.appendChild(sBtn('A−', 'Minnka letur', () => { if (styleTarget) setFontPx(styleTarget, currentFontPx(styleTarget) - 2); }));
    const size = el('span', 'cms-sbsize', '');
    bar.appendChild(size);
    bar.appendChild(sBtn('A+', 'Stækka letur', () => { if (styleTarget) setFontPx(styleTarget, currentFontPx(styleTarget) + 2); }));
    bar.appendChild(el('span', 'cms-sbsep'));

    bar.appendChild(sBtn('B', 'Feitletra', () => {
      if (!styleTarget) return;
      const on = savedProp(styleTarget, 'font-weight') === '700'
              || parseInt(getComputedStyle(styleTarget).fontWeight, 10) >= 700;
      setStyleProp(styleTarget, 'font-weight', on ? '400' : '700');
    }, 'cms-sbbold'));
    bar.appendChild(el('span', 'cms-sbsep'));

    [['⇤', 'left', 'Vinstri'], ['↔', 'center', 'Miðja'], ['⇥', 'right', 'Hægri']].forEach(([lab, val, t]) => {
      bar.appendChild(sBtn(lab, t, () => { if (styleTarget) setStyleProp(styleTarget, 'text-align', val); }));
    });
    bar.appendChild(el('span', 'cms-sbsep'));

    // Bil fyrir ofan/neðan — kemur í stað frjáls drags og heldur útlitinu heilu
    bar.appendChild(sBtn('↑', 'Færa upp (minna bil fyrir ofan)', () => { if (styleTarget) nudge(styleTarget, -8); }));
    bar.appendChild(sBtn('↓', 'Færa niður (meira bil fyrir ofan)', () => { if (styleTarget) nudge(styleTarget, 8); }));
    bar.appendChild(el('span', 'cms-sbsep'));

    const colors = [['#1B7C38', 'Grænn'], ['#F0392F', 'Rauður'], ['#1a1b1f', 'Svartur'], ['#ffffff', 'Hvítur']];
    colors.forEach(([c, t]) => {
      const b = sBtn('', 'Litur: ' + t, () => { if (styleTarget) setStyleProp(styleTarget, 'color', c); }, 'cms-sbcol');
      b.style.background = c;
      bar.appendChild(b);
    });
    bar.appendChild(el('span', 'cms-sbsep'));
    bar.appendChild(sBtn('↺', 'Núllstilla útlit', () => {
      if (!styleTarget) return;
      if (styleInHtml(styleTarget)) {
        styleTarget.removeAttribute('style');   // stíllinn liggur í html-i svæðisins
        delete styleTarget._cmsBaseFont;
        saveContext(styleTarget);               // endurvistað án stílanna, annars kæmu þeir aftur
        markDirty(); positionStyleBar();
        toast('Útlit núllstillt');
        return;
      }
      const key = CMS.key(styleTarget), before = JSON.stringify(content.style[PAGE][key] || {});
      Object.keys(content.style[PAGE][key] || {}).forEach(p => styleTarget.style.removeProperty(p));
      delete content.style[PAGE][key];
      delete styleTarget._cmsBaseFont;
      pushRecord('style', key, before, '{}'); markDirty(); positionStyleBar();
    }, 'cms-sbreset'));

    bar._size = size;
    document.body.appendChild(bar);
    return bar;
  }

  function nudge(target, dy) {
    const cur = parseFloat(savedProp(target, 'margin-top') || getComputedStyle(target).marginTop) || 0;
    setStyleProp(target, 'margin-top', Math.round(cur + dy) + 'px');
  }

  function positionStyleBar() {
    if (!styleBar || !styleTarget) return;
    const r = styleTarget.getBoundingClientRect();
    styleBar._size.textContent = currentFontPx(styleTarget) + 'px';
    const bw = styleBar.offsetWidth || 420;
    let left = r.left + r.width / 2 - bw / 2;
    left = Math.max(10, Math.min(window.innerWidth - bw - 10, left));
    let top = r.top - styleBar.offsetHeight - 12;
    if (top < 64) top = r.bottom + 12;              // undir ef ekki pláss fyrir ofan
    styleBar.style.left = Math.round(left) + 'px';
    styleBar.style.top = Math.round(top) + 'px';
  }

  function showStyleBar(target) {
    if (!styleBar) styleBar = buildStyleBar();
    styleTarget = target;
    styleBar.classList.add('show');
    positionStyleBar();
  }
  function hideStyleBar() {
    if (styleBar) styleBar.classList.remove('show');
    styleTarget = null;
  }
  document.addEventListener('mousedown', (e) => {
    if (!styleTarget) return;
    if (e.target.closest && (e.target.closest('.cms-stylebar') || e.target === styleTarget || styleTarget.contains(e.target))) return;
    hideStyleBar();
  }, true);
  // smellur á auða svæðið í kassa velur kassann sjálfan (texti hefur forgang)
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('.cms-bar') || t.closest('.cms-panel') || t.closest('.cms-stylebar') || t.closest('.cms-boxhandle') || t.closest('[data-cms-ctl]')) return;
    if (t.closest('a') || t.tagName === 'IMG') return;
    if (closestLeaf(t)) { deselectBox(); return; }        // texti valinn — ekki kassi
    const box = t.closest(BOX_SEL);
    if (box) { e.preventDefault(); e.stopPropagation(); hideStyleBar(); selectBox(box); }
    else deselectBox();
  }, true);
  window.addEventListener('scroll', () => { if (styleTarget) positionStyleBar(); }, true);
  window.addEventListener('resize', () => { if (styleTarget) positionStyleBar(); });


  // ================= KASSASTJÓRN (draga kassa saman / út) =================
  // Smellur á auða svæðið í kassa velur hann: rammi + handfang neðst sem má draga
  // til að gera hann þynnri eða þykkari. Vistast sem padding í 'style'.
  const BOX_SEL = '.ta-hero, .hg-hero, .gbox-top, .gbox-bot, .card, .hh, .lunch, .ginfo, .gbox2, .redbox, .rg-gallery, .shortcuts, .introp, .mcols';
  let boxSel = null, boxBar = null, boxHandle = null;

  function padOf(el, side) {
    const saved = savedProp(el, 'padding-' + side);
    return Math.round(parseFloat(saved || getComputedStyle(el)['padding' + side[0].toUpperCase() + side.slice(1)]) || 0);
  }
  function setPad(el, top, bottom) {
    top = Math.max(0, Math.round(top)); bottom = Math.max(0, Math.round(bottom));
    el.style.setProperty('padding-top', top + 'px', 'important');
    el.style.setProperty('padding-bottom', bottom + 'px', 'important');
    if (styleInHtml(el)) { saveContext(el); markDirty(); positionBoxUI(); return; }
    const key = CMS.key(el), s = styleOf(key);
    const before = JSON.stringify(s);
    s['padding-top'] = top + 'px'; s['padding-bottom'] = bottom + 'px';
    pushRecord('style', key, before, JSON.stringify(s));
    markDirty(); positionBoxUI();
  }
  function thinner(el, step) {
    const t = padOf(el, 'top'), b = padOf(el, 'bottom');
    const half = step / 2;
    setPad(el, t + half, b + half);
  }

  function buildBoxBar() {
    const bar = el('div', 'cms-stylebar cms-boxbar');
    bar.setAttribute('data-cms-ctl', '1');
    bar.addEventListener('mousedown', (e) => e.stopPropagation());
    bar.appendChild(el('span', 'cms-sblabel', 'Kassi'));
    bar.appendChild(el('span', 'cms-sbsep'));
    bar.appendChild(sBtn('↕−', 'Þynnri kassi', () => { if (boxSel) thinner(boxSel, -16); }));
    const h = el('span', 'cms-sbsize', ''); bar.appendChild(h);
    bar.appendChild(sBtn('↕+', 'Þykkari kassi', () => { if (boxSel) thinner(boxSel, 16); }));
    bar.appendChild(el('span', 'cms-sbsep'));
    bar.appendChild(sBtn('⌶', 'Miðja efnið lóðrétt', () => {
      if (!boxSel) return;
      const t = padOf(boxSel, 'top'), b = padOf(boxSel, 'bottom'), mid = Math.round((t + b) / 2);
      setPad(boxSel, mid, mid);                       // jafnt bil fyrir ofan og neðan = lóðrétt miðjað
    }));
    bar.appendChild(sBtn('⬌', 'Miðja efnið lárétt', () => {
      if (!boxSel) return;
      setStyleProp(boxSel, 'text-align', 'center');
      setStyleProp(boxSel, 'margin-left', 'auto');
      setStyleProp(boxSel, 'margin-right', 'auto');
    }));
    bar.appendChild(el('span', 'cms-sbsep'));
    bar.appendChild(sBtn('↺', 'Núllstilla kassa', () => {
      if (!boxSel) return;
      const props = ['padding-top', 'padding-bottom', 'text-align', 'margin-left', 'margin-right'];
      if (styleInHtml(boxSel)) {
        props.forEach(p => boxSel.style.removeProperty(p));
        saveContext(boxSel);                // svæðið endurvistað án stílanna — annars kæmu þeir aftur
        markDirty(); positionBoxUI();
        toast('Kassinn núllstilltur');
        return;
      }
      const key = CMS.key(boxSel), before = JSON.stringify(content.style[PAGE][key] || {});
      props.forEach(p => { boxSel.style.removeProperty(p); if (content.style[PAGE][key]) delete content.style[PAGE][key][p]; });
      if (content.style[PAGE][key] && !Object.keys(content.style[PAGE][key]).length) delete content.style[PAGE][key];
      pushRecord('style', key, before, JSON.stringify(content.style[PAGE][key] || {}));
      markDirty(); positionBoxUI();
    }, 'cms-sbreset'));
    bar._h = h;
    document.body.appendChild(bar);
    return bar;
  }

  function buildBoxHandle() {
    const hd = el('div', 'cms-boxhandle', '<span></span>');
    hd.setAttribute('data-cms-ctl', '1');
    hd.title = 'Dragðu til að gera kassann þynnri eða þykkari';
    hd.addEventListener('mousedown', (e) => {
      if (!boxSel) return;
      e.preventDefault(); e.stopPropagation();
      const startY = e.clientY, t0 = padOf(boxSel, 'top'), b0 = padOf(boxSel, 'bottom');
      document.body.classList.add('cms-resizing');
      const move = (ev) => {
        const dy = (ev.clientY - startY) / 2;
        boxSel.style.setProperty('padding-top', Math.max(0, Math.round(t0 + dy)) + 'px', 'important');
        boxSel.style.setProperty('padding-bottom', Math.max(0, Math.round(b0 + dy)) + 'px', 'important');
        positionBoxUI();
      };
      const up = (ev) => {
        document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
        document.body.classList.remove('cms-resizing');
        const dy = (ev.clientY - startY) / 2;
        setPad(boxSel, t0 + dy, b0 + dy);          // vistar og skráir í afturkallasögu
      };
      document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
    });
    document.body.appendChild(hd);
    return hd;
  }

  function positionBoxUI() {
    if (!boxSel) return;
    const r = boxSel.getBoundingClientRect();
    if (boxBar) {
      boxBar._h.textContent = Math.round(r.height) + 'px';
      const bw = boxBar.offsetWidth || 260;
      let left = Math.max(10, Math.min(window.innerWidth - bw - 10, r.left + r.width / 2 - bw / 2));
      let top = r.top - boxBar.offsetHeight - 12;
      if (top < 64) top = Math.min(window.innerHeight - 60, r.top + 12);
      boxBar.style.left = Math.round(left) + 'px';
      boxBar.style.top = Math.round(top) + 'px';
    }
    if (boxHandle) {
      boxHandle.style.left = Math.round(r.left + r.width / 2 - 26) + 'px';
      boxHandle.style.top = Math.round(r.bottom - 9) + 'px';
    }
  }

  function selectBox(target) {
    if (boxSel === target) return;
    deselectBox();
    boxSel = target;
    target.classList.add('cms-boxsel');
    if (!boxBar) boxBar = buildBoxBar();
    if (!boxHandle) boxHandle = buildBoxHandle();
    boxBar.classList.add('show'); boxHandle.classList.add('show');
    positionBoxUI();
  }
  function deselectBox() {
    if (boxSel) boxSel.classList.remove('cms-boxsel');
    boxSel = null;
    if (boxBar) boxBar.classList.remove('show');
    if (boxHandle) boxHandle.classList.remove('show');
  }
  window.addEventListener('scroll', () => { if (boxSel) positionBoxUI(); }, true);
  window.addEventListener('resize', () => { if (boxSel) positionBoxUI(); });

  // ================= MYNDASÝNING (færiband) =================
  // Smellur á færibandið opnar spjald: bæta við, eyða, raða.
  function galleryTracks() { return [...document.querySelectorAll('.rg-gallery-track')]; }

  function uniqueImgs(track) {
    // færibandið tvítekur myndirnar fyrir óendanlega hringrás — sýnum bara einstöku
    const seen = new Set(), out = [];
    [...track.querySelectorAll('img')].forEach(im => {
      const s = im.getAttribute('src');
      if (s && !seen.has(s)) { seen.add(s); out.push(s); }
    });
    return out;
  }
  function writeTrack(track, srcs) {
    const half = srcs.map(s => '<img src="' + s + '" alt="" loading="lazy">').join('');
    track.innerHTML = half + half;                  // tvítaka fyrir samfellda hringrás
    savePane(track);
  }

  function openGalleryPanel(track) {
    const panel = makePanel('Myndasýning', 'Dragðu til að raða · ✕ eyðir mynd · „Bæta við" hleður inn nýjum.');
    const grid = el('div', 'cms-gwrap');
    let srcs = uniqueImgs(track);

    function render() {
      grid.innerHTML = '';
      srcs.forEach((s, i) => {
        const cell = el('div', 'cms-gcell');
        cell.draggable = true;
        cell.innerHTML = '<img src="' + s + '" alt="">';
        const x = el('button', 'cms-gdel', '✕'); x.type = 'button'; x.title = 'Eyða mynd';
        x.onclick = () => { srcs.splice(i, 1); render(); };
        cell.appendChild(x);
        cell.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', String(i)); cell.classList.add('cms-gdrag'); });
        cell.addEventListener('dragend', () => cell.classList.remove('cms-gdrag'));
        cell.addEventListener('dragover', (e) => e.preventDefault());
        cell.addEventListener('drop', (e) => {
          e.preventDefault();
          const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
          if (isNaN(from) || from === i) return;
          const [m] = srcs.splice(from, 1); srcs.splice(i, 0, m); render();
        });
        grid.appendChild(cell);
      });
      if (!srcs.length) grid.appendChild(el('p', 'cms-gempty', 'Engar myndir — bættu við hér að neðan.'));
    }
    render();
    panel.body.appendChild(grid);

    const drop = el('div', 'cms-galdrop', '＋ Dragðu myndir hingað — eða smelltu til að velja');
    drop.setAttribute('data-cms-ctl', '1');
    drop.onclick = () => {
      const inp = el('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
      inp.onchange = async () => {
        for (const f of [...inp.files]) { const url = await uploadImageFile(f); if (url) { srcs.push(url); render(); } }
      };
      inp.click();
    };
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('cms-dropover'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('cms-dropover'));
    drop.addEventListener('drop', async (e) => {
      e.preventDefault(); e.stopPropagation(); drop.classList.remove('cms-dropover');
      for (const f of [...(e.dataTransfer.files || [])].filter(f => /^image\//.test(f.type))) {
        const url = await uploadImageFile(f); if (url) { srcs.push(url); render(); }
      }
    });
    panel.body.appendChild(drop);

    panel.foot.appendChild(btn('Hætta við', '', () => closePanel(panel)));
    panel.foot.appendChild(btn('Vista myndasýningu', 'cms-primary', () => {
      writeTrack(track, srcs); closePanel(panel); toast('Myndasýning uppfærð');
    }));
  }

  function decorateGalleryStrips() {
    galleryTracks().forEach(track => {
      const wrap = track.parentElement;
      if (!wrap || wrap._cmsGal) return;
      wrap._cmsGal = true;
      if (track._cmsBase === undefined) track._cmsBase = paneClean(track);
      wrap.style.position = wrap.style.position || 'relative';
      const b = el('button', 'cms-galbtn', '🖼 Breyta myndasýningu');
      b.type = 'button'; b.setAttribute('data-cms-ctl', '1');
      b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); openGalleryPanel(track); };
      wrap.appendChild(b);
    });
  }

  // ---------- menu item controls (old tab panes + new themed cards) ----------
  function menuLists() {
    const out = [];
    document.querySelectorAll('.w-dyn-items').forEach(l => out.push({ list: l, itemSel: ':scope > .w-dyn-item', type: 'dyn' }));
    document.querySelectorAll('.card').forEach(c => { if (c.querySelector(':scope > .ti')) out.push({ list: c, itemSel: ':scope > .ti', type: 'ti' }); });
    document.querySelectorAll('.redbox').forEach(b => { if (b.querySelector('.rn')) out.push({ list: b, itemSel: ':scope > div', type: 'rn' }); });
    return out;
  }
  function regionOf(el) { return el.closest(CMS.REGION_SEL || '.w-tab-pane') || el; }
  function decorateMenus() {
    menuLists().forEach(({ list, itemSel, type }) => {
      const region = regionOf(list);
      if (region._cmsBase === undefined) region._cmsBase = paneClean(region);
      list.querySelectorAll(itemSel).forEach(item => {
        if (type === 'rn' && !item.querySelector('.rn')) return;
        item.setAttribute('data-cms-item', '1');
        addItemCtls(item, list, region, type);
      });
      if (!(list.lastElementChild && list.lastElementChild.hasAttribute && list.lastElementChild.hasAttribute('data-cms-add')) &&
          !(list.nextElementSibling && list.nextElementSibling.hasAttribute && list.nextElementSibling.hasAttribute('data-cms-add'))) {
        const add = el('button', 'cms-add', '＋ Bæta við rétti'); add.type = 'button'; add.setAttribute('data-cms-ctl', '1'); add.setAttribute('data-cms-add', '1');
        add.onclick = () => addItem(list, region, type, itemSel);
        if (type === 'dyn') list.after(add); else list.appendChild(add);
      }
    });
  }
  function mini(txt, title, fn) { const b = el('button', 'cms-mini', txt); b.type = 'button'; b.title = title; b.setAttribute('data-cms-ctl', '1'); b.onclick = (e) => { e.stopPropagation(); fn(); }; return b; }
  function addItemCtls(item, list, region, type) {
    if (item.querySelector(':scope > [data-cms-item-ctl]')) return;
    item.style.position = item.style.position || 'relative';
    const bar = el('div', 'cms-itemctl'); bar.setAttribute('data-cms-ctl', '1'); bar.setAttribute('data-cms-item-ctl', '1');
    bar.appendChild(mini('⎘', 'Afrita', () => { const c = item.cloneNode(true); c.querySelectorAll('[data-cms-ctl]').forEach(e => e.remove()); item.after(c); addItemCtls(c, list, region, type); savePane(region); }));
    bar.appendChild(mini('%', 'Afsláttur', () => discount(item, region, type)));
    bar.appendChild(mini('🗑', 'Eyða', () => { if (confirm('Eyða þessum rétti?')) { item.remove(); savePane(region); } }));
    item.appendChild(bar);
    const nb = (s) => { let n = s; while (n && !(n.hasAttribute && n.hasAttribute('data-cms-item'))) n = n.previousElementSibling; return n; };
    const na = (s) => { let n = s; while (n && !(n.hasAttribute && n.hasAttribute('data-cms-item'))) n = n.nextElementSibling; return n; };
    const flash = () => { item.classList.add('cms-flash'); setTimeout(() => item.classList.remove('cms-flash'), 650); item.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
    const mv = el('div', 'cms-mv'); mv.setAttribute('data-cms-ctl', '1');
    const up = el('button', 'cms-mvbtn', '▲'); up.type = 'button'; up.title = 'Færa upp'; up.setAttribute('data-cms-ctl', '1');
    up.onclick = (e) => { e.stopPropagation(); const p = nb(item.previousElementSibling); if (p) { list.insertBefore(item, p); savePane(region); flash(); } };
    const dg = el('button', 'cms-mvbtn cms-mvgrip', '⠿'); dg.type = 'button'; dg.title = 'Dragðu til að færa réttinn'; dg.setAttribute('data-cms-ctl', '1');
    dg.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); startItemDrag(item, list, region); });
    const dn = el('button', 'cms-mvbtn', '▼'); dn.type = 'button'; dn.title = 'Færa niður'; dn.setAttribute('data-cms-ctl', '1');
    dn.onclick = (e) => { e.stopPropagation(); const nx = na(item.nextElementSibling); if (nx) { list.insertBefore(nx, item); savePane(region); flash(); } };
    mv.append(up, dg, dn);
    item.appendChild(mv);
    let hideT;
    const show = () => { clearTimeout(hideT); bar.classList.add('cms-show'); };
    const hideSoon = () => { clearTimeout(hideT); hideT = setTimeout(() => bar.classList.remove('cms-show'), 400); };
    item.addEventListener('mouseenter', show); item.addEventListener('mouseleave', hideSoon);
    bar.addEventListener('mouseenter', show); bar.addEventListener('mouseleave', hideSoon);
  }
  function startItemDrag(item, list, region) {
    document.body.classList.add('cms-dragging-active');
    item.classList.add('cms-dragging');
    const onMove = (ev) => {
      const after = dragAfter(list, ev.clientY);
      if (after == null) {
        const addBtn = list.querySelector(':scope > [data-cms-add]');
        if (addBtn) list.insertBefore(item, addBtn); else if (list.lastElementChild !== item) list.appendChild(item);
      }
      else if (after !== item) list.insertBefore(item, after);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.classList.remove('cms-dragging-active');
      item.classList.remove('cms-dragging');
      savePane(region);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }
  function dragAfter(list, y) {
    const items = [...list.querySelectorAll(':scope > [data-cms-item]:not(.cms-dragging)')];
    let closest = null, closestOffset = -Infinity;
    for (const it of items) {
      const box = it.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closestOffset) { closestOffset = offset; closest = it; }
    }
    return closest;
  }
  function addItem(list, region, type, itemSel) {
    let item;
    const last = [...list.querySelectorAll(itemSel)].filter(e => e.hasAttribute('data-cms-item')).pop();
    if (type === 'ti') {
      item = el('div', 'ti', '<div class="ti-head"><span class="ti-nm">Nýr réttur</span><span class="ti-pr"><b class="ti-new">0 kr</b></span></div>\n            <p class="ti-desc">Lýsing á réttinum</p>');
    } else if (type === 'rn') {
      item = el('div', '', '<p class="rn">Nýr réttur 0 kr.</p><p class="rd">Lýsing á réttinum</p>');
    } else {
      if (last) { item = last.cloneNode(true); item.querySelectorAll('[data-cms-ctl]').forEach(e => e.remove()); const h3 = item.querySelector('.h3'); if (h3) h3.textContent = 'Nýr réttur'; const h4 = item.querySelector('.h4'); if (h4) h4.textContent = 'Lýsing á réttinum'; }
      else { item = el('div', 'w-dyn-item', '<div class="div-meal"><div class="h3">Nýr réttur</div><div class="h4">Lýsing á réttinum</div></div>'); item.setAttribute('role', 'listitem'); }
    }
    item.setAttribute('data-cms-item', '1');
    const addBtn = list.querySelector(':scope > [data-cms-add]');
    if (addBtn) list.insertBefore(item, addBtn); else list.appendChild(item);
    addItemCtls(item, list, region, type);
    savePane(region);
    const h = item.querySelector('.ti-head, .rn, .h3'); if (h) startEdit(h);
  }
  function discount(item, region, type) {
    if (type === 'ti') {
      const head = item.querySelector('.ti-head');
      const newEl = head.querySelector('.ti-new'), oldEl = head.querySelector('.ti-old');
      const panel = makePanel('Afsláttur', 'Fulla verðið birtist yfirstrikað í rauðu og tilboðsverðið við hliðina.');
      const o = field('Fullt verð (yfirstrikað)'); o.input.value = oldEl ? oldEl.textContent.trim() : (newEl ? newEl.textContent.trim() : '');
      const n = field('Tilboðsverð'); n.input.value = oldEl && newEl ? newEl.textContent.trim() : ''; n.input.placeholder = 't.d. 2990 kr';
      panel.body.append(o.wrap, n.wrap);
      const priceWrap = () => { let pr = head.querySelector('.ti-pr'); if (!pr) { pr = document.createElement('span'); pr.className = 'ti-pr'; head.appendChild(pr); } return pr; };
      panel.foot.appendChild(btn('Fjarlægja afslátt', '', () => {
        const pr = priceWrap();
        pr.innerHTML = '<b class="ti-new">' + esc((o.input.value.trim() || (newEl ? newEl.textContent.trim() : ''))) + '</b>';
        savePane(region); closePanel(panel); toast('Afsláttur fjarlægður');
      }));
      panel.foot.appendChild(btn('Setja afslátt', 'cms-primary', () => {
        const oldp = o.input.value.trim(), nw = n.input.value.trim();
        if (!nw) { toast('Sláðu inn tilboðsverð'); return; }
        priceWrap().innerHTML = '<s class="ti-old">' + esc(oldp) + '</s> <b class="ti-new">' + esc(nw) + '</b>';
        savePane(region); closePanel(panel); toast('Afsláttur settur');
      }));
      return;
    }
    const priceEl = item.querySelector('[class*=price]:not(.strike)') || item.querySelector('[class*=price]') || item.querySelector('.rn');
    const cur = priceEl ? priceEl.textContent.trim() : '';
    const panel = makePanel('Afsláttur', 'Fulla verðið birtist yfirstrikað og tilboðsverðið við hliðina — eins og á vefnum.');
    const o = field('Fullt verð (yfirstrikað)'); o.input.value = cur;
    const n = field('Tilboðsverð'); n.input.placeholder = 't.d. 2990 kr.';
    panel.body.append(o.wrap, n.wrap);
    panel.foot.appendChild(btn('Setja afslátt', 'cms-primary', () => {
      const oldp = o.input.value.trim(), nw = n.input.value.trim();
      if (!nw) { toast('Sláðu inn tilboðsverð'); return; }
      const html = '<span style="text-decoration:line-through;opacity:.6;margin-right:.45em">' + esc(oldp) + '</span><span>' + esc(nw) + '</span>';
      if (priceEl) priceEl.innerHTML = html;
      savePane(region); closePanel(panel); toast('Afsláttur settur');
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
    decorateMenus(); decorateGalleries(); decorateGalleryStrips();
    // re-decorate menus if tab content changes
    document.querySelectorAll('.w-tab-link').forEach(l => l.addEventListener('click', () => setTimeout(decorateMenus, 60)));
  }
  init();
})();
