/* Snjókoma á jólasíðunni.
 *
 * Lítil snjókorn í laginu — sexarma ískristallar, hvert öðru ólíkt — sem falla undan rauða
 * hausnum, snúast hægt og sveiflast í hægum vindi. Kornin eru í mismunandi fjarlægð: þau fjarlægu
 * eru smærri, daufari og falla hægar. Róbert bað um „lítil og mismunandi" snjókorn.
 *
 * Snjórinn færist með síðunni þegar skrunað er. Áður lá hann fastur á skjánum eins og glæra og
 * síðan rann undir honum — Róbert: „eins og það sé video". Nú færast kornin með efninu, þau nær
 * meira og þau fjarlægari minna, svo snjórinn virðist vera í umhverfinu en ekki ofan á skjánum.
 *
 * Snjórinn fellur ekki yfir matarmyndirnar (Róbert) — þær eru skornar út úr teiknisvæðinu með
 * sama bogalagi og myndirnar sjálfar. Húsmyndin efst fær að halda snjónum; þar er hann hluti af senunni.
 *
 * Snjórinn er aðeins skraut og má aldrei vera fyrir:
 *   - ekki er hægt að smella á hann (pointer-events:none) og skjálesarar hunsa hann
 *   - hann birtist ekki hjá þeim sem hafa beðið um minni hreyfingu (prefers-reduced-motion)
 *   - hann birtist ekki í ritlinum (?cms=1), þar sem eigandinn er að vinna
 *   - hann stöðvast þegar flipinn er falinn, og fjöldi korna fer eftir skjástærð
 */
