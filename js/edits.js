/* =========================================================
   Cinematic Edits — liquid glass carousel + owner-only "+" panel
   • The carousel shows the videos listed in window.AGM_EDITS (set in cinematic-edits.html)
     plus any you add with the "+" button (saved in this browser).
   • Drag / swipe / arrows to move. Tap the centre panel to watch it big, with sound.
   ========================================================= */
(function () {
  "use strict";

  /* ---------------- Settings ---------------- */
  var PASS_HASH = "c1478e6ee33661a477b4272c853233478a1f61c94cb0fbb73dc0c72fa780024c"; // SHA-256 of the owner password — the password itself is never written in the site files
  var SALT = "agm::";
  var GAP = 18, MIN_SLOTS = 7;
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------- Helpers ---------------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return [].slice.call((r || document).querySelectorAll(s)); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function mod(v, m) { return ((v % m) + m) % m; }
  function pad(v) { return v < 10 ? "0" + v : "" + v; }

  /* compact SHA-256 (works on file:// too, where crypto.subtle may be unavailable) */
  function sha256(ascii) {
    function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
    var mathPow = Math.pow, maxWord = mathPow(2, 32), i, j, result = "";
    var words = [], bitLen = ascii.length * 8, hash = [], k = [], pc = 0, comp = {};
    for (var c = 2; pc < 64; c++) {
      if (!comp[c]) {
        for (i = 0; i < 313; i += c) comp[i] = c;
        hash[pc] = (mathPow(c, 0.5) * maxWord) | 0;
        k[pc++] = (mathPow(c, 1 / 3) * maxWord) | 0;
      }
    }
    ascii += "\x80";
    while (ascii.length % 64 - 56) ascii += "\x00";
    for (i = 0; i < ascii.length; i++) {
      j = ascii.charCodeAt(i);
      if (j >> 8) return "";
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = (bitLen / maxWord) | 0;
    words[words.length] = bitLen;
    for (j = 0; j < words.length;) {
      var w = words.slice(j, j += 16), old = hash;
      hash = hash.slice(0, 8);
      for (i = 0; i < 64; i++) {
        var w15 = w[i - 15], w2 = w[i - 2], a = hash[0], e = hash[4];
        var t1 = hash[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & hash[5]) ^ (~e & hash[6])) + k[i] +
          (w[i] = (i < 16) ? w[i] : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
        var t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(t1 + t2) | 0].concat(hash);
        hash[4] = (hash[4] + t1) | 0;
      }
      for (i = 0; i < 8; i++) hash[i] = (hash[i] + old[i]) | 0;
    }
    for (i = 0; i < 8; i++) for (j = 3; j + 1; j--) { var b = (hash[i] >> (j * 8)) & 255; result += (b < 16 ? 0 : "") + b.toString(16); }
    return result;
  }

  /* ---------------- Links: YouTube / Vimeo / direct video file ---------------- */
  function parseLink(u) {
    u = (u || "").trim();
    if (!/^https?:\/\//i.test(u)) return null;
    var m = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/i);
    if (m) return { kind: "youtube", embed: "https://www.youtube-nocookie.com/embed/" + m[1] + "?autoplay=1&rel=0", thumb: "https://i.ytimg.com/vi/" + m[1] + "/hqdefault.jpg" };
    m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
    if (m) return { kind: "vimeo", embed: "https://player.vimeo.com/video/" + m[1] + "?autoplay=1", thumb: "" };
    var dv = window.AGMDrive && AGMDrive.parse(u);
    if (dv && dv.kind === "file") return { kind: "drive", embed: AGMDrive.preview(dv.id), thumb: AGMDrive.thumb(dv.id, 960) };
    if (/\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i.test(u)) return { kind: "video", src: u };
    return null;
  }

  /* ---------------- Browser storage for videos you add (IndexedDB) ---------------- */
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      if (!window.indexedDB) { rej(new Error("This browser can't store videos.")); return; }
      var r = indexedDB.open("agm-cinematic-edits", 1);
      r.onupgradeneeded = function () { r.result.createObjectStore("edits", { keyPath: "id" }); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  function tx(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction("edits", mode), req = fn(t.objectStore("edits"));
        t.oncomplete = function () { res(req && req.result); };
        t.onerror = t.onabort = function () { rej(t.error || new Error("Storage error")); };
      });
    });
  }
  var dbAll = function () { return tx("readonly", function (s) { return s.getAll(); }); };
  var dbPut = function (rec) { return tx("readwrite", function (s) { return s.put(rec); }); };
  var dbDel = function (id) { return tx("readwrite", function (s) { return s.delete(id); }); };

  /* ---------------- Items ---------------- */
  var items = [], records = [], blobUrls = [], driveItems = [];

  function fromStatic(e, i) {
    var it = { id: "b" + i, title: e.title || "Untitled", desc: e.desc || "", kind: "video", src: e.src || "", poster: e.poster || "", local: false };
    if (e.link) {
      var p = parseLink(e.link);
      if (p) { it.kind = p.kind; it.src = p.src || ""; it.embed = p.embed || ""; if (!it.poster) it.poster = p.thumb || ""; }
    }
    return it;
  }
  function fromRecord(r) {
    var it = { id: r.id, title: r.title, desc: r.desc || "", kind: "video", src: "", poster: "", local: true, rec: r };
    if (r.kind === "file" && r.blob) {
      it.src = URL.createObjectURL(r.blob); blobUrls.push(it.src);
    } else {
      var p = parseLink(r.url);
      if (p) { it.kind = p.kind; it.src = p.src || ""; it.embed = p.embed || ""; it.poster = p.thumb || ""; }
    }
    if (r.poster) { it.poster = URL.createObjectURL(r.poster); blobUrls.push(it.poster); }
    return it;
  }
  function rebuildItems() {
    blobUrls.forEach(function (u) { URL.revokeObjectURL(u); }); blobUrls = [];
    var built = (window.AGM_EDITS || []).map(fromStatic);
    var isDrive = function (r) { return r.kind === "link" && window.AGMDrive && AGMDrive.parse(r.url); };
    var local = records.filter(function (r) { return !isDrive(r); }).sort(function (a, b) { return a.created - b.created; }).map(fromRecord);
    items = built.concat(driveItems, local);
  }

  /* ---------------- Carousel ---------------- */
  var root = $("#ec"), stage = $(".ec-stage", root), lens = $(".ec-lens", root);
  var capEl = $(".ec-caption", root), labelEl = $(".ec-label", root), descEl = $(".ec-desc", root), countEl = $(".ec-count", root), watchBtn = $(".ec-watch", root), dotsEl = $(".ec-dots", root);
  var slots = [], N = 0, M = 0, loop = false, W = 700;
  var pos = 0, target = 0, prevPos = 0, skew = 0, raf = 0, lastAi = -1, modalOpen = 0;

  function wrapD(d) { d = mod(d, M); return d > M / 2 ? d - M : d; }

  function makePanel(item, idx) {
    var p = el("div", "ec-panel"), media = el("div", "ec-media"), video = null;
    if (item.kind === "video") {
      video = document.createElement("video");
      video.muted = true; video.loop = true; video.playsInline = true; video.preload = "metadata";
      video.setAttribute("muted", ""); video.setAttribute("playsinline", "");
      if (item.poster) video.poster = item.poster;
      video.src = item.src;
      video.addEventListener("loadedmetadata", function () {
        if (video.paused && video.currentTime < 0.05) { try { video.currentTime = Math.min(0.1, (video.duration || 1) / 2); } catch (e) {} }
      });
      video.addEventListener("error", function () { p.classList.add("is-missing"); });
      media.appendChild(video);
    } else {
      p.classList.add("is-embed");
      if (item.poster) {
        var img = new Image(); img.alt = ""; img.draggable = false; img.src = item.poster;
        img.onerror = function () { img.remove(); };
        media.appendChild(img);
      }
    }
    p.appendChild(media);
    p.appendChild(el("span", "ec-dim"));
    p.appendChild(el("span", "ec-glass"));
    p.appendChild(el("div", "ec-play", "<i></i>"));
    var chip = el("span", "ec-chip"); chip.textContent = item.title; p.appendChild(chip);
    p.appendChild(el("div", "ec-missing", "<div>" + (item.local
      ? "This video couldn't be loaded."
      : "Add your video: place the file at<br><code>" + esc(item.src || "assets/edits/…") + "</code><br>or tap the <b>+</b> button (bottom right) to add one.") + "</div>"));
    stage.insertBefore(p, lens);
    return { el: p, i: idx, item: item, video: video };
  }

  function buildSlots() {
    $$(".ec-panel", stage).forEach(function (n) { n.remove(); });
    slots = []; N = items.length; loop = N >= 3;
    var rep = loop ? Math.ceil(MIN_SLOTS / N) : 1; M = N * rep;
    for (var r = 0; r < rep; r++) for (var i = 0; i < N; i++) slots.push(makePanel(items[i], r * N + i));
    root.classList.toggle("single", N <= 1);
    lens.style.display = N ? "" : "none";
    dotsEl.innerHTML = "";
    items.forEach(function (it, i) {
      var b = el("button"); b.type = "button"; b.setAttribute("aria-label", "Show " + it.title);
      b.addEventListener("click", function () { goToItem(i); });
      dotsEl.appendChild(b);
    });
    lastAi = -1;
    measure();
  }

  function measure() { if (slots[0]) W = slots[0].el.offsetWidth || 700; render(); }

  function render() {
    if (!N) { updateCaption(); return; }
    var step = W + GAP;
    for (var s = 0; s < slots.length; s++) {
      var sl = slots[s], d = loop ? wrapD(sl.i - pos) : sl.i - pos, ad = Math.abs(d);
      var sc = 1 - 0.13 * Math.min(ad, 1.4);
      var op = ad > 3.3 ? 0 : 1 - 0.38 * Math.min(ad, 1.6);
      var e = sl.el;
      e.style.transform = "translate(-50%,-50%) translateX(" + (d * step).toFixed(1) + "px) scale(" + sc.toFixed(3) + ") skewX(" + skew.toFixed(2) + "deg)";
      e.style.opacity = op.toFixed(3);
      e.style.zIndex = String(100 - Math.round(ad * 10));
      e.style.visibility = ad > 3.5 ? "hidden" : "visible";
      e.style.setProperty("--dim", (Math.min(ad, 1) * 0.5).toFixed(2));
      e.classList.toggle("is-active", ad < 0.5);
    }
    updateCaption();
  }

  function activeSlotIndex() { var r = Math.round(pos); return loop ? mod(r, M) : Math.max(0, Math.min(N - 1, r)); }

  function updateCaption() {
    if (!N) {
      labelEl.textContent = "No edits yet"; descEl.textContent = "Tap the + button to add your first cinematic edit."; countEl.textContent = ""; watchBtn.style.display = "none"; return;
    }
    var ai = activeSlotIndex();
    if (ai === lastAi) return;
    lastAi = ai;
    var it = items[ai % N];
    labelEl.textContent = it.title; descEl.textContent = it.desc || "";
    countEl.textContent = pad((ai % N) + 1) + " / " + pad(N);
    watchBtn.style.display = "";
    $$("button", dotsEl).forEach(function (b, i) { b.classList.toggle("on", i === ai % N); });
    capEl.classList.remove("swap"); void capEl.offsetWidth; capEl.classList.add("swap");
    syncPlayback();
  }

  function syncPlayback() {
    var a = N ? slots[activeSlotIndex()] : null;
    slots.forEach(function (s) {
      var v = s.video; if (!v) return;
      if (s === a && !reduce && !modalOpen && !document.hidden && !s.el.classList.contains("is-missing")) { var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); }
      else v.pause();
    });
  }

  var lastTs = 0;
  function tick(ts) {
    // glide by real elapsed time so it feels the same on slow or fast screens
    var steps = lastTs ? Math.max(1, Math.min(10, (ts - lastTs) / 16.67)) : 1;
    lastTs = ts;
    var diff = target - pos;
    prevPos = pos;
    if (Math.abs(diff) < 0.0008) { pos = target; skew = 0; render(); raf = 0; lastTs = 0; syncPlayback(); return; }
    pos += diff * (1 - Math.pow(1 - 0.13, steps));
    var v = (pos - prevPos) / steps; skew = Math.max(-7, Math.min(7, -v * 55));
    render();
    raf = requestAnimationFrame(tick);
  }
  function go(t) {
    if (!N) return;
    if (!loop) t = Math.max(0, Math.min(N - 1, t));
    target = t;
    if (reduce) { pos = target; render(); syncPlayback(); return; }
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function stepBy(k) { go(Math.round(target) + k); }
  function goToItem(i) {
    var cur = Math.round(target), d = i - mod(cur, N);
    if (d > N / 2) d -= N; if (d < -N / 2) d += N;
    go(loop ? cur + d : i);
  }

  /* drag / swipe */
  var down = false, dragging = false, sx = 0, sp = 0, lastP = 0, lastT = 0, vel = 0, justDragged = false;
  stage.addEventListener("pointerdown", function (e) {
    if (e.button > 0 || !N) return;
    down = true; dragging = false; sx = e.clientX; sp = pos; lastP = pos; lastT = performance.now(); vel = 0;
  });
  window.addEventListener("pointermove", function (e) {
    if (!down) return;
    var dx = e.clientX - sx;
    if (!dragging && Math.abs(dx) > 6) { dragging = true; stage.classList.add("dragging"); if (raf) { cancelAnimationFrame(raf); raf = 0; lastTs = 0; } }
    if (!dragging) return;
    var np = sp - dx / (W + GAP);
    if (!loop) np = Math.max(-0.35, Math.min(N - 1 + 0.35, np));
    var now = performance.now(), dt = now - lastT;
    if (dt > 0) vel = (np - lastP) / dt;
    lastP = np; lastT = now; skew = Math.max(-7, Math.min(7, -vel * 90));
    pos = target = np; render();
  });
  function release() {
    if (!down) return; down = false;
    if (dragging) {
      dragging = false; stage.classList.remove("dragging"); justDragged = true; setTimeout(function () { justDragged = false; }, 60);
      go(Math.round(pos + vel * 150));
    }
  }
  window.addEventListener("pointerup", release);
  window.addEventListener("pointercancel", release);
  stage.addEventListener("dragstart", function (e) { e.preventDefault(); });

  /* click: centre panel opens the viewer, any other panel glides to the centre */
  stage.addEventListener("click", function (e) {
    if (justDragged) return;
    var pe = e.target.closest(".ec-panel"); if (!pe) return;
    var s = slots.filter(function (x) { return x.el === pe; })[0]; if (!s) return;
    var cur = Math.round(target), d = loop ? wrapD(s.i - cur) : s.i - cur;
    if (d === 0) openViewer(s.item); else go(cur + d);
  });

  var wheelTimer = 0;
  stage.addEventListener("wheel", function (e) {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || !N) return;
    e.preventDefault(); target += e.deltaX / 320; pos = reduce ? target : pos;
    if (!raf && !reduce) raf = requestAnimationFrame(tick); else if (reduce) render();
    clearTimeout(wheelTimer); wheelTimer = setTimeout(function () { go(Math.round(target)); }, 140);
  }, { passive: false });
  stage.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") { e.preventDefault(); stepBy(-1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); stepBy(1); }
    else if (e.key === "Enter" && N) { e.preventDefault(); openViewer(items[activeSlotIndex() % N]); }
  });
  $(".ec-prev", root).addEventListener("click", function () { stepBy(-1); });
  $(".ec-next", root).addEventListener("click", function () { stepBy(1); });
  watchBtn.addEventListener("click", function () { if (N) openViewer(items[activeSlotIndex() % N]); });
  window.addEventListener("resize", measure);
  document.addEventListener("visibilitychange", syncPlayback);

  /* ---------------- Modals ---------------- */
  function openModal(m) { m.hidden = false; document.documentElement.classList.add("ec-lock"); modalOpen++; syncPlayback(); }
  function closeModal(m) {
    if (m.hidden) return;
    m.hidden = true; modalOpen = Math.max(0, modalOpen - 1);
    if (!modalOpen) document.documentElement.classList.remove("ec-lock");
    if (m.id === "ec-viewer") $(".ec-frame", m).innerHTML = "";
    if (m.id === "ec-manage") unlocked = false;
    syncPlayback();
  }
  $$(".ec-modal").forEach(function (m) {
    m.addEventListener("mousedown", function (e) { if (e.target === m) closeModal(m); });
    $$("[data-close]", m).forEach(function (b) { b.addEventListener("click", function () { closeModal(m); }); });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    var open = $$(".ec-modal").filter(function (m) { return !m.hidden; });
    if (open.length) closeModal(open[open.length - 1]);
  });

  /* viewer */
  var viewer = $("#ec-viewer");
  function openViewer(item) {
    var f = $(".ec-frame", viewer); f.innerHTML = "";
    if (item.kind === "video") {
      var v = document.createElement("video");
      v.controls = true; v.autoplay = true; v.playsInline = true; v.preload = "auto";
      if (item.poster) v.poster = item.poster;
      v.src = item.src; f.appendChild(v);
    } else {
      var ifr = document.createElement("iframe");
      ifr.src = item.embed; ifr.title = item.title; ifr.allowFullscreen = true;
      ifr.setAttribute("allow", "autoplay; fullscreen; picture-in-picture; encrypted-media");
      f.appendChild(ifr);
    }
    $("h2", viewer).textContent = item.title; $("p", viewer).textContent = item.desc || "";
    openModal(viewer);
  }

  /* ---------------- Owner access ("+" button) ---------------- */
  var unlocked = false, attempts = 0;
  var gate = $("#ec-gate"), gateForm = $("#ec-gate-form"), gateErr = $("#ec-gate-err"), pw = $("#ec-pw");
  var manage = $("#ec-manage"), form = $("#ec-form"), formErr = $("#ec-form-err"), statusEl = $("#ec-status"), saveBtn = $("#ec-save"), listEl = $("#ec-list");

  function lockLeft() { try { return Math.max(0, Math.ceil((+localStorage.getItem("agm_edit_lock") - Date.now()) / 1000)); } catch (e) { return 0; } }
  $(".ec-add").addEventListener("click", function () {
    gateErr.textContent = ""; pw.value = ""; openModal(gate); setTimeout(function () { pw.focus(); }, 60);
  });
  gateForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var wait = lockLeft();
    if (wait) { gateErr.textContent = "Too many attempts. Try again in " + wait + "s."; return; }
    if (sha256(SALT + pw.value) === PASS_HASH) {
      attempts = 0; pw.value = ""; unlocked = true; closeModal(gate); openManager();
    } else {
      attempts++; pw.value = "";
      if (attempts >= 3) { attempts = 0; try { localStorage.setItem("agm_edit_lock", String(Date.now() + 30000)); } catch (x) {} gateErr.textContent = "Too many attempts. Locked for 30 seconds."; }
      else gateErr.textContent = "Wrong password.";
    }
  });

  function openManager() {
    form.reset(); formErr.textContent = ""; statusEl.textContent = ""; setMode("link"); saveBtn.disabled = false;
    renderList(); openModal(manage); setTimeout(function () { $("#ec-title").focus(); }, 60);
  }
  var mode = "link";
  function setMode(m) {
    mode = m;
    $$(".ec-seg button", manage).forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-mode") === m); });
    $$("[data-pane]", manage).forEach(function (p) { p.hidden = p.getAttribute("data-pane") !== m; });
  }
  $$(".ec-seg button", manage).forEach(function (b) { b.addEventListener("click", function () { setMode(b.getAttribute("data-mode")); }); });

  function renderList() {
    listEl.innerHTML = "";
    if (!records.length) { listEl.appendChild(el("li", "ec-empty-li", "Nothing added yet.")); return; }
    records.slice().sort(function (a, b) { return a.created - b.created; }).forEach(function (r) {
      var li = el("li"), b = el("b"), em = el("em", "", r.kind === "file" ? "file" : "link");
      b.textContent = r.title; li.appendChild(b); li.appendChild(em);
      if (r.kind === "link") {
        var cp = el("button", "ec-mini", "Copy code"); cp.type = "button"; cp.title = "Code line for the permanent list in cinematic-edits.html";
        cp.addEventListener("click", function () {
          var code = '{ title: ' + JSON.stringify(r.title) + ', desc: ' + JSON.stringify(r.desc || "") + ', link: ' + JSON.stringify(r.url) + ' },';
          (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject()).then(function () { cp.textContent = "Copied ✓"; }, function () { window.prompt("Copy this line:", code); });
        });
        li.appendChild(cp);
      }
      var rm = el("button", "ec-mini danger", "Remove"); rm.type = "button";
      rm.addEventListener("click", function () {
        if (!rm.classList.contains("sure")) { rm.classList.add("sure"); rm.textContent = "Sure?"; setTimeout(function () { rm.classList.remove("sure"); rm.textContent = "Remove"; }, 3000); return; }
        if (!unlocked) return;
        dbDel(r.id).then(reload).then(renderList);
      });
      li.appendChild(rm); listEl.appendChild(li);
    });
  }

  function makePoster(file) {
    return new Promise(function (res) {
      var v = document.createElement("video"), u = URL.createObjectURL(file), done = false;
      function finish(b) { if (done) return; done = true; URL.revokeObjectURL(u); res(b || null); }
      v.muted = true; v.preload = "metadata"; v.playsInline = true; v.src = u;
      v.onloadedmetadata = function () { try { v.currentTime = Math.min(1, (v.duration || 2) / 4); } catch (e) { finish(null); } };
      v.onseeked = function () {
        try {
          var w = Math.min(960, v.videoWidth || 960), h = Math.round(w * (v.videoHeight || 540) / (v.videoWidth || 960));
          var c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d").drawImage(v, 0, 0, w, h);
          c.toBlob(finish, "image/jpeg", 0.82);
        } catch (e) { finish(null); }
      };
      v.onerror = function () { finish(null); };
      setTimeout(function () { finish(null); }, 3000); // never hold up saving for long; the video shows its own first frame anyway
    });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!unlocked) return;
    formErr.textContent = "";
    var title = $("#ec-title").value.trim(), desc = $("#ec-desc").value.trim();
    var isDriveLink = mode === "link" && AGMDrive.parse($("#ec-link").value.trim());
    if (!title && !isDriveLink) { formErr.textContent = "Please give your edit a title."; return; }
    var rec = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: title, desc: desc, created: Date.now() };
    var cover = $("#ec-cover").files[0] || null, chain;
    if (mode === "file") {
      var f = $("#ec-file").files[0];
      if (!f) { formErr.textContent = "Choose a video file, or switch to “Paste a link”."; return; }
      if (f.type && f.type.indexOf("video/") !== 0) { formErr.textContent = "That doesn't look like a video file."; return; }
      rec.kind = "file"; rec.blob = f;
      chain = cover ? Promise.resolve(cover) : makePoster(f);
    } else {
      var link = $("#ec-link").value.trim(), p = parseLink(link);
      var dp = AGMDrive.parse(link);
      if (dp && dp.kind === "folder" && !AGMDrive.hasKey()) { formErr.textContent = "Folder links need the API key (js/drive-config.js)."; return; }
      if (!p && !(dp && dp.kind === "folder")) { formErr.textContent = "Paste a Google Drive link (a video or a folder of videos), or a YouTube / Vimeo link."; return; }
      rec.kind = "link"; rec.url = link; chain = Promise.resolve(cover);
    }
    saveBtn.disabled = true; statusEl.textContent = "Saving… large videos can take a moment.";
    chain.then(function (poster) {
      if (poster) rec.poster = poster;
      return dbPut(rec);
    }).then(reload).then(function () {
      statusEl.textContent = "Added ✓";
      setTimeout(function () { closeModal(manage); goToItem(items.length - 1); }, 450);
    }).catch(function (err) {
      saveBtn.disabled = false; statusEl.textContent = "";
      formErr.textContent = /quota/i.test(String(err && (err.name + err.message)))
        ? "Not enough browser storage for this file. Try a smaller file or paste a link instead."
        : "Couldn't save: " + ((err && err.message) || "browser storage is unavailable (private window?)");
    });
  });

  /* ---------------- Google Drive links (a folder of videos, or one video) ---------------- */
  function refreshDrive() {
    var src = AGMDrive.permanent().concat(records.filter(function (r) { return r.kind === "link" && AGMDrive.parse(r.url); }).map(function (r) { return { id: r.id, link: r.url, title: r.title, desc: r.desc }; }));
    return AGMDrive.expand(src, AGMDrive.isVideo).then(function (found) {
      driveItems = found.map(function (x) {
        return { id: "drive:" + x.file.id, title: x.single && x.rec.title ? x.rec.title : (AGMDrive.clean(x.file.name) || x.rec.title || "Untitled"), desc: x.single ? (x.rec.desc || "") : (x.rec.title || ""),
          kind: "drive", src: "", embed: AGMDrive.preview(x.file.id), poster: AGMDrive.thumb(x.file.id, 960), local: !x.rec.permanent, rec: x.rec };
      });
    });
  }

  /* ---------------- Load ---------------- */
  function reload() {
    return dbAll().then(function (r) { records = r || []; }, function () { records = []; }).then(refreshDrive).then(function () {
      var keep = lastAi < 0 ? 0 : lastAi % Math.max(1, N);
      rebuildItems(); buildSlots();
      pos = target = Math.min(keep, Math.max(0, items.length - 1)); lastAi = -1; render(); syncPlayback();
    });
  }

  rebuildItems(); buildSlots(); pos = target = 0; render();
  root.classList.add("in");
  reload().then(function () { try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {} });
})();
