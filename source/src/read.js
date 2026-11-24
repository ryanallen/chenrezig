// The pecha and the phone on the choktse. Picked up, each fills the screen as HTML over the room, which stops drawing
// behind it: the pecha's leaves to read and turn, the phone's YouTube player for the two parts of the empowerment.
// Esc, the right mouse button, the back gesture (a pushed history entry) or the close mark put it down.
const UI = (() => {
  const TX = typeof TEXTURES === 'object' ? TEXTURES : {};
  const el = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.append(e); return e; };
  const hooks = { pause() {}, resume() {} };
  let open = null, pushed = false, backing = false; // backing: our own history.back() not yet arrived

  const veil = el('div', 'veil', document.body);
  const xb = el('button', 'x', veil, '&times;'); xb.title = 'Close (Esc)'; xb.setAttribute('aria-label', 'Close');
  const tip = el('div', 'tip', veil);
  xb.addEventListener('click', (e) => { e.stopPropagation(); close(); });
  veil.addEventListener('contextmenu', (e) => { e.preventDefault(); close(); });
  addEventListener('popstate', () => {
    if (backing) { backing = false; if (open && !pushed) { history.pushState({ mani: open }, ''); pushed = true; } return; }
    if (open) { pushed = false; close(); }
  });

  function show(which) {
    if (open) return;
    open = which; keysUp();
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
    document.body.classList.add('ui', 'hold-' + which);
    if (!pushed && !backing) { history.pushState({ mani: which }, ''); pushed = true; }
    if (which === 'pecha') pecha.show(); else phone.show();
  }
  function close() {
    if (!open) return;
    if (open === 'phone') phone.hide(); else pecha.hide();
    document.body.classList.remove('ui', 'hold-' + open); open = null;
    if (pushed) { pushed = false; backing = true; history.back(); }
  }
  let keysUp = () => {};

  // ---- the pecha ----
  // Where the leaf image's red ruling puts the panels, as fractions of the leaf (long side across): the body between the
  // inner verticals, the margin panels between them and the outer border.
  const RULE = { x0: 0.04, x1: 0.145, x2: 0.155, x3: 0.845, x4: 0.855, x5: 0.975, y0: 0.10, y1: 0.89 };
  const TIB = (n) => String(n).replace(/\d/g, (d) => '༠༡༢༣༤༥༦༧༨༩'[d]);
  const pecha = (() => {
    const root = el('div', 'pecha', veil), stack = el('div', 'stack', root);
    const meas = el('div', 'leaf meas', document.body);
    let pages = [], at = 0, geo = null, busy = 0;

    // The leaf keeps the paper's own long shape (3 : 1) at the largest size the screen allows; on a screen taller than
    // wide it lies along the screen's long side, turned a quarter, as a reader turns a phone to read a pecha.
    function geometry() {
      const rot = innerWidth < innerHeight, A = rot ? innerHeight : innerWidth, B = rot ? innerWidth : innerHeight;
      const w = Math.min(A * 0.95, B * 0.84 * 3), h = w / 3;
      return { w, h, f: Math.max(11, Math.min(26, h * (RULE.y1 - RULE.y0) / 19)), rot };
    }
    // the body box and the two margin boxes, in px of the leaf as shown
    function boxes(g) {
      const r = (a, b, c, d) => ({ left: a * g.w, top: c * g.h, width: (b - a) * g.w, height: (d - c) * g.h });
      const pad = g.f * 0.9;
      const body = r(RULE.x2, RULE.x3, RULE.y0, RULE.y1);
      body.left += pad; body.top += pad * 0.7; body.width -= pad * 2; body.height -= pad * 1.4;
      return { body, ml: r(RULE.x0, RULE.x1, RULE.y0, RULE.y1), mr: r(RULE.x4, RULE.x5, RULE.y0, RULE.y1) };
    }
    const px = (b) => `left:${b.left}px;top:${b.top}px;width:${b.width}px;height:${b.height}px`;
    function blockHtml(b) {
      if (b.k === 'mantra') return `<p class="mantra" lang="bo">${b.h}</p><p class="mantra-en">OM MA NI PAD ME HUM</p>`;
      return `<p class="${b.k}">${b.h}</p>`;
    }
    function balance(head, tail) {
      for (const t of ['i', 'b']) {
        const o = (head.match(new RegExp('<' + t + '>', 'g')) || []).length, c = (head.match(new RegExp('</' + t + '>', 'g')) || []).length;
        if (o > c) { head += `</${t}>`; tail = `<${t}>` + tail; }
      }
      return [head, tail];
    }
    // Lay the teaching out in leaves for this screen: each section starts a leaf; a block that runs over is split by words.
    function paginate(g) {
      const bx = boxes(g);
      meas.style.cssText = `font-size:${g.f}px;width:${bx.body.width}px`;
      const fits = () => meas.scrollHeight <= bx.body.height + 1;
      const out = [{ title: true }];
      const secs = TEACHING.sections;
      secs.forEach((s, si) => {
        let html = `<h2>${s.title}</h2>`;
        meas.innerHTML = html;
        const push = () => { out.push({ si, html }); html = ''; meas.innerHTML = ''; };
        for (const b of s.blocks) {
          let piece = blockHtml(b);
          meas.innerHTML = html + piece;
          if (fits()) { html += piece; continue; }
          if (b.k === 'mantra') { push(); html = piece; meas.innerHTML = html; continue; }
          // split: the most words that still fit on this leaf, the rest onto the next
          let words = b.h.split(' ');
          while (words.length) {
            let lo = 0, hi = words.length;
            while (lo < hi) {
              const mid = (lo + hi + 1) >> 1;
              meas.innerHTML = html + `<p class="${b.k}">${balance(words.slice(0, mid).join(' '), '')[0]}</p>`;
              if (fits()) lo = mid; else hi = mid - 1;
            }
            if (lo === words.length) { html += `<p class="${b.k}">${words.join(' ')}</p>`; break; }
            if (lo === 0 && !html) lo = 1;
            const [hd, tl] = balance(words.slice(0, lo).join(' '), words.slice(lo).join(' '));
            if (lo) html += `<p class="${b.k} cut">${hd}</p>`;
            push();
            words = tl.split(' ');
          }
        }
        if (html) push();
      });
      out.forEach((p, i) => { p.n = i + 1; });
      return out;
    }

    function paper(g) {
      const c = el('div', 'paper');
      if (TX['pecha-leaf']) c.style.backgroundImage = `url(${TX['pecha-leaf']})`;
      return c;
    }
    function leaf(p) {
      const g = geo, bx = boxes(g), d = el('div', 'leaf');
      d.style.cssText = `width:${g.w}px;height:${g.h}px;font-size:${g.f}px`;
      d.append(paper(g));
      if (p.title) {
        const H = TEACHING.head;
        const sq = Math.min(bx.body.height * 0.95, bx.body.width * 0.24);
        const t = el('div', 'body title', d); t.style.cssText = px(bx.body);
        const mini = (k, alt) => TX[k] ? `<img class="mini" alt="${alt}" src="${TX[k]}" style="width:${sq}px;height:${sq}px">` : `<div class="mini" style="width:${sq}px;height:${sq}px"></div>`;
        t.innerHTML = mini('pecha-miniature-chenrezig', 'Four-Armed Chenrezig') +
          `<div class="tt"><p class="tib" lang="bo">སྤྱན་རས་གཟིགས་ཀྱི་དབང་།</p><h1>${H.title}</h1><p class="by">${H.byline}</p></div>` +
          mini('pecha-miniature-amitabha', 'Buddha Amitabha');
      } else {
        const s = TEACHING.sections[p.si];
        const b = el('div', 'body', d, p.html); b.style.cssText = px(bx.body);
        const ml = el('div', 'margin', d, `<span>${s.title}</span>`); ml.style.cssText = px(bx.ml);
        const mr = el('div', 'margin', d, `<b lang="bo">${TIB(p.n)}</b><span>${s.part}, leaf ${p.n} of ${pages.length}</span>`); mr.style.cssText = px(bx.mr);
      }
      return d;
    }
    function render() {
      stack.innerHTML = '';
      stack.style.cssText = `width:${geo.w}px;height:${geo.h}px${geo.rot ? ";transform:rotate(90deg)" : ""}`;
      stack.append(leaf(pages[at]));
    }
    function relayout() {
      const keep = pages[at] && pages[at].si;
      geo = geometry(); pages = paginate(geo);
      if (keep != null) at = Math.max(0, pages.findIndex((p) => p.si === keep)); else at = Math.min(at, pages.length - 1);
      render();
    }
    // a leaf is lifted from its far edge and laid face down beyond, uncovering the next; going back lays it down again
    function turn(dir) {
      const to = at + dir;
      if (to < 0 || to >= pages.length || busy > performance.now()) return;
      busy = performance.now() + 420;
      const cur = stack.lastChild, nxt = leaf(pages[to]);
      if (dir > 0) {
        stack.insertBefore(nxt, cur);
        requestAnimationFrame(() => cur.classList.add('up'));
        setTimeout(() => cur.remove(), 450);
      } else {
        nxt.classList.add('up'); stack.append(nxt);
        nxt.getBoundingClientRect();
        requestAnimationFrame(() => nxt.classList.remove('up'));
        setTimeout(() => cur.remove(), 450);
      }
      at = to;
    }
    let wacc = 0, sx = null;
    root.addEventListener('wheel', (e) => {
      e.preventDefault(); wacc += e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
      if (Math.abs(wacc) > 60) { turn(Math.sign(wacc)); wacc = 0; }
    }, { passive: false });
    stack.addEventListener('click', (e) => { const r = stack.getBoundingClientRect(); turn((geo.rot ? e.clientY < r.top + r.height / 2 : e.clientX < r.left + r.width / 2) ? -1 : 1); });
    root.addEventListener('touchstart', (e) => { sx = [e.touches[0].clientX, e.touches[0].clientY]; }, { passive: true });
    root.addEventListener('touchend', (e) => {
      if (!sx) return; const t = e.changedTouches[0], dx = t.clientX - sx[0], dy = t.clientY - sx[1]; sx = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) > 40) turn(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : -1) : (dy < 0 ? 1 : -1));
    });
    addEventListener('resize', () => { if (open === 'pecha') relayout(); });
    return {
      show() { relayout(); tip.textContent = matchMedia('(pointer:coarse)').matches ? 'Swipe to turn the page' : 'Scroll, click or use the arrow keys to turn the page. Esc to close.'; },
      hide() {},
      key(k) {
        if (['arrowright', 'arrowdown', 'pagedown', ' ', 'enter'].includes(k)) turn(1);
        else if (['arrowleft', 'arrowup', 'pageup', 'backspace'].includes(k)) turn(-1);
        else if (k === 'home') { at = 0; render(); } else if (k === 'end') { at = pages.length - 1; render(); }
        else return false;
        return true;
      },
      go(n) { geo = geometry(); pages = paginate(geo); at = Math.max(0, Math.min(pages.length - 1, n)); render(); return pages.length; },
    };
  })();

  // ---- the phone ----
  const phone = (() => {
    const root = el('div', 'phone', veil), body = el('div', 'body', root), scr = el('div', 'scr', body);
    const player = el('div', 'player', scr), list = el('div', 'list', scr), note = el('div', 'note', scr);
    const fromDisk = location.protocol === 'file:';
    let frame = null, cur = null, playing = false;
    const times = {};
    const parts = Object.entries(typeof VIDEOS === 'object' ? VIDEOS : {});
    const poster = () => { player.innerHTML = TX['thumb-1'] ? `<img src="${TX['thumb-1']}" alt="">` : ''; el('div', 'play', player, 'Pick a video below'); };
    for (const [k, id] of parts) {
      const it = el('button', 'item', list, `${TX['thumb-' + k] ? `<img src="${TX['thumb-' + k]}" alt="">` : '<span class="ph"></span>'}<span><b>Chenrezig Empowerment, part ${k}</b><small>H.E. Garchen Rinpoche · 23 May 2020</small></span>`);
      it.addEventListener('click', () => pick(k, id));
    }
    // YouTube will not play inside a page opened from disk (error 153: it needs a web address), so from disk the
    // phone opens the part on YouTube; served (serve.cmd, or any website) it plays here.
    if (fromDisk) note.innerHTML = "YouTube won't play inside a page opened straight from your computer, so the video opens on YouTube in a new tab instead. Start the temple with <b>serve.cmd</b> to watch it here.";
    function pick(k, id) {
      if (fromDisk) { window.open(`https://www.youtube.com/watch?v=${id}`, '_blank', 'noopener'); return; }
      stop();
      cur = { k, id };
      [...list.children].forEach((b, i) => b.classList.toggle('on', parts[i][0] === k));
      player.innerHTML = '';
      frame = el('iframe', '', player);
      frame.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
      frame.allowFullscreen = true; frame.title = 'Chenrezig Empowerment, Part ' + k;
      frame.src = `https://www.youtube.com/embed/${id}?autoplay=1&playsinline=1&rel=0&enablejsapi=1&start=${Math.floor(times[id] || 0)}`;
      frame.addEventListener('load', () => frame && frame.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*'));
      hooks.pause();
    }
    // the player reports its state and time; the temple's own sound rests while a video plays
    addEventListener('message', (e) => {
      if (!frame || e.source !== frame.contentWindow || typeof e.data !== 'string') return;
      let m; try { m = JSON.parse(e.data); } catch { return; }
      const info = m.info || {};
      if (typeof info.currentTime === 'number' && cur) times[cur.id] = info.currentTime;
      const st = typeof info.playerState === 'number' ? info.playerState : m.event === 'onStateChange' ? info : null;
      if (st === 1) { playing = true; hooks.pause(); } else if (st === 0 || st === 2) { playing = false; hooks.resume(); }
    });
    function stop() { if (frame) { frame.src = 'about:blank'; frame.remove(); frame = null; } playing = false; }
    return {
      show() {
        // the thumbnails stream in after the page opens
        [...list.children].forEach((it, i) => { const src = TX['thumb-' + parts[i][0]], ph = it.querySelector('.ph'); if (src && ph) ph.outerHTML = '<img src="' + src + '" alt="">'; });
        if (!frame) poster(); tip.textContent = 'Pick a video. Esc to close.'; },
      hide() { stop(); poster(); [...list.children].forEach((b) => b.classList.remove('on')); hooks.resume(); },
    };
  })();

  // ---- the page Esc opens in the room: the prayers, thanks to Rinpoche, the links ----
  // The prayers are the ones the teaching uses, put into plain English.
  const menu = (() => {
    const root = el('div', 'menu', document.body), card = el('div', 'card', root);
    const vids = Object.entries(typeof VIDEOS === 'object' ? VIDEOS : {});
    const touch = matchMedia('(pointer:coarse)').matches;
    // the controls as a legend: key caps and mouse on a computer, thumbs, drags and taps on a phone
    const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
    const MOUSE = svg('<rect x="6.5" y="2.5" width="11" height="19" rx="5.5"/><path d="M12 2.5v6"/>');
    const SCROLL = svg('<rect x="6.5" y="2.5" width="11" height="19" rx="5.5"/><path d="M12 6v4" stroke-width="3"/>');
    const DRAG = svg('<path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/>');
    const STICK = svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5" fill="currentColor"/>');
    const LOOK = svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>');
    const TAP = svg('<circle cx="12" cy="12" r="3" fill="currentColor"/><circle cx="12" cy="12" r="8"/>');
    const k = (...keys) => keys.map((x) => `<kbd>${x}</kbd>`).join('');
    const CTL_DESK = [
      [MOUSE, 'Click, then move the mouse to look around'],
      [k('W', 'A', 'S', 'D'), 'Walk'],
      [MOUSE + DRAG, 'Click and drag across the wheel to spin it: left speeds it up, right slows it down'],
      [SCROLL, 'Or scroll to change its speed'],
      [MOUSE, 'Click the book on the little table to read the teaching, or the phone next to it to watch the videos'],
      [k('Esc'), 'Let go of the mouse and come back here'],
    ];
    const CTL_TOUCH = [
      [STICK, 'Left thumb: walk'],
      [LOOK, 'Right thumb: look around'],
      [DRAG, 'Drag across the wheel to spin it: left speeds it up, right slows it down'],
      [TAP, 'Tap the book on the little table to read the teaching, or the phone next to it to watch the videos'],
    ];
    card.innerHTML = `<p class="tib" lang="bo">ཨོཾ་མ་ཎི་པདྨེ་ཧཱུྃ</p><h1>${TEACHING.head.title}</h1>
<div class="load"><div class="bar"><i></i></div><p class="what"></p><ul></ul></div>
<button class="back">Enter</button>
<div class="cols"><h3>A prayer to begin</h3><p>Embodiment of all-knowing wisdom, chief of all deities: out of your kindness, please give me today the precious treasure that frees us completely from the cycle of existence.</p>
<h3>Refuge and the wish to awaken</h3><p>I take refuge in the Three Jewels. I admit every harmful thing I've done, I rejoice in all the good that others do, and I keep the Buddha's awakening in my heart. Until I'm fully awake, I go for refuge to the Buddha, the Dharma and the Sangha. For my own sake and for everyone else's, I set my heart on awakening. With that resolve, I welcome every living being as my guest, and I'll live the way a bodhisattva lives, in a way that's good for everyone. May I become a Buddha for the benefit of all beings.</p>
<h3>The four immeasurables</h3><p>May all beings be happy and have what makes for happiness.<br>May they be free of suffering and what causes it.<br>May they never lose the joy that has no suffering in it.<br>May they rest in equanimity, free of clinging to some and pushing others away.</p>
<h3>Dedication</h3><p>May the teachings of the great Drigungpa Ratnashri, master of interdependence, who sees all things as they truly are, be kept alive until the end of time through study and practice, listening, reflection and meditation.</p><p>Your thousand arms are a thousand wheel-turning kings, and your thousand eyes are the thousand Buddhas of this fortunate age. Your love is as wide as the sky. Chenrezig, I pray to you.</p>
<h3>Thank you</h3><p>Thank you to His Eminence Garchen Rinpoche, who gave this Chenrezig empowerment online on 23 May 2020, and to the Garchen Buddhist Institute for sharing it with everyone.</p>
<p class="links"><a href="https://garchen.net/donations-x/" target="_blank" rel="noopener">Donate to the Garchen Buddhist Institute</a>${vids.map(([k, id]) => `<a href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener">Watch part ${k} on YouTube</a>`).join('')}<a href="https://garchen.net/" target="_blank" rel="noopener">garchen.net</a></p>
<h3>How to move</h3><div class="ctl">${(touch ? CTL_TOUCH : CTL_DESK).map(([how, what]) => `<div class="how">${how}</div><div>${what}</div>`).join('')}</div></div>`;
    // each heading and what follows it in one block, so the two columns never split a section
    { const cols = card.querySelector('.cols'); let sec = null;
      for (const n of [...cols.children]) { if (n.tagName === 'H3') { sec = document.createElement('section'); cols.insertBefore(sec, n); } if (sec) sec.append(n); } }
    let on = false, entered = false, ready = false;
    // the button waits, disabled, until the shaders are compiled and every image has at least its quick copy
    const btn = card.querySelector('.back');
    const label = () => { btn.disabled = !ready; btn.textContent = !ready ? 'Loading…' : entered ? 'Back to the temple' : 'Enter'; };
    const set = (v) => {
      document.body.classList.toggle('loading', !loadDone);
      if (on && !v) { entered = true; label(); }
      on = v; document.body.classList.toggle('menu-on', v); if (v) card.scrollTop = 0;
    };
    root.addEventListener('click', (e) => { if (e.target.closest('a')) return; if ((e.target === root || e.target.closest('.back')) && ready) { set(false); hooks.relock(); } });
    root.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    label();
    return { get on() { return on; }, set, ready(v) { if (v !== ready) { ready = v; label(); } } };
  })();
  hooks.relock = () => {};

  // ---- what is loading: the images streaming in, then the light gathered over them ----
  // On the start page every image by name and size with a tick as it lands; with it closed, a thin bar at the foot.
  const foot = el('div', 'foot', document.body, '<div class="bar"><i></i></div><p></p>');
  const ld = document.querySelector('.menu .load');
  let loadDone = false, items = [], lightF = 0, lastShown = '', shaderF = 0, shaderSecs = 0;
  const kb = (n) => n >= 1024 ? (n / 1024).toFixed(1) + ' MB' : n + ' KB';
  function draw() {
    const total = items.reduce((t, a) => t + a.kb + a.lo, 0) || 1, got = items.filter((a) => a.state === 'done' || a.state === 'fail');
    const gotKb = items.reduce((t, a) => t + a.got, 0), now = items.filter((a) => a.state === 'load'), quick = items.filter((a) => a.state !== 'wait' && a.state !== 'load').length;
    // the shaders the first sixth of the bar, the images to nine tenths, the light the last tenth
    const shading = shaderF < 1, imgs = !shading && items.length && got.length >= items.length;
    const quickAll = items.length > 0 && items.every((x) => x.state !== 'wait' && x.state !== 'load' || !x.lo);
    const f = shading ? 0.16 * (quickAll ? 0.5 + 0.5 * shaderF : 0.5 * quick / Math.max(1, items.length)) : imgs ? 0.9 + 0.1 * lightF : 0.16 + 0.74 * gotKb / total;
    loadDone = imgs && lightF >= 1;
    const what = shading && quickAll ? 'Getting your graphics card ready' + (shaderSecs > 2 ? ' (' + Math.round(shaderSecs) + ' seconds so far; this can take a minute if hardware acceleration is off)' : '') + '…'
      : loadDone ? 'All loaded.' : imgs ? 'Working out the lighting… ' + Math.round(lightF * 100) + '%'
      : 'Loading pictures: ' + got.length + ' of ' + items.length + ' done (' + kb(gotKb) + ' of ' + kb(total) + ')' + (now.length ? '. Now: ' + now.map((a) => a.l.charAt(0).toLowerCase() + a.l.slice(1)).join(', ') : '');
    const key = what + f.toFixed(3);
    if (key === lastShown) return; lastShown = key;
    for (const b of [ld, foot]) { b.querySelector('.bar i').style.width = (f * 100).toFixed(1) + '%'; b.querySelector('p').textContent = what; }
    ld.classList.toggle('done', loadDone);
    menu.ready(!shading && items.length > 0 && items.every((a) => a.state !== 'wait' && a.state !== 'load'));
    document.body.classList.toggle('loading', !loadDone);
  }
  function loading(list) {
    items = list;
    ld.querySelector('ul').innerHTML = list.map((a) => '<li class="s-' + a.state + '"><span>' + a.l + '</span><small>' + kb(a.kb) + (a.state === 'done' ? ' ✓' : a.state === 'fail' ? ' missing' : a.state === 'load' ? ' …' : a.state === 'quick' ? ' (preview)' : '') + '</small></li>').join('');
    draw();
  }
  function shaders(f, secs) { shaderF = f; shaderSecs = secs; draw(); }
  function light(f) { if (Math.abs(f - lightF) > 0.009 || (f >= 1 && lightF < 1)) { lightF = f; draw(); } }
  // Esc in the room gives the mouse back (the browser does that) and opens the page; Esc again closes it.
  let lockedAt = 0;
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement) { lockedAt = 1; menu.set(false); }
    else if (lockedAt && !open) { lockedAt = 0; menu.set(true); }
  });

  addEventListener('keydown', (e) => {
    if (!open && e.key === 'Escape') { if (!document.pointerLockElement) menu.set(!menu.on); e.preventDefault(); return; }
    if (!open) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') { close(); e.preventDefault(); return; }
    if (open === 'pecha' && pecha.key(k)) e.preventDefault();
  });

  return {
    get open() { return open || (menu.on ? 'menu' : null); },
    menu, loading, light, shaders,
    show, close, hooks, pecha,
    set keysUp(f) { keysUp = f; },
  };
})();
