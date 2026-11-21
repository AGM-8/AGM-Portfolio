/* WheelCarousel — vanilla port of the Componentry wheel carousel.
   Cards sit on a large circle; drag, swipe, use the arrows / arrow keys, or click a card to rotate it to the front.
   Clicking the front card opens its page.
   Usage: AGMWheel.init(document.getElementById("wheel"), { start: 0 })  */
(function () {
  function init(root, opts) {
    var o = Object.assign({ start: 0, radius: 2.8, spacing: 1.12 }, opts || {});
    var items = [].slice.call(root.querySelectorAll(".wheel-item"));
    var n = items.length;
    if (!n) return;

    var capEl = root.querySelector(".wheel-caption");
    var labelEl = root.querySelector(".wheel-label");
    var descEl = root.querySelector(".wheel-desc-text");
    var openEl = root.querySelector(".wheel-open");
    var countEl = root.querySelector(".wheel-count");

    var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    var cardW = 300, pos = o.start, target = o.start, raf = 0, lastIdx = -1;

    function pad(v) { return v < 10 ? "0" + v : "" + v; }
    function mod(v) { return ((v % n) + n) % n; }
    function wrap(d) { d = mod(d); return d > n / 2 ? d - n : d; }

    function measure() { cardW = items[0].offsetWidth || 300; render(); }

    function render() {
      var R = cardW * o.radius;
      var step = (cardW * o.spacing) / R;
      for (var i = 0; i < n; i++) {
        var el = items[i];
        var d = wrap(i - pos), ad = Math.abs(d), a = d * step;
        var x = R * Math.sin(a), y = R * (1 - Math.cos(a));
        var s = 1 - 0.07 * Math.min(ad, 3);
        var op = Math.max(0, 1 - 0.28 * ad);
        el.style.transform = "translate(-50%,-50%) translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px) rotate(" + a.toFixed(4) + "rad) scale(" + s.toFixed(3) + ")";
        el.style.opacity = op.toFixed(3);
        el.style.zIndex = String(100 - Math.round(ad * 10));
        el.style.pointerEvents = op < 0.05 ? "none" : "auto";
        var active = ad < 0.5;
        el.classList.toggle("is-active", active);
        el.tabIndex = active ? 0 : -1;
      }
      updateCaption();
    }

    function updateCaption() {
      var idx = mod(Math.round(pos));
      if (idx === lastIdx) return;
      lastIdx = idx;
      var it = items[idx];
      labelEl.textContent = it.getAttribute("data-label") || "";
      descEl.textContent = it.getAttribute("data-desc") || "";
      openEl.setAttribute("href", it.getAttribute("href"));
      countEl.textContent = pad(idx + 1) + " / " + pad(n);
      capEl.classList.remove("swap"); void capEl.offsetWidth; capEl.classList.add("swap");
    }

    function tick() {
      var diff = target - pos;
      if (Math.abs(diff) < 0.0008) { pos = target; render(); raf = 0; return; }
      pos += diff * 0.14;
      render();
      raf = requestAnimationFrame(tick);
    }
    function go(t) {
      target = t;
      if (reduce) { pos = target; render(); return; }
      if (!raf) raf = requestAnimationFrame(tick);
    }
    function goTo(i) { var cur = Math.round(target); go(cur + wrap(i - cur)); }
    function stepBy(k) { go(Math.round(target) + k); }

    /* ---- drag / swipe (window listeners so link clicks still work) ---- */
    var active = false, dragging = false, sx = 0, sp = 0, lastPos = 0, lastT = 0, vel = 0, justDragged = false;

    root.addEventListener("pointerdown", function (e) {
      if (e.button > 0 || e.target.closest(".wheel-ui")) return;
      active = true; dragging = false; sx = e.clientX; sp = pos; lastPos = pos; lastT = performance.now(); vel = 0;
    });
    window.addEventListener("pointermove", function (e) {
      if (!active) return;
      var dx = e.clientX - sx;
      if (!dragging && Math.abs(dx) > 6) { dragging = true; root.classList.add("dragging"); if (raf) { cancelAnimationFrame(raf); raf = 0; } }
      if (!dragging) return;
      pos = sp - dx / (cardW * o.spacing);
      target = pos;
      var now = performance.now();
      if (now > lastT) vel = (pos - lastPos) / (now - lastT);
      lastPos = pos; lastT = now;
      render();
    });
    function release() {
      if (!active) return;
      active = false;
      if (dragging) {
        dragging = false; root.classList.remove("dragging");
        justDragged = true; setTimeout(function () { justDragged = false; }, 60);
        go(Math.round(pos + vel * 140));
      }
    }
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", function () { if (active && dragging) { release(); } else { active = false; } });
    root.addEventListener("dragstart", function (e) { e.preventDefault(); });

    /* ---- click: front card opens its page, any other card rotates to the front ---- */
    root.addEventListener("click", function (e) {
      var a = e.target.closest(".wheel-item");
      if (!a) return;
      if (justDragged) { e.preventDefault(); return; }
      var i = items.indexOf(a);
      if (wrap(i - Math.round(target)) !== 0) { e.preventDefault(); goTo(i); }
    });

    /* ---- horizontal trackpad swipe (vertical scrolling is left alone) ---- */
    var wheelTimer = 0;
    root.addEventListener("wheel", function (e) {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      target += e.deltaX / 320;
      if (reduce) { pos = target; render(); } else if (!raf) { raf = requestAnimationFrame(tick); }
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(function () { go(Math.round(target)); }, 140);
    }, { passive: false });

    /* ---- keyboard + buttons ---- */
    root.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { e.preventDefault(); stepBy(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); stepBy(1); }
    });
    root.querySelector(".wheel-prev").addEventListener("click", function () { stepBy(-1); });
    root.querySelector(".wheel-next").addEventListener("click", function () { stepBy(1); });

    window.addEventListener("resize", measure);
    measure();

    // spin-in on load
    if (!reduce) { pos = o.start - 2; render(); go(o.start); }
  }

  window.AGMWheel = { init: init };
})();
