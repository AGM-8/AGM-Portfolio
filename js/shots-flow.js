/* =========================================================
   Shots — horizontal cover-flow of video cards + the owner "+" (Google Drive video links)
   Videos come from Drive links listed in shots.html (AGM_DRIVE_LINKS) plus the ones added with "+" (this browser only).
   ========================================================= */
(function () {
  "use strict";
  var root = document.getElementById("sf"); if (!root) return;
  var stage = root.querySelector(".sf-stage"), countEl = root.querySelector(".sf-count");
  var prevB = root.querySelector(".sf-prev"), nextB = root.querySelector(".sf-next");
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var TINTS = [["#5a78b8", "#1a1f38"], ["#6b86c4", "#232b50"], ["#4a6191", "#151a30"], ["#7d96d0", "#1f2540"], ["#3b4f82", "#0d0d14"]];
  var cards = [], items = [], pos = 0, target = 0, W = 560, STEP = 0.8, raf = 0, last = 0, seq = 0;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function measure() {
    var w = stage.clientWidth;
    W = clamp(Math.round(w * (w < 700 ? 0.7 : 0.36)), 240, 600);
    stage.style.setProperty("--W", W + "px"); start();
  }

  /* ---- build the cards ---- */
  function placeholders() {
    var out = []; for (var i = 0; i < 5; i++) out.push({ title: "Add video", meta: "Tap + to add", ph: true });
    return out;
  }
  function build(list) {
    stage.querySelectorAll(".sf-card").forEach(function (n) { n.remove(); });
    cards = []; items = list.length ? list : placeholders();
    items.forEach(function (it, i) {
      var c = document.createElement("figure"), t = TINTS[i % TINTS.length];
      c.className = "sf-card"; c.style.setProperty("--g1", t[0]); c.style.setProperty("--g2", t[1]);
      c.innerHTML = (it.poster ? '<img alt="" draggable="false" loading="lazy">' : "") +
        '<div class="sf-play"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg></div>' +
        '<div class="sf-cap"><b></b><small></small></div><div class="sf-dim"></div>';
      var im = c.querySelector("img"); if (im) { im.onerror = function () { im.remove(); }; im.src = it.poster; }
      c.querySelector("b").textContent = it.title; c.querySelector("small").textContent = it.meta || "";
      stage.appendChild(c); cards.push(c);
    });
    target = clamp(Math.round(target), 0, items.length - 1); pos = clamp(pos, 0, items.length - 1);
    start();
  }

  /* ---- cover-flow layout (time based, so it feels the same on any screen) ---- */
  function layout() {
    cards.forEach(function (c, i) {
      var d = i - pos, a = Math.abs(d), s = d < 0 ? -1 : 1;
      var x = (a <= 1 ? STEP * a : STEP + 0.5 * (a - 1)) * W * s;
      var sc = 1 - Math.min(a, 3) * 0.17, op = a < 2.2 ? 1 : Math.max(0, 1 - (a - 2.2) * 1.2);
      c.style.transform = "translate(-50%,-50%) translateX(" + x.toFixed(1) + "px) scale(" + sc.toFixed(3) + ")";
      c.style.opacity = op.toFixed(3); c.style.zIndex = String(100 - Math.round(a * 10));
      c.querySelector(".sf-dim").style.opacity = Math.min(a * 0.32, 0.72).toFixed(3);
      c.classList.toggle("on", a < 0.5); c.style.pointerEvents = op < 0.05 ? "none" : "";
      c.setAttribute("aria-hidden", a < 0.5 ? "false" : "true");
    });
    var n = items.length && !items[0].ph ? items.length : 0, idx = Math.round(pos) + 1;
    countEl.textContent = n ? (idx < 10 ? "0" + idx : idx) + " / " + (n < 10 ? "0" + n : n) : "";
    prevB.disabled = Math.round(target) <= 0; nextB.disabled = Math.round(target) >= items.length - 1;
  }
  function frame(now) {
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016; last = now;
    pos += (target - pos) * (reduce ? 1 : 1 - Math.exp(-dt * 9));
    if (Math.abs(target - pos) < 0.001) pos = target;
    layout();
    if (pos !== target || dragging) raf = requestAnimationFrame(frame); else { raf = 0; last = 0; }
  }
  function start() { if (!raf) raf = requestAnimationFrame(frame); }
  function go(i) { target = clamp(Math.round(i), 0, items.length - 1); start(); }

  /* ---- input: drag / swipe, arrows, keys, wheel, click ---- */
  var dragging = false, down = false, sx = 0, sp = 0, moved = false;
  stage.addEventListener("pointerdown", function (e) { if (e.button > 0) return; down = true; moved = false; sx = e.clientX; sp = target; });
  window.addEventListener("pointermove", function (e) {
    if (!down) return; var dx = e.clientX - sx;
    if (!moved && Math.abs(dx) > 6) { moved = true; dragging = true; stage.classList.add("dragging"); }
    if (moved) { target = clamp(sp - dx / (W * STEP), 0, items.length - 1); start(); }
  });
  function release(e, ok) {
    if (!down) return; down = false;
    if (moved) { dragging = false; stage.classList.remove("dragging"); go(target); return; }
    if (!ok) return;
    var c = e.target.closest && e.target.closest(".sf-card"); if (!c) return;
    var i = cards.indexOf(c); if (i < 0) return;
    if (i === Math.round(target)) open(i); else go(i);
  }
  window.addEventListener("pointerup", function (e) { release(e, true); });
  window.addEventListener("pointercancel", function (e) { release(e, false); });
  prevB.addEventListener("click", function () { go(Math.round(target) - 1); });
  nextB.addEventListener("click", function () { go(Math.round(target) + 1); });
  stage.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") { e.preventDefault(); go(Math.round(target) - 1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); go(Math.round(target) + 1); }
    else if (e.key === "Enter") { e.preventDefault(); open(Math.round(target)); }
  });
  var wt = 0;
  stage.addEventListener("wheel", function (e) {
    var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : 0; if (!d) return;   // horizontal scroll only; vertical still scrolls the page
    e.preventDefault(); target = clamp(target + d / (W * 0.9), 0, items.length - 1); start();
    clearTimeout(wt); wt = setTimeout(function () { go(target); }, 120);
  }, { passive: false });
  window.addEventListener("resize", measure);
  if (window.ResizeObserver) new ResizeObserver(measure).observe(stage);

  /* ---- video viewer (Drive's own player, so sound and full screen just work) ---- */
  var viewer = document.createElement("div");
  viewer.className = "ec-modal ec-viewer"; viewer.hidden = true;
  viewer.innerHTML = '<div class="ec-card" role="dialog" aria-modal="true" aria-label="Video player"><button class="ec-x" type="button" data-close aria-label="Close">×</button><div class="ec-frame"></div><h2></h2><p></p></div>';
  document.body.appendChild(viewer);
  function closeViewer() { viewer.hidden = true; viewer.querySelector(".ec-frame").innerHTML = ""; document.documentElement.classList.remove("ec-lock"); }
  viewer.addEventListener("mousedown", function (e) { if (e.target === viewer) closeViewer(); });
  viewer.querySelector("[data-close]").addEventListener("click", closeViewer);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !viewer.hidden) closeViewer(); });
  function open(i) {
    var it = items[i]; if (!it || it.ph) return;
    var f = document.createElement("iframe"); f.src = it.embed; f.allow = "autoplay; fullscreen"; f.allowFullscreen = true; f.title = it.title;
    var fr = viewer.querySelector(".ec-frame"); fr.innerHTML = ""; fr.appendChild(f);
    viewer.querySelector("h2").textContent = it.title; viewer.querySelector("p").textContent = it.meta || "";
    viewer.hidden = false; document.documentElement.classList.add("ec-lock");
  }

  /* ---- videos from Google Drive links ---- */
  AGMOwner.init({
    page: "shots-videos", noun: "Drive links", title: "Add shots from Google Drive", button: "Add link", aria: "Add shots (owner only)", titleFromFile: false,
    note: 'Paste a Google Drive <b>video</b> or <b>folder of videos</b> link, shared as “Anyone with the link”. You can add as many links as you like.',
    validate: AGMOwner.driveCheck,
    permanent: "To show them to every visitor, add the link to <code>AGM_DRIVE_LINKS</code> in <code>shots.html</code>.",
    fields: AGMOwner.driveFields([{ name: "meta", label: "Genre line", optional: true, placeholder: "Sci-fi & Action" }]),
    render: function (recs) {
      var me = ++seq;
      AGMDrive.expand(AGMDrive.permanent().concat(recs), AGMDrive.isVideo).then(function (found) {
        if (me !== seq) return;
        build(found.map(function (x) {
          return { title: x.single && x.rec.title ? x.rec.title : (AGMDrive.clean(x.file.name) || x.rec.title || "Untitled"), meta: x.rec.meta || (x.single ? "" : x.rec.title || ""),
                   poster: AGMDrive.thumb(x.file.id, 1000), embed: AGMDrive.preview(x.file.id) };
        }));
      });
    }
  });

  measure(); build([]); pos = target = 0; layout();
})();