(function () {
  'use strict';
  if (!window.requestAnimationFrame || !document.createElement('canvas').getContext) return;
  if (/[?&]cms=1/.test(location.search)) return;
  var rm = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  if (rm && rm.matches) return;

  var cv = document.createElement('canvas');
  cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:60';
  var ctx = cv.getContext('2d');
  var W = 0, H = 0, dpr = 1, flakes = [], header = null, last = 0, t = 0, running = true, lastScroll = 0, matur = [];

  /* Sex ólík snjókorn. Hvert er sexarma: armur frá miðju og greinar út frá honum.
   * greinar = [staða á armi 0–1, lengd sem hlutfall af armi, horn í gráðum]. */
  var GERDIR = [
    { lina: 1.0, greinar: [[0.38, 0.30, 58], [0.62, 0.24, 58], [0.84, 0.13, 58]] },                   // klassískt greinótt
    { lina: 0.8, greinar: [[0.30, 0.17, 48], [0.45, 0.20, 48], [0.60, 0.17, 48], [0.75, 0.11, 48]] }, // burknalaga
    { lina: 1.1, greinar: [[0.58, 0.30, 62]], sexhyrningur: 0.30 },                                    // plötukorn
    { lina: 1.2, greinar: [[0.80, 0.16, 42]] },                                                        // einföld stjarna
    { lina: 0.9, greinar: [[0.50, 0.36, 34], [0.76, 0.20, 34]] },                                      // mjóar greinar
    { lina: 1.0, greinar: [[0.42, 0.22, 64], [0.70, 0.22, 64]], sexhyrningur: 0.16 }                   // tvöfalt
  ];

  // Hvert korn teiknað einu sinni í góðri upplausn og svo minnkað — léttara en að teikna upp á nýtt.
  function kristall(g) {
    var n = 72, c = document.createElement('canvas'); c.width = c.height = n;
    var x = c.getContext('2d'), R = n * 0.42;
    x.translate(n / 2, n / 2);
    x.strokeStyle = '#fff'; x.lineCap = 'round'; x.lineJoin = 'round';
    x.lineWidth = n * 0.05 * g.lina;
    x.shadowColor = 'rgba(255,255,255,0.75)'; x.shadowBlur = n * 0.06;   // daufur ískristallabjarmi
    for (var k = 0; k < 6; k++) {
      x.save(); x.rotate(k * Math.PI / 3);
      x.beginPath(); x.moveTo(0, 0); x.lineTo(0, -R);
      for (var b = 0; b < g.greinar.length; b++) {
        var gr = g.greinar[b], y = -R * gr[0], L = R * gr[1], a = gr[2] * Math.PI / 180;
        x.moveTo(0, y); x.lineTo(Math.sin(a) * L, y - Math.cos(a) * L);
        x.moveTo(0, y); x.lineTo(-Math.sin(a) * L, y - Math.cos(a) * L);
      }
      x.stroke(); x.restore();
    }
    if (g.sexhyrningur) {
      var h = R * g.sexhyrningur; x.beginPath();
      for (var i = 0; i < 6; i++) { var aa = i * Math.PI / 3 + Math.PI / 6; x[i ? 'lineTo' : 'moveTo'](Math.cos(aa) * h, Math.sin(aa) * h); }
      x.closePath(); x.stroke();
    }
    return c;
  }
  var KORN = GERDIR.map(kristall);

  function make(prefill) {
    var z = Math.pow(Math.random(), 1.5);                      // flest langt í burtu
    var r = 1.8 + z * 3.4 + Math.random() * 0.9;               // lítil: 4–12 dílar í þvermál (Róbert: „minnka aðeins")
    return {
      img: KORN[(Math.random() * KORN.length) | 0], z: z, r: r,
      x: Math.random() * W,
      y: prefill ? Math.random() * H : -r * 2,
      vy: 14 + z * 42 + Math.random() * 8,                     // dílar á sek. — kristallar falla hægt
      sway: 6 + Math.random() * 16, freq: 0.2 + Math.random() * 0.45, ph: Math.random() * 6.28,
      rot: Math.random() * 6.28, spin: (Math.random() < 0.5 ? -1 : 1) * (0.15 + Math.random() * 0.6),
      a: 0.32 + z * 0.58
    };
  }

  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, W < 700 ? 1.5 : 2);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    var want = Math.min(150, Math.round(W * H / 10500));
    while (flakes.length < want) flakes.push(make(true));
    flakes.length = want;
  }

  // Hægur, síbreytilegur vindur — summa hægra bylgna, svo hann endurtaki sig ekki sýnilega.
  function wind(s) { return 8 * Math.sin(s * 0.07) + 5 * Math.sin(s * 0.13 + 1.3) + 3 * Math.sin(s * 0.31 + 4.1); }

  function frame(now) {
    if (!running) return;
    var dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016; last = now; t += dt;
    // Skrun síðan síðast: kornin færast með efninu (þau nær meira, þau fjarlægari minna).
    var sc = window.pageYOffset || document.documentElement.scrollTop || 0;
    var dScroll = sc - lastScroll; lastScroll = sc;
    if (Math.abs(dScroll) > H) dScroll = 0;                    // stökk (t.d. tengill innan síðu) — ekki draga snjóinn
    // Snjórinn fellur undan hausnum: efri brúnin er neðri brún rauða hausins meðan hann sést.
    var top = 0;
    if (header) { var hb = header.getBoundingClientRect().bottom; top = hb > 0 ? hb : 0; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, top * dpr, W * dpr, (H - top) * dpr);
    for (var m = 0; m < matur.length; m++) {
      var rc = matur[m].el.getBoundingClientRect();
      if (rc.bottom < top || rc.top > H || rc.right < 0 || rc.left > W || !rc.width) continue;
      var rr = matur[m].rad;
      if (ctx.roundRect) ctx.roundRect(rc.left * dpr, rc.top * dpr, rc.width * dpr, rc.height * dpr,
        [Math.min(rr[0], rc.width / 2) * dpr, Math.min(rr[1], rc.width / 2) * dpr, rr[2] * dpr, rr[3] * dpr]);
      else ctx.rect(rc.left * dpr, rc.top * dpr, rc.width * dpr, rc.height * dpr);
    }
    ctx.clip('evenodd');
    var w = wind(t), span = H - top;
    for (var i = 0; i < flakes.length; i++) {
      var f = flakes[i];
      f.y += f.vy * dt - dScroll * (0.55 + 0.45 * f.z);
      f.x += (w * (0.35 + f.z) + Math.cos(t * f.freq * 6.28 + f.ph) * f.sway) * dt;
      f.rot += f.spin * dt;
      // Korn sem fara út fyrir koma inn hinum megin, svo snjókoman er jafnþétt hvert sem skrunað er.
      if (f.y - f.r > H) { var nf = make(false); nf.y = top - nf.r * 2 + (f.y - f.r - H); flakes[i] = f = nf; }
      else if (f.y + f.r < top - 2) { f.y += span + f.r * 2; f.x = Math.random() * W; }
      if (f.x < -20) f.x += W + 40; else if (f.x > W + 20) f.x -= W + 40;
      if (f.y + f.r < top) continue;
      ctx.globalAlpha = f.a;
      var c = Math.cos(f.rot) * dpr, s = Math.sin(f.rot) * dpr;
      ctx.setTransform(c, s, -s, c, f.x * dpr, f.y * dpr);
      ctx.drawImage(f.img, -f.r, -f.r, f.r * 2, f.r * 2);
    }
    ctx.restore();
    requestAnimationFrame(frame);
  }

  // Matarmyndirnar og horn þeirra (bogarnir eru mismunandi eftir skjástærð, svo lesið aftur við resize).
  function finnaMat() {
    matur = [].map.call(document.querySelectorAll('.kj-mynd img, .kj-saga-mynd img'), function (el) {
      var cs = getComputedStyle(el), px = function (v) { return parseFloat(v) || 0; };
      return { el: el, rad: [px(cs.borderTopLeftRadius), px(cs.borderTopRightRadius), px(cs.borderBottomRightRadius), px(cs.borderBottomLeftRadius)] };
    });
  }

  function start() {
    header = document.querySelector('.bar');
    finnaMat();
    lastScroll = window.pageYOffset || 0;
    document.body.appendChild(cv);
    resize();
    window.addEventListener('resize', function () { resize(); finnaMat(); });
    document.addEventListener('visibilitychange', function () {
      running = !document.hidden; last = 0; lastScroll = window.pageYOffset || 0;
      if (running) requestAnimationFrame(frame);
    });
    if (rm && rm.addEventListener) rm.addEventListener('change', function (e) {
      if (e.matches) { running = false; cv.remove(); }
    });
    requestAnimationFrame(frame);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
