/* ==========================================================
   Sketchbook flip-book — drawings page
   - portrait hard-cover book, 3D page turning with shading
   - turn pages by scroll wheel, drag/swipe, tap, arrow keys
   - "+" button uploads scans; saved in IndexedDB (this browser)
   ========================================================== */
(() => {
  'use strict';

  const RATIO = 0.72;                       // page width / height (portrait)
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);

  const stage = $('#sbStage'), book = $('#sbBook');
  if (!stage || !book) return;
  const statusEl = $('#sbStatus'), btnPrev = $('#sbPrev'), btnNext = $('#sbNext');
  const btnAdd = { classList: { toggle() {} } }; // the round "+" is now the shared owner button (js/owner.js)

  const LABEL = { graphic: 'Graphic Designing', logos: 'Logos', illustrations: 'Illustrations', drawings: 'Drawings' };
  // drawings saved earlier with the old categories are mapped onto the new ones
  const OLD = { pencil: 'drawings', ink: 'drawings', digital: 'illustrations' };
  const normMedium = m => LABEL[m] ? m : (OLD[m] || 'drawings');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const div = cls => { const d = document.createElement('div'); if (cls) d.className = cls; return d; };
  const hash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  let pw = 0, ph = 0, mode = 'spread';
  let drawings = [], filter = 'all';
  let leaves = [], cur = 0, bodyCount = 0;
  let blockL, blockR;

  /* ------------------------------------------------------ storage */
  const DB = {
    db: null, mem: [],
    async open() {
      try {
        this.db = await new Promise((res, rej) => {
          const r = indexedDB.open('alpaganga-sketchbook', 1);
          r.onupgradeneeded = () => r.result.createObjectStore('drawings', { keyPath: 'id' });
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        });
      } catch (e) { this.db = null; }
    },
    tx(mode) { return this.db.transaction('drawings', mode).objectStore('drawings'); },
    req(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
    async all() { return this.db ? this.req(this.tx('readonly').getAll()) : this.mem.slice(); },
    async put(rec) { if (this.db) await this.req(this.tx('readwrite').put(rec)); else this.mem.push(rec); },
    async del(id) { if (this.db) await this.req(this.tx('readwrite').delete(id)); else this.mem = this.mem.filter(r => r.id !== id); }
  };

  /* ------------------------------------------------------ layout */
  function measure() {
    const w = stage.clientWidth, h = stage.clientHeight;
    const m = w >= 780 ? 'spread' : 'single';
    let H = Math.min(h * 0.84, (m === 'spread' ? w * 0.86 / 2 : w * 0.8) / RATIO);
    H = Math.max(280, Math.floor(H));
    return { m, ph: H, pw: Math.floor(H * RATIO) };
  }
  function applySize(s) {
    mode = s.m; pw = s.pw; ph = s.ph;
    stage.style.setProperty('--pw', pw + 'px');
    stage.style.setProperty('--ph', ph + 'px');
    stage.classList.toggle('sb-single', mode === 'single');
    stage.classList.toggle('sb-spread', mode === 'spread');
  }

  /* ------------------------------------------------------ faces */
  const visible = () => drawings.filter(d => filter === 'all' || d.medium === filter);

  function makeBody(list) {
    const body = list.map(d => ({ t: 'art', d }));
    body.push({ t: 'add' });
    while (body.length < 4 || body.length % 2 !== 0) body.push({ t: 'blank' });
    body.forEach((f, i) => { f.n = i + 1; });
    return body;
  }

  function faceEl(f, side, which) {
    const k = f ? f.t : 'reverse';
    const el = div(`sb-face sb-${which} side-${side} k-${k}`);
    switch (k) {
      case 'cover':
        el.innerHTML = `<div class="sb-label"><strong>AGM Sketches</strong></div><div class="sb-band"></div>`;
        break;
      case 'backCover':
        el.innerHTML = `<div class="sb-deboss">AGM</div>`;
        break;
      case 'art': {
        const d = f.d, rot = ((hash(d.id) % 13) - 6) / 10;
        el.innerHTML =
          `<figure class="sb-art"><img src="${d.url}" alt="${esc(d.title || 'Artwork')}" draggable="false" style="--rot:${rot}deg"></figure>` +
          `<figcaption class="sb-cap"><b>${esc(d.title || 'Untitled')}</b><span>${esc(LABEL[d.medium] || 'Artwork')} · ${esc(d.year)}</span></figcaption>` +
          `<span class="sb-no">${f.n}</span>` +
          `<button class="sb-del" type="button" data-del="${esc(d.id)}" aria-label="Remove this artwork" title="Remove">&times;</button>`;
        break;
      }
      case 'add':
        el.innerHTML = `<button class="sb-addpage" type="button" data-add><span class="plus"></span><b>Add artwork</b><small>Upload a scan, photo or export of your work</small></button><span class="sb-no">${f.n}</span>`;
        break;
      case 'blank':
        el.innerHTML = `<span class="sb-no">${f.n}</span>`;
        break;
      default: break;
    }
    el.append(div('sb-gutter'), div('sb-shade'));
    return el;
  }

  /* ------------------------------------------------------ build */
  function maxCur() { return mode === 'spread' ? leaves.length : leaves.length - 1; }

  function build() {
    leaves.forEach(L => cancelAnimationFrame(L.raf));
    book.textContent = '';
    leaves = [];

    const list = visible();
    const body = makeBody(list);
    bodyCount = body.length;
    const cover = { t: 'cover' }, endpaper = { t: 'endpaper' };
    const backIn = { t: 'backIn' }, backCover = { t: 'backCover' };

    let defs;
    if (mode === 'spread') {
      const faces = [cover, endpaper, ...body, backIn, backCover];
      defs = [];
      for (let i = 0; i < faces.length; i += 2) {
        defs.push({ front: faces[i], back: faces[i + 1], hard: i === 0 || i === faces.length - 2 });
      }
    } else {
      defs = [{ front: cover, back: endpaper, hard: true }];
      body.forEach(f => defs.push({ front: f, back: null }));
      defs.push({ front: backIn, back: backCover, hard: true });
    }

    cur = clamp(cur, 0, defs.length - (mode === 'spread' ? 0 : 1));

    book.append(div('sb-floor'));
    blockL = div('sb-block l'); blockR = div('sb-block r');
    book.append(blockL, blockR);

    defs.forEach((def, i) => {
      const el = div('sb-leaf' + (def.hard ? ' hard' : ''));
      el.append(faceEl(def.front, 'r', 'front'), faceEl(def.back, 'l', 'back'));
      const cast = div('sb-cast r');
      book.append(cast, el);
      leaves.push({ el, cast, hard: !!def.hard, a: i < cur ? 180 : 0, busy: false, drag: false, raf: 0 });
    });
    leaves.forEach((_, i) => paint(i));
    afterMove(true);
  }

  /* ------------------------------------------------------ painting */
  function zFor(i) {
    const L = leaves[i], n = leaves.length;
    if (L.busy || L.drag) return 500;
    const flipped = L.a >= 90;
    if (L.hard) {
      if (i === 0) return flipped ? 1 : n + 10;
      return flipped ? n + 10 : 1;
    }
    return flipped ? i + 10 : (n - i) + 10;
  }

  function paint(i) {
    const L = leaves[i], a = L.a, r = a * Math.PI / 180, s = Math.sin(r);
    L.el.style.transform = `rotateY(${-a}deg)`;
    L.el.style.setProperty('--s', Math.pow(s, 0.85).toFixed(3));
    L.el.style.zIndex = zFor(i);

    if ((L.busy || L.drag) && a > 0.8 && a < 179.2) {
      const xe = pw * Math.abs(Math.cos(r)), fade = pw * (0.12 + 0.4 * s), op = 0.5 * Math.pow(s, 0.7);
      const dir = a < 90 ? 90 : 270;
      L.cast.className = 'sb-cast ' + (a < 90 ? 'r' : 'l');
      L.cast.style.display = 'block';
      L.cast.style.background = `linear-gradient(${dir}deg, transparent ${xe}px, rgba(20,14,8,${op.toFixed(3)}) ${xe + 1}px, transparent ${xe + fade}px)`;
    } else {
      L.cast.style.display = 'none';
    }
  }

  const ease = p => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

  function animate(i, to, dur) {
    const L = leaves[i];
    cancelAnimationFrame(L.raf);
    const from = L.a;
    if (reduce || from === to) { L.a = to; L.busy = false; L.drag = false; paint(i); return; }
    L.busy = true; L.drag = false;
    const t0 = performance.now();
    const step = t => {
      const p = Math.min(1, (t - t0) / dur);
      L.a = from + (to - from) * ease(p);
      if (p < 1) { paint(i); L.raf = requestAnimationFrame(step); }
      else { L.a = to; L.busy = false; paint(i); }
    };
    L.raf = requestAnimationFrame(step);
  }
  const durFor = (from, to) => 260 + 760 * Math.abs(to - from) / 180;

  function updateBlocks() {
    const col = k => `hsl(40 ${Math.max(10, 30 - k * 2)}% ${90 - k * 3.4}%)`;
    const rem = clamp(leaves.length - cur - 1, 0, 6);
    blockR.style.boxShadow = Array.from({ length: rem }, (_, j) => `${j + 1}px ${j + 1}px 0 ${col(j)}`).join(',') || 'none';
    const rl = clamp(cur - 1, 0, 6);
    blockL.style.boxShadow = Array.from({ length: rl }, (_, j) => `${-(j + 1)}px ${j + 1}px 0 ${col(j)}`).join(',') || 'none';
  }

  function afterMove(initial) {
    const L = leaves.length;
    if (initial) book.classList.add('no-trans');
    if (mode === 'spread') {
      const shift = cur === 0 ? -pw / 2 : cur === L ? pw / 2 : 0;
      book.style.transform = `translateX(${shift}px)`;
    } else book.style.transform = '';
    if (initial) { void book.offsetWidth; book.classList.remove('no-trans'); }

    btnPrev.disabled = cur <= 0;
    btnNext.disabled = cur >= maxCur();
    updateBlocks();
    if (mode === 'spread') {
      statusEl.textContent = cur === 0 ? 'Front cover' : cur === L ? 'Back cover' : `Spread ${cur} of ${L - 1}`;
    } else {
      statusEl.textContent = cur === 0 ? 'Front cover' : cur === maxCur() ? 'Back cover' : `Page ${cur} of ${L - 2}`;
    }
    btnAdd.classList.toggle('pulse', drawings.length === 0);
  }

  /* ------------------------------------------------------ turning */
  let goTimer = 0;
  function next() {
    if (cur >= maxCur() || (ptr && ptr.drag)) return false;
    const i = cur; cur++;
    animate(i, 180, durFor(leaves[i].a, 180));
    afterMove(); return true;
  }
  function prev() {
    if (cur <= 0 || (ptr && ptr.drag)) return false;
    cur--;
    animate(cur, 0, durFor(leaves[cur].a, 0));
    afterMove(); return true;
  }
  function goTo(t) {
    clearTimeout(goTimer);
    t = clamp(t, 0, maxCur());
    const step = () => {
      if (cur < t) next(); else if (cur > t) prev(); else return;
      if (cur !== t) goTimer = setTimeout(step, 140);
    };
    step();
  }

  /* ------------------------------------------------------ input */
  let ptr = null;

  stage.addEventListener('pointerdown', e => {
    if (e.button > 0 || e.target.closest('[data-del],.sb-nav,.sb-add')) return;
    ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, drag: false, dir: 0, i: -1, dx: 0, vx: 0, lx: e.clientX, lt: performance.now(), target: e.target };
  });

  stage.addEventListener('pointermove', e => {
    if (!ptr || e.pointerId !== ptr.id) return;
    const dx = e.clientX - ptr.x, dy = e.clientY - ptr.y;
    if (!ptr.drag) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        const dir = dx < 0 ? 1 : -1;
        if ((dir === 1 && cur < maxCur()) || (dir === -1 && cur > 0)) {
          ptr.drag = true; ptr.dir = dir; ptr.i = dir === 1 ? cur : cur - 1;
          const L = leaves[ptr.i];
          cancelAnimationFrame(L.raf); L.busy = false; L.drag = true;
          try { stage.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        } else { ptr = null; return; }
      } else return;
    }
    const now = performance.now();
    if (now > ptr.lt) ptr.vx = (e.clientX - ptr.lx) / (now - ptr.lt);
    ptr.lx = e.clientX; ptr.lt = now; ptr.dx = dx;
    const span = mode === 'spread' ? pw * 1.1 : pw * 0.95;
    const u = clamp((ptr.dir === 1 ? -dx : dx) / span, 0, 1);
    const L = leaves[ptr.i];
    L.a = ptr.dir === 1 ? u * 180 : 180 - u * 180;
    paint(ptr.i);
  });

  function endPointer(e, cancelled) {
    if (!ptr || (e.pointerId !== undefined && e.pointerId !== ptr.id)) return;
    const p = ptr; ptr = null;
    if (p.drag) {
      const L = leaves[p.i];
      L.drag = false;
      let complete;
      if (cancelled) complete = false;
      else if (p.dir === 1) complete = L.a > 55 || p.vx < -0.45;
      else complete = L.a < 125 || p.vx > 0.45;
      if (p.dir === 1) {
        if (complete) { cur++; animate(p.i, 180, durFor(L.a, 180)); } else animate(p.i, 0, durFor(L.a, 0));
      } else {
        if (complete) { cur--; animate(p.i, 0, durFor(L.a, 0)); } else animate(p.i, 180, durFor(L.a, 180));
      }
      afterMove();
      return;
    }
    if (cancelled) return;
    // a tap
    if (Math.abs(e.clientX - p.x) > 10 || Math.abs(e.clientY - p.y) > 10) return;
    if (p.target.closest('[data-add]')) { openModal(); return; }
    const r = book.getBoundingClientRect();
    if (mode === 'spread') { (e.clientX < r.left + r.width / 2 ? prev : next)(); }
    else { (e.clientX < r.left + pw * 0.3 ? prev : next)(); }
  }
  stage.addEventListener('pointerup', e => endPointer(e, false));
  stage.addEventListener('pointercancel', e => endPointer(e, true));

  // keyboard-activated buttons inside the book (tap is handled on pointerup)
  book.addEventListener('click', e => {
    const add = e.target.closest('[data-add]');
    if (add && e.detail === 0) openModal();
    const del = e.target.closest('[data-del]');
    if (del) removeDrawing(del.getAttribute('data-del'));
  });

  // scroll wheel / trackpad turns the page; at the ends the page scrolls normally
  // the book only captures the wheel once it is (almost) fully on screen and the visitor
  // has scrolled the page a little, so the page itself scrolls normally first
  function engaged(minFrac) {
    const r = stage.getBoundingClientRect();
    const vis = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
    if (vis / r.height < minFrac) return false;
    const maxScroll = document.documentElement.scrollHeight - innerHeight;
    return scrollY > 30 || maxScroll <= 30;
  }
  let wacc = 0, wlock = 0, wtimer = 0;
  stage.addEventListener('wheel', e => {
    let d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (e.deltaMode === 1) d *= 16;
    if (!d) return;
    const dir = d > 0 ? 1 : -1;
    if (dir === 1 ? cur >= maxCur() : cur <= 0) return;
    if (!engaged(0.9)) return;
    e.preventDefault();
    const now = performance.now();
    if (now < wlock) return;
    wacc += d; clearTimeout(wtimer); wtimer = setTimeout(() => { wacc = 0; }, 160);
    if (Math.abs(wacc) > 40) { wacc = 0; wlock = now + (reduce ? 0 : 560); dir === 1 ? next() : prev(); }
  }, { passive: false });

  document.addEventListener('keydown', e => {
    if (!$('#sbModal').hidden) { if (e.key === 'Escape') closeModal(); return; }
    if (e.target.closest && e.target.closest('input,select,textarea')) return;
    if (!engaged(0.5)) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { if (next()) e.preventDefault(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { if (prev()) e.preventDefault(); }
  });
  btnPrev.addEventListener('click', prev);
  btnNext.addEventListener('click', next);

  document.querySelectorAll('.sb-chip').forEach(b => b.addEventListener('click', () => setFilter(b.dataset.filter)));
  function setFilter(f) {
    filter = f;
    document.querySelectorAll('.sb-chip').forEach(b => b.classList.toggle('active', b.dataset.filter === f));
    cur = 0; build();
  }

  let rt = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      const s = measure();
      if (s.m !== mode) { cur = 0; applySize(s); build(); }
      else { applySize(s); leaves.forEach((_, i) => paint(i)); afterMove(true); }
    }, 120);
  });

  /* ------------------------------------------------------ upload */
  const modal = $('#sbModal'), drop = $('#sbDrop'), fileIn = $('#sbFile'), queueEl = $('#sbQueue'), saveBtn = $('#sbSave');
  let queue = [];

  let unlocked = false;
  function openModal() { // password first, same as the other pages
    if (unlocked) return showSheet();
    AGMOwner.gate('Enter the password to add or remove artwork.', () => { unlocked = true; showSheet(); });
  }
  function showSheet() {
    modal.hidden = false; document.body.style.overflow = 'hidden';
    setTimeout(() => drop.focus(), 30);
  }
  function closeModal() {
    unlocked = false;
    modal.hidden = true; document.body.style.overflow = '';
    queue.forEach(q => URL.revokeObjectURL(q.url)); queue = []; renderQueue(); fileIn.value = '';
  }
  AGMOwner.plusButton('Add artwork (owner only)', openModal);
  modal.addEventListener('click', e => { if (e.target === modal || e.target.closest('[data-close]')) closeModal(); });

  drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileIn.click(); } });
  fileIn.addEventListener('change', () => { addFiles(fileIn.files); fileIn.value = ''; });
  ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => addFiles(e.dataTransfer.files));

  function addFiles(files) {
    const med = filter === 'all' ? 'drawings' : filter;
    Array.from(files).filter(f => f.type.startsWith('image/')).forEach(f => {
      queue.push({
        file: f, url: URL.createObjectURL(f), medium: med, year: String(new Date().getFullYear()),
        title: f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim()
      });
    });
    renderQueue();
  }

  function renderQueue() {
    queueEl.textContent = '';
    queue.forEach((q, i) => {
      const li = document.createElement('li'); li.className = 'sb-item';
      li.innerHTML = `<img src="${q.url}" alt=""><div class="sb-fields">
        <input class="full" type="text" placeholder="Title" maxlength="60" value="${esc(q.title)}" aria-label="Title">
        <select aria-label="Category">${Object.keys(LABEL).map(k => `<option value="${k}"${k === q.medium ? ' selected' : ''}>${LABEL[k]}</option>`).join('')}</select>
        <input type="text" inputmode="numeric" maxlength="4" placeholder="Year" value="${esc(q.year)}" aria-label="Year"></div>
        <button class="sb-rm" type="button" aria-label="Remove from list">&times;</button>`;
      const [t, y] = li.querySelectorAll('input'), s = li.querySelector('select');
      t.addEventListener('input', () => { q.title = t.value; });
      y.addEventListener('input', () => { q.year = y.value; });
      s.addEventListener('change', () => { q.medium = s.value; });
      li.querySelector('.sb-rm').addEventListener('click', () => { URL.revokeObjectURL(q.url); queue.splice(i, 1); renderQueue(); });
      queueEl.append(li);
    });
    saveBtn.disabled = queue.length === 0;
  }

  async function processFile(file) { // the original file is stored untouched (no resizing, no recompression)
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('decode')); im.src = url; });
      return { blob: file, w: img.naturalWidth, h: img.naturalHeight };
    } finally { URL.revokeObjectURL(url); }
  }

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
    const added = []; let failed = 0;
    for (const q of queue) {
      try {
        const { blob, w, h } = await processFile(q.file);
        const rec = {
          id: 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
          blob, w, h, title: q.title.trim(), medium: q.medium, year: (q.year || '').trim().slice(0, 4), created: Date.now() + added.length
        };
        await DB.put(rec);
        rec.url = URL.createObjectURL(blob);
        added.push(rec);
      } catch (err) { failed++; }
    }
    saveBtn.textContent = 'Add to sketchbook';
    closeModal();
    if (added.length) {
      drawings.push(...added);
      if (filter !== 'all') { filter = 'all'; document.querySelectorAll('.sb-chip').forEach(b => b.classList.toggle('active', b.dataset.filter === 'all')); }
      build();
      const idx = visible().indexOf(added[0]);
      goTo(targetFor(idx));
      toast(added.length === 1 ? 'Added to your sketchbook' : `${added.length} pieces added`);
    }
    if (failed) toast(`${failed} file${failed > 1 ? 's' : ''} could not be read`);
    if (added.length && !DB.db) toast('Saved for this visit only (browser storage is off)');
  });

  // which "current" value shows body page b
  function targetFor(b) {
    if (mode === 'spread') {
      const fi = 2 + b, k = Math.floor(fi / 2);
      return fi % 2 === 0 ? k : k + 1;
    }
    return 1 + b;
  }

  async function removeDrawing(id) {
    const d = drawings.find(x => x.id === id);
    if (!d) return;
    if (!unlocked) { AGMOwner.gate('Enter the password to remove artwork.', () => { unlocked = true; removeDrawing(id); }); return; }
    if (!confirm(`Remove "${d.title || 'this artwork'}" from the sketchbook?`)) return;
    await DB.del(id);
    URL.revokeObjectURL(d.url);
    drawings = drawings.filter(x => x.id !== id);
    build(); toast('Artwork removed');
  }

  let toastT = 0;
  function toast(msg) {
    let t = $('.sb-toast');
    if (!t) { t = div('sb-toast'); t.setAttribute('role', 'status'); document.body.append(t); }
    t.textContent = msg; void t.offsetWidth; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* ------------------------------------------------------ init */
  (async function init() {
    applySize(measure());
    await DB.open();
    try {
      const rows = await DB.all();
      drawings = rows.sort((a, b) => a.created - b.created).map(r => ({ ...r, medium: normMedium(r.medium), url: URL.createObjectURL(r.blob) }));
    } catch (e) { drawings = []; }
    build();
  })();
})();
