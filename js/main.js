/* =========================================================
   AlpaGanga Movies — shared behaviour
   - Navigation + footer are injected from the two lists below,
     so a menu change only needs editing HERE, once.
   - Plasma background, scroll reveal, filter chips, lightbox.
   ========================================================= */
(function () {
  /* ---- Site name shown at the top of every page (click it to go home) ---- */
  var BRAND = "AlpaGanga Movies";
  var YEAR = new Date().getFullYear();

  var body = document.body;
  var current = body.getAttribute("data-page");

  /* ---- Top bar: just the centred site name, linking back to the home page ---- */
  var navHost = document.getElementById("site-nav");
  if (navHost) {
    navHost.outerHTML =
      '<nav class="nav" aria-label="Main"><a class="nav-brand" href="home.html" aria-label="' + BRAND + ' — home">' + BRAND + "</a></nav>";
    var nav = document.querySelector(".nav");
    var onScroll = function () { nav.classList.toggle("scrolled", window.scrollY > 12); };
    onScroll(); window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---- Footer ---- */
  var footHost = document.getElementById("site-footer");
  if (footHost) {
    footHost.outerHTML =
      '<footer class="footer"><div class="wrap"><span>© ' + YEAR + " " + BRAND + '</span><span>Shots · Photography · Edits · Scripts · Artwork · Music</span></div></footer>';
  }

  /* ---- Plasma background (inner pages are calmer than the landing page) ---- */
  var canvas = document.getElementById("plasma");
  if (canvas && window.AGMPlasma) {
    var landing = current === "intro";
    AGMPlasma.init(canvas, landing ? {
      speed: 1, turbulence: 1, mouseInfluence: 1, grain: 1, sparkle: 1, vignette: 1, opacity: 1, interactive: true,
      darkColorA: "#0d0d14", darkColorB: "#1f2540", darkColorC: "#4a6191"
    } : {
      speed: 0.6, turbulence: 0.8, mouseInfluence: 0.6, grain: 0.6, sparkle: 0.5, vignette: 1, opacity: 1, interactive: true,
      darkColorA: "#0d0d14", darkColorB: "#1f2540", darkColorC: "#4a6191", maxDpr: 1
    });
  }

  /* ---- Word-by-word headline: <h1 data-words>Some text</h1> ---- */
  [].forEach.call(document.querySelectorAll("[data-words]"), function (el) {
    var words = el.textContent.trim().split(/\s+/);
    el.setAttribute("aria-label", words.join(" "));
    el.innerHTML = words.map(function (w, i) {
      return '<span class="w" aria-hidden="true" style="animation-delay:' + (0.15 + i * 0.14) + 's">' + w + "</span>";
    }).join(" ");
  });

  /* ---- Scroll reveal ---- */
  var items = [].slice.call(document.querySelectorAll(".reveal"));
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.08, rootMargin: "0px 0px -40px 0px" });
    items.forEach(function (el, i) { el.style.transitionDelay = (i % 6) * 60 + "ms"; io.observe(el); });
  } else { items.forEach(function (el) { el.classList.add("in"); }); }

  /* ---- Filter chips: <button class="chip" data-filter="tag"> + tiles with data-tags="a b" ---- */
  var chips = [].slice.call(document.querySelectorAll(".chip[data-filter]"));
  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      chips.forEach(function (c) { c.classList.toggle("active", c === chip); });
      var f = chip.getAttribute("data-filter");
      [].forEach.call(document.querySelectorAll("[data-tags]"), function (t) {
        var show = f === "all" || (" " + t.getAttribute("data-tags") + " ").indexOf(" " + f + " ") > -1;
        t.style.display = show ? "" : "none";
      });
    });
  });

  /* ---- Lightbox: any <img> inside .tile-media opens full-size ---- */
  var lb = document.createElement("div");
  lb.className = "lightbox";
  lb.innerHTML = '<button aria-label="Close">×</button><img alt="">';
  if (current !== "intro") document.body.appendChild(lb);
  var lbImg = lb.querySelector("img");
  var close = function () { lb.classList.remove("open"); };
  lb.addEventListener("click", function (e) { if (e.target !== lbImg) close(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
  document.addEventListener("click", function (e) {
    var img = e.target.closest && e.target.closest(".tile-media img");
    if (img) { lbImg.src = img.currentSrc || img.src; lbImg.alt = img.alt; lb.classList.add("open"); }
  });
})();
