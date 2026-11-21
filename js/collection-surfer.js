/* CollectionSurfer — vanilla port of the Componentry collection surfer ("uplift" style).
   A row of folders; the one under the cursor lifts up (neighbours lift a little) and shows its name.
   Clicking a folder opens the photos inside it. Works from the HTML — no photo data lives in this file.
   Usage: AGMSurfer.init(document.getElementById("collection")) */
(function () {
  var GRADS = [["#6b86c4", "#1a1f38"], ["#4a6191", "#10131f"], ["#7d96d0", "#262d52"],
               ["#3b4f82", "#0d0d14"], ["#8fa6d6", "#1f2540"], ["#5a78b8", "#151a30"]];
  var RATIOS = ["4/5", "1/1", "3/2", "4/5", "3/4", "16/10", "1/1", "4/5"];

  function init(root) {
    var stage = root.querySelector(".surfer-stage");
    var surfer = root.querySelector(".surfer");
    var view = root.querySelector(".collection-view");
    var titleEl = view.querySelector(".cv-title");
    var countEl = view.querySelector(".cv-count");
    var grid = view.querySelector(".cv-grid");
    var folders = [].slice.call(surfer.querySelectorAll(".folder"));

    /* ---- read each folder's photos (real <img> tags, or N placeholders) ---- */
    function photosOf(f) {
      var imgs = [].slice.call(f.querySelectorAll(".folder-photos img"));
      if (imgs.length) {
        return imgs.map(function (i) {
          return { src: i.getAttribute("src"), alt: i.getAttribute("alt") || "", title: i.getAttribute("data-title") || "", meta: i.getAttribute("data-meta") || "" };
        });
      }
      var n = parseInt(f.getAttribute("data-placeholders") || "0", 10), out = [];
      for (var k = 0; k < n; k++) out.push({ ph: true });
      return out;
    }

    function plural(n) { return n + (n === 1 ? " photo" : " photos"); }

    folders.forEach(function (f, fi) {
      var photos = photosOf(f);
      f._photos = photos;
      f._index = fi;
      // the three sheets peeking out of the folder show its first photos
      [].forEach.call(f.querySelectorAll(".folder-sheet"), function (sheet, j) {
        var p = photos.length ? photos[j % photos.length] : null;
        if (p && p.src) { sheet.style.backgroundImage = "url('" + p.src + "')"; }
        else {
          var g = GRADS[(fi * 2 + j) % GRADS.length];
          sheet.style.setProperty("--g1", g[0]); sheet.style.setProperty("--g2", g[1]);
        }
      });
      var name = f.getAttribute("data-name") || "Folder";
      f.querySelector(".folder-count").textContent = plural(photos.length);
      f.setAttribute("role", "button");
      f.setAttribute("tabindex", "0");
      f.setAttribute("aria-label", name + ", " + plural(photos.length));
    });

    /* ---- surf: lift folders by how close the cursor is ---- */
    function lift(e) {
      if (e.pointerType === "touch") return;
      var sr = surfer.getBoundingClientRect();
      var px = e.clientX - sr.left, py = e.clientY - sr.top;
      folders.forEach(function (f) {
        // layout box (ignores the lift transform) so the effect doesn't flicker at the edges
        var w = f.offsetWidth, h = f.offsetHeight;
        var cx = f.offsetLeft + w / 2, cy = f.offsetTop + h / 2;
        var inside = Math.abs(px - cx) <= w / 2 && Math.abs(py - cy) <= h / 2 + 24;
        var d = Math.hypot(px - cx, py - cy) / (w * 2.1);
        var inf = Math.max(0, 1 - d);
        f.style.setProperty("--i", (inside ? 1 : Math.pow(inf, 1.5) * 0.8).toFixed(3));
        f.classList.toggle("is-hot", inside);
      });
    }
    function settle() { folders.forEach(function (f) { f.style.setProperty("--i", 0); f.classList.remove("is-hot"); }); }
    surfer.addEventListener("pointermove", lift);
    surfer.addEventListener("pointerleave", settle);

    /* ---- open / close a folder ---- */
    function open(f, push) {
      var photos = f._photos, fi = f._index;
      grid.innerHTML = "";
      photos.forEach(function (p, k) {
        var fig = document.createElement("figure");
        fig.className = "tile pop";
        fig.style.animationDelay = (k * 45) + "ms";
        var media = document.createElement("div");
        if (p.src) {
          media.className = "tile-media natural";
          var img = new Image();
          img.src = p.src; img.alt = p.alt; img.loading = "lazy";
          media.appendChild(img);
        } else {
          media.className = "tile-media";
          var g = GRADS[(k + fi) % GRADS.length];
          media.style.setProperty("--ratio", RATIOS[k % RATIOS.length]);
          media.style.setProperty("--g1", g[0]); media.style.setProperty("--g2", g[1]);
          media.innerHTML = '<div class="placeholder-note">Add photo</div>';
        }
        fig.appendChild(media);
        if (p.title) {
          var cap = document.createElement("figcaption");
          cap.className = "tile-cap";
          cap.innerHTML = "<h3></h3>" + (p.meta ? "<p></p>" : "");
          cap.querySelector("h3").textContent = p.title;
          if (p.meta) cap.querySelector("p").textContent = p.meta;
          fig.appendChild(cap);
        }
        grid.appendChild(fig);
      });
      titleEl.textContent = f.getAttribute("data-name") || "Folder";
      countEl.textContent = plural(photos.length);
      root.classList.add("viewing");
      var navH = parseFloat(getComputedStyle(document.body).getPropertyValue("--nav-h")) || 68;
      window.scrollTo({ top: Math.max(0, root.getBoundingClientRect().top + window.scrollY - navH - 20), behavior: "smooth" });
      if (push) history.pushState(null, "", "#" + f.getAttribute("data-slug"));
    }
    function close(push) {
      root.classList.remove("viewing");
      grid.innerHTML = "";
      settle();
      if (push && location.hash) history.pushState(null, "", location.pathname + location.search);
    }

    folders.forEach(function (f) {
      f.addEventListener("click", function () { open(f, true); });
      f.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(f, true); }
      });
    });
    view.querySelector(".cv-back").addEventListener("click", function () { close(true); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && root.classList.contains("viewing") && !document.querySelector(".lightbox.open")) close(true); });

    function fromHash() {
      var slug = location.hash.replace("#", "");
      var f = folders.filter(function (x) { return x.getAttribute("data-slug") === slug; })[0];
      if (f) open(f, false); else if (root.classList.contains("viewing")) close(false);
    }
    window.addEventListener("popstate", fromHash);
    window.addEventListener("hashchange", fromHash);
    fromHash();
  }

  window.AGMSurfer = { init: init };
})();
