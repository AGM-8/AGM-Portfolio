/* Signature — vanilla port of the Componentry handwriting effect.
   Usage: AGMSignature.init(element, { text: "AGM", fontSize: 200, duration: 2, fontFamily: "'Lovelo', sans-serif" })
   Each letter is stroked in order, then filled. Fonts are declared in css/style.css. */
(function () {
  var NS = "http://www.w3.org/2000/svg";

  function families(stack) {
    return stack.split(",").map(function (f) { return f.trim().replace(/^['"]|['"]$/g, ""); }).filter(Boolean);
  }

  function init(host, opts) {
    var o = Object.assign({
      text: "Signature", fontSize: 64, duration: 1.5, color: "#e8eeff",
      strokeWidth: 1.4, delay: 0.3, letterSpacing: 0, wordSpacing: 0, tight: true,
      fontFamily: "'Mrs Saint Delafield', 'Snell Roundhand', cursive"
    }, opts || {});

    var go = function () { build(host, o); };
    if (document.fonts && document.fonts.load) {
      // make sure every font in the stack (custom + fallback) is ready before measuring
      Promise.all(families(o.fontFamily).map(function (f) {
        return document.fonts.load(o.fontSize + 'px "' + f + '"', o.text).catch(function () {});
      })).then(go, go);
    } else { go(); }
  }

  function build(host, o) {
    host.innerHTML = "";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", o.text);
    svg.style.overflow = "visible";
    host.appendChild(svg);

    var text = document.createElementNS(NS, "text");
    text.setAttribute("x", 0);
    text.setAttribute("y", o.fontSize);
    text.setAttribute("font-family", o.fontFamily);
    text.setAttribute("font-size", o.fontSize);
    if (o.letterSpacing) text.setAttribute("letter-spacing", o.letterSpacing);
    if (o.wordSpacing) text.setAttribute("word-spacing", o.wordSpacing);
    text.setAttribute("fill", "transparent");
    text.setAttribute("stroke", o.color);
    text.setAttribute("stroke-width", o.strokeWidth);
    text.setAttribute("stroke-linecap", "round");
    text.setAttribute("stroke-linejoin", "round");
    svg.appendChild(text);

    var chars = Array.from(o.text);
    var spans = chars.map(function (ch) {
      var t = document.createElementNS(NS, "tspan");
      t.textContent = ch;
      text.appendChild(t);
      return t;
    });

    // size the svg to the rendered text
    var b = text.getBBox();
    var padX = o.fontSize * 0.15, padY = o.fontSize * 0.25;
    var vy = b.y - padY, vh = b.height + padY * 2;
    if (o.tight) { // crop to the real ink height so there is no empty band between lines
      try {
        var cx = document.createElement("canvas").getContext("2d");
        cx.font = o.fontSize + "px " + o.fontFamily;
        var m = cx.measureText(o.text), pad = o.strokeWidth + o.fontSize * 0.03;
        if (m.actualBoundingBoxAscent) { vy = o.fontSize - m.actualBoundingBoxAscent - pad; vh = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent + pad * 2; }
      } catch (e) {}
    }
    svg.setAttribute("viewBox", [b.x - padX, vy, b.width + padX * 2, vh].join(" "));
    svg.setAttribute("width", b.width + padX * 2);
    svg.setAttribute("height", vh);
    svg.style.maxWidth = "100%";
    svg.style.height = "auto";

    var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    var dur = o.duration * 1000;
    var visible = chars.filter(function (c) { return c.trim(); }).length || 1;
    var per = dur / visible * 1.6;          // each letter's own draw time
    var step = (dur - per) / Math.max(visible - 1, 1); // stagger between letters
    var dash = Math.max(1400, Math.ceil(o.fontSize * 10)); // longer than any glyph outline
    var i = 0;

    spans.forEach(function (t, idx) {
      if (!chars[idx].trim()) return;
      var start = o.delay * 1000 + i * step;
      i++;
      if (reduce) { t.style.fill = o.color; t.style.strokeOpacity = 0; return; }
      t.style.strokeDasharray = String(dash);
      t.style.strokeDashoffset = String(dash);
      t.animate(
        [{ strokeDashoffset: dash }, { strokeDashoffset: 0 }],
        { duration: per, delay: start, easing: "cubic-bezier(.45,.05,.3,1)", fill: "forwards" }
      );
      t.animate(
        [{ fill: "rgba(232,238,255,0)" }, { fill: o.color }],
        { duration: per * 0.7, delay: start + per * 0.55, easing: "ease-out", fill: "forwards" }
      );
    });

    var total = o.delay * 1000 + dur + per;
    host.dispatchEvent(new CustomEvent("signature:done", { bubbles: true }));
    setTimeout(function () { host.classList.add("is-signed"); host.dispatchEvent(new CustomEvent("signature:complete", { bubbles: true })); }, total);
  }

  window.AGMSignature = { init: init };
})();
