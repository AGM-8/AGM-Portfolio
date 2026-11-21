/* MagneticDock — vanilla port of the Componentry magnetic dock (glass variant, placed top-right).
   Icons grow toward the cursor with spring motion; a label appears under the icon you point at;
   a small dot marks the page you are on.
   To add / rename / reorder a button, edit the ITEMS list below. Each page's <body data-page="..."> value
   decides which button is marked active. */
(function () {
  /* ---- Settings ---- */
  var MAX_SCALE = 1.5;        // size of the icon right under the cursor (1 = no magnify)
  var MAGNETIC_DISTANCE = 150; // px (measured for a 56px icon; scales with icon size)
  var STIFFNESS = 0.2, DAMPING = 0.7;  // spring feel

  /* ---- Buttons (edit here) ---- */
  var ICON = {
    home:        '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    shots:       '<rect x="2.5" y="6" width="13" height="12" rx="2.5"/><path d="m15.5 10.5 6-3.5v10l-6-3.5"/>',
    photography: '<path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="3.5"/>',
    edits:       '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M20 4 8.1 15.9"/><path d="M14.5 14.5 20 20"/><path d="M8.1 8.1 12 12"/>',
    scripts:     '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/>',
    artwork:     '<path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
    about:       '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    contact:     '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 7 8.5 6 8.5-6"/>'
  };
  var ITEMS = [
    { id: "home",        label: "Home",            href: "home.html" },
    { id: "shots",       label: "Shots",           href: "shots.html" },
    { id: "photography", label: "Photography",     href: "photography.html" },
    { id: "edits",       label: "Cinematic Edits", href: "cinematic-edits.html" },
    { id: "scripts",     label: "Scripts",         href: "scripts.html" },
    { id: "artwork",     label: "Artwork",         href: "artwork.html" },
    { id: "about",       label: "About",           href: "about.html" },
    { id: "contact",     label: "Contact",         href: "contact.html" }
  ];

  var TILES = { // each icon tile uses a shade from the site's blue palette
    home: ["#6b86c4", "#2c3a66"], shots: ["#5a78b8", "#222a4d"], photography: ["#7d96d0", "#2e3a66"],
    edits: ["#4a6191", "#1c2344"], scripts: ["#6b86c4", "#232b50"], artwork: ["#8fa6d6", "#33406e"],
    about: ["#7d96d0", "#283258"], contact: ["#4a6191", "#1f2745"]
  };

  function init() {
    var nav = document.querySelector(".nav");
    if (!nav) return;
    var current = document.body.getAttribute("data-page");
    var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    var n = ITEMS.length;

    var dock = document.createElement("nav");
    dock.className = "dock";
    dock.setAttribute("aria-label", "Pages");
    var tip = document.createElement("div");
    tip.className = "dock-tip"; tip.setAttribute("aria-hidden", "true");

    var els = ITEMS.map(function (it) {
      var a = document.createElement("a");
      a.className = "dock-item";
      a.href = it.href;
      a.setAttribute("aria-label", it.label);
      if (it.id === current) a.setAttribute("aria-current", "page");
      var t = TILES[it.id] || TILES.home;
      a.style.setProperty("--t1", t[0]); a.style.setProperty("--t2", t[1]);
      a.innerHTML = '<span class="dock-icon"><svg viewBox="0 0 24 24" aria-hidden="true">' + ICON[it.id] + '</svg></span><i class="dock-dot"></i>';
      dock.appendChild(a);
      return a;
    });
    dock.appendChild(tip);
    nav.appendChild(dock);

    /* ---- spring state ---- */
    var S = [], X = [], VS = [], VX = [], tS = [], tX = [];
    for (var i = 0; i < n; i++) { S[i] = 1; X[i] = 0; VS[i] = 0; VX[i] = 0; tS[i] = 1; tX[i] = 0; }
    var raf = 0, size = 40, gap = 6, base = [], hot = -1;

    function measure() {
      size = els[0].offsetWidth || 40;
      base = els.map(function (e) { return e.offsetLeft + e.offsetWidth / 2; });
      gap = n > 1 ? base[1] - base[0] - size : 6;
    }

    function setTargets(cx) { // cx = cursor x in dock coordinates, or null to rest
      if (cx === null || reduce) {
        for (var i = 0; i < n; i++) { tS[i] = 1; tX[i] = 0; }
        hot = -1; tip.classList.remove("show"); start(); return;
      }
      var dist = MAGNETIC_DISTANCE * (size / 56), sum = 0;
      for (var j = 0; j < n; j++) {
        var d = Math.min(Math.abs(cx - base[j]) / dist, 1);
        tS[j] = 1 + (MAX_SCALE - 1) * 0.5 * (1 + Math.cos(Math.PI * d));
        sum += size * tS[j];
      }
      // spread the extra width around the cursor so the row grows outward from it
      var w0 = n * size + (n - 1) * gap, w = sum + (n - 1) * gap;
      var first = els[0].offsetLeft;
      var frac = Math.max(0, Math.min(1, (cx - first) / w0));
      var left = first - (w - w0) * frac, run = left;
      var best = 0, bestD = 1e9;
      for (var k = 0; k < n; k++) {
        var wk = size * tS[k];
        tX[k] = run + wk / 2 - base[k];
        run += wk + gap;
        var dd = Math.abs(cx - base[k]);
        if (dd < bestD) { bestD = dd; best = k; }
      }
      hot = best;
      start();
    }

    function placeTip() {
      if (hot < 0) { tip.classList.remove("show"); return; }
      var it = ITEMS[hot];
      if (tip.textContent !== it.label) tip.textContent = it.label;
      var cxp = base[hot] + X[hot];
      var half = tip.offsetWidth / 2, dr = dock.getBoundingClientRect();
      var minL = half + 8 - dr.left, maxL = window.innerWidth - half - 8 - dr.left;
      tip.style.left = Math.max(minL, Math.min(maxL, cxp)).toFixed(1) + "px";
      tip.style.top = (dock.offsetHeight - 6 + size * (S[hot] - 1) + 14).toFixed(1) + "px";
      tip.classList.add("show");
    }

    var last = 0;
    function frame(now) {
      // spring advances by real elapsed time, so it feels the same on slow or fast screens
      var steps = last ? Math.max(1, Math.min(8, Math.round((now - last) / 16.67))) : 1;
      last = now;
      var moving = false;
      for (var i = 0; i < n; i++) {
        for (var q = 0; q < steps; q++) {
          VS[i] = (VS[i] + (tS[i] - S[i]) * STIFFNESS) * DAMPING; S[i] += VS[i];
          VX[i] = (VX[i] + (tX[i] - X[i]) * STIFFNESS) * DAMPING; X[i] += VX[i];
        }
        if (Math.abs(VS[i]) > 0.0004 || Math.abs(tS[i] - S[i]) > 0.0008 || Math.abs(VX[i]) > 0.02 || Math.abs(tX[i] - X[i]) > 0.05) moving = true;
        else { S[i] = tS[i]; X[i] = tX[i]; }
        els[i].style.transform = "translateX(" + X[i].toFixed(2) + "px) scale(" + S[i].toFixed(4) + ")";
        els[i].style.zIndex = String(10 + Math.round((S[i] - 1) * 20));
      }
      // stretch the glass pill to follow the outermost icons
      var l0 = base[0] - size / 2, r0 = base[n - 1] + size / 2;
      var l1 = base[0] + X[0] - S[0] * size / 2, r1 = base[n - 1] + X[n - 1] + S[n - 1] * size / 2;
      dock.style.setProperty("--exl", Math.max(0, l0 - l1).toFixed(1) + "px");
      dock.style.setProperty("--exr", Math.max(0, r1 - r0).toFixed(1) + "px");
      placeTip();
      if (moving) raf = requestAnimationFrame(frame); else { raf = 0; last = 0; }
    }
    function start() { if (!raf) raf = requestAnimationFrame(frame); }

    /* ---- input ---- */
    dock.addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch") return;
      measure();
      setTargets(e.clientX - dock.getBoundingClientRect().left);
    });
    dock.addEventListener("pointerleave", function (e) { if (e.pointerType !== "touch") setTargets(null); });
    dock.addEventListener("focusin", function (e) {
      var i = els.indexOf(e.target.closest(".dock-item"));
      if (i < 0) return;
      measure(); setTargets(base[i]);
    });
    dock.addEventListener("focusout", function () { setTargets(null); });
    window.addEventListener("resize", function () { measure(); setTargets(null); });
    measure();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
