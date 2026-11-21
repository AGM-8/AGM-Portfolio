/* =========================================================
   Photography — Liquid Glass Carousel + owner-only "+" panel
   Vanilla JS / WebGL take on the Componentry "Liquid Glass Carousel".
   • Photos come from window.AGM_PHOTOS (set in photography.html) plus any added with the "+" button (saved in this browser).
   • Infinite row · inertial drag with snap · wheel / arrow keys · WebGL liquid-glass lens · click to focus.
   • Added photos are stored byte-for-byte (original quality). Only the carousel uses a small preview copy.
   ========================================================= */
(function () {
  "use strict";

  /* ---------------- Settings ---------------- */
  var PASS_HASH = "c1478e6ee33661a477b4272c853233478a1f61c94cb0fbb73dc0c72fa780024c"; // same owner password as Cinematic Edits (SHA-256 — the password itself is never written in the site files)
  var SALT = "agm::";
  var THUMB_MAX = 900;     // longest side of the grid preview copy made for photos you add (originals are never touched)
  var HIDE_KEY = "agm_photo_hidden";
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------- Helpers ---------------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return [].slice.call((r || document).querySelectorAll(s)); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function mod(v, m) { return ((v % m) + m) % m; }
  function pad(v) { return v < 10 ? "0" + v : "" + v; }
  function gcd(a, b) { return b ? gcd(b, a % b) : a; }

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


  /* ---------------- Browser storage for photos you add (IndexedDB) ---------------- */
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      if (!window.indexedDB) { rej(new Error("This browser can't store photos.")); return; }
      var r = indexedDB.open("agm-photography", 1);
      r.onupgradeneeded = function () { r.result.createObjectStore("photos", { keyPath: "id" }); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  function tx(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction("photos", mode), req = fn(t.objectStore("photos"));
        t.oncomplete = function () { res(req && req.result); };
        t.onerror = t.onabort = function () { rej(t.error || new Error("Storage error")); };
      });
    });
  }
  var dbAll = function () { return tx("readonly", function (s) { return s.getAll(); }); };
  var dbPut = function (rec) { return tx("readwrite", function (s) { return s.put(rec); }); };
  var dbDel = function (id) { return tx("readwrite", function (s) { return s.delete(id); }); };

  function getHidden() { try { return JSON.parse(localStorage.getItem(HIDE_KEY) || "[]") || []; } catch (e) { return []; } }
  function setHidden(a) { try { localStorage.setItem(HIDE_KEY, JSON.stringify(a)); } catch (e) {} }

  /* ---------------- Items ---------------- */
  var builtin = (window.AGM_PHOTOS || []).map(function (p) {
    return { id: p.src, title: p.title || "", meta: p.meta || "", full: p.src, thumb: p.thumb || p.src, local: false };
  });
  var records = [], items = [], N = 0, cache = {}, localUrls = {};

  /* ---------------- Carousel settings ---------------- */
  var PANEL_H = 450;                 // target panel height (px), scaled down on short stages
  var GAP = 12;                      // space between panels
  var BG = [0.051, 0.059, 0.102];    // clear colour — must match .fg background (#0d0f1a)
  var ENTRY_MS = 2600;               // rise-and-grow intro

  var root = $("#fg"), stage = $(".fg-stage", root), emptyEl = $(".fg-empty", root);
  var titleEl = $(".lg-title", root), countEl = $(".lg-count", root), fullBtn = $(".lg-full", root);
  var canvas = el("canvas", "lg-canvas"); stage.appendChild(canvas);
  var gl = null, isGL2 = false, P1 = null, P2 = null, quad = null, fbo = null, fbTex = null, MAXTEX = 2048, noGL = false;
  var W = 800, H = 500, DPR = 1, panelH = PANEL_H, L = 1;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function rnd(n) { var s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
  function fk(a, dt) { return reduce ? 1 : 1 - Math.pow(1 - a, dt * 60); }

  /* ---------------- Shaders ---------------- */
  var VS1 = "attribute vec2 a_pos;uniform vec2 u_res;uniform vec4 u_rect;varying vec2 v_uv;varying vec2 v_px;" +
    "void main(){vec2 px=u_rect.xy+a_pos*u_rect.zw;v_uv=a_pos;v_px=a_pos*u_rect.zw;" +
    "vec2 c=px/u_res*2.0-1.0;gl_Position=vec4(c.x,-c.y,0.0,1.0);}";
  var FS1 = "precision highp float;uniform sampler2D u_tex;uniform float u_aspect;uniform float u_alpha;uniform vec2 u_size;varying vec2 v_uv;varying vec2 v_px;" +
    "void main(){float ra=u_size.x/u_size.y;vec2 s=vec2(1.0);if(u_aspect>ra)s.x=ra/u_aspect;else s.y=u_aspect/ra;" +
    "vec2 uv=vec2(v_uv.x,1.0-v_uv.y);uv=(uv-0.5)*s+0.5;vec3 c=texture2D(u_tex,uv).rgb;" +
    "vec2 q=abs(v_px-u_size*0.5)-(u_size*0.5-2.0);float d=length(max(q,0.0))+min(max(q.x,q.y),0.0)-2.0;" +
    "gl_FragColor=vec4(c,(1.0-smoothstep(-1.0,0.5,d))*u_alpha);}";
  var VS2 = "attribute vec2 a_pos;void main(){gl_Position=vec4(a_pos*2.0-1.0,0.0,1.0);}";
  var FS2 = [
    "precision highp float;",
    "uniform sampler2D u_scene;uniform vec2 u_res;uniform vec2 u_cl;uniform vec2 u_cr;uniform vec2 u_r;",
    "uniform float u_time;uniform float u_str;uniform float u_vel;",
    "vec3 S(vec2 f){return texture2D(u_scene,vec2(f.x/u_res.x,1.0-f.y/u_res.y)).rgb;}",
    // one glass blob: returns (signed distance, outward direction x, y). sd = -1 left lens, +1 right lens (mirrored)
    "vec3 lens(vec2 f,vec2 c,float sd){",
    "  vec2 p=(f-c)/u_r;p.x*=sd;",
    "  p.x+=p.y*(0.30+u_vel*0.35*sd);",
    "  p+=0.075*vec2(sin(p.y*2.4+u_time*0.8+sd*1.7),sin(p.x*2.0-u_time*0.65+sd));",
    "  float rr=0.5;vec2 q=abs(p)-(vec2(1.0)-rr);",
    "  float d=length(max(q,0.0))+min(max(q.x,q.y),0.0)-rr;",
    "  vec2 dir=normalize(p*vec2(1.0,1.35)+1e-4);dir.x*=sd;",
    "  return vec3(d,dir);",
    "}",
    "void main(){",
    "  vec2 f=vec2(gl_FragCoord.x,u_res.y-gl_FragCoord.y);",
    "  vec3 base=S(f);",
    "  if(u_str<0.001){gl_FragColor=vec4(base,1.0);return;}",
    "  vec3 a=lens(f,u_cl,-1.0),b=lens(f,u_cr,1.0);",
    "  vec3 l=a.x<b.x?a:b;float d=l.x;vec2 dir=l.yz;",
    "  float m=1.0-smoothstep(-0.015,0.015,d);",
    "  if(m<=0.0){gl_FragColor=vec4(base,1.0);return;}",
    "  float k=clamp(1.0-(-d)/0.6,0.0,1.0);k=k*k*(3.0-2.0*k);",
    "  vec2 sw=vec2(-dir.y,dir.x);",
    "  float amt=k*k*u_r.x*0.5*u_str;",
    "  vec2 o=-dir*amt+sw*amt*0.35;",
    "  vec3 col;col.r=S(f+o*0.9).r;col.g=S(f+o).g;col.b=S(f+o*1.1).b;",
    "  float k3=k*k*k;",
    "  vec3 tint=mix(vec3(0.08,0.42,1.0),vec3(1.0,0.28,0.12),smoothstep(0.1,0.9,dir.x*0.6+dir.y*0.5));",
    "  col=1.0-(1.0-col)*(1.0-tint*k3*0.65);",
    "  float rim=1.0-smoothstep(0.0,0.045,abs(d+0.045));",
    "  col=mix(col,vec3(0.99,0.98,0.95),rim*0.8);",
    "  gl_FragColor=vec4(mix(base,col,m*u_str),1.0);",
    "}"
  ].join("\n");

  /* ---------------- WebGL setup ---------------- */
  function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
  function prog(vs, fs) {
    var p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, "a_pos"); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    p.u = {}; return p;
  }
  function U(p, n) { if (!(n in p.u)) p.u[n] = gl.getUniformLocation(p, n); return p.u[n]; }
  function initGL() {
    try {
      gl = canvas.getContext("webgl2", { antialias: false, alpha: false }); isGL2 = !!gl;
      if (!gl) gl = canvas.getContext("webgl", { antialias: false, alpha: false });
      if (!gl) throw new Error("no webgl");
      P1 = prog(VS1, FS1); P2 = prog(VS2, FS2);
      quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      MAXTEX = Math.min(2048, gl.getParameter(gl.MAX_TEXTURE_SIZE));
      return true;
    } catch (e) { gl = null; noGL = true; return false; }
  }
  function texParams(mip) {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  function makeFbo(w, h) {
    if (fbTex) gl.deleteTexture(fbTex); if (fbo) gl.deleteFramebuffer(fbo);
    fbTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, fbTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); texParams(false);
    fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fbTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  function newTex() {
    var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([24, 24, 32, 255]));
    texParams(false); return t;
  }
  function loadTex(c, url, hi) {
    if (!gl) return;
    if (!c.tex) c.tex = newTex();
    var im = new Image(); im.decoding = "async"; if (/^https?:/i.test(url)) im.crossOrigin = "anonymous";
    im.onload = function () {
      if (!gl || cache[c.id] !== c) return;
      var w = im.naturalWidth, h = im.naturalHeight, s = Math.min(1, MAXTEX / Math.max(w, h)), src = im;
      if (s < 1) {
        var cv = document.createElement("canvas"); cv.width = Math.max(1, Math.round(w * s)); cv.height = Math.max(1, Math.round(h * s));
        var g = cv.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(im, 0, 0, cv.width, cv.height); src = cv;
      }
      try {
        gl.bindTexture(gl.TEXTURE_2D, c.tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
        if (isGL2) gl.generateMipmap(gl.TEXTURE_2D);
        texParams(isGL2);
        if (!hi) { c.aspect = w / h; c.loaded = true; layoutKeep(); } else c.hi = true;
      } catch (e) { /* e.g. file:// images are blocked by the browser for WebGL — host the site or use a local server */ }
    };
    im.src = url;
  }
  function freeEntry(id) { var c = cache[id]; if (c && c.tex && gl) gl.deleteTexture(c.tex); delete cache[id]; }
  function entryFor(id, thumb, full) {
    var c = cache[id];
    if (!c) { c = cache[id] = { id: id, thumb: thumb, full: full, tex: null, aspect: 0.75, loaded: false, hi: false, hiReq: false }; loadTex(c, thumb, false); }
    return c;
  }

  /* ---------------- Items from built-in list + photos added with "+" ---------------- */
  function rebuildItems() {
    var hidden = getHidden(), live = {}, id;
    var shown = builtin.filter(function (b) { return hidden.indexOf(b.id) < 0; });
    var local = records.slice().sort(function (a, b) { return a.created - b.created; }).map(function (r) {
      var u = localUrls[r.id];
      if (!u) { u = localUrls[r.id] = { full: URL.createObjectURL(r.blob) }; u.thumb = r.thumb ? URL.createObjectURL(r.thumb) : u.full; }
      return { id: r.id, title: r.title || "", meta: r.meta || "", full: u.full, thumb: u.thumb, local: true, rec: r };
    });
    items = shown.concat(local);
    items.forEach(function (it) { live[it.id] = 1; it.c = entryFor(it.id, it.thumb, it.full); });
    for (id in cache) if (!live[id]) freeEntry(id);
    for (id in localUrls) if (!live[id]) {
      URL.revokeObjectURL(localUrls[id].full); if (localUrls[id].thumb !== localUrls[id].full) URL.revokeObjectURL(localUrls[id].thumb);
      delete localUrls[id];
    }
    N = items.length;
    layoutKeep();
  }

  /* ---------------- Layout: one infinite row ---------------- */
  var scroll = 0, target = 0, dragging = false;
  function layout() {
    var x = 0;
    for (var i = 0; i < N; i++) {
      var it = items[i], a = clamp(it.c.aspect, 0.5, 1.7);
      it.w = Math.round(panelH * a); it.pos = x + it.w / 2; x += it.w + GAP;
    }
    L = Math.max(1, x);
  }
  function nearest(x) {
    var best = { i: 0, k: 0, d: 1e12 };
    for (var i = 0; i < N; i++) {
      var k = N > 1 ? Math.round((x - items[i].pos) / L) : 0, d = Math.abs(items[i].pos + k * L - x);
      if (d < best.d) { best.i = i; best.k = k; best.d = d; }
    }
    return best;
  }
  function layoutKeep() {            // re-layout but stay on the same photo
    if (!N) { layout(); return; }
    var a = (items[0] && items[0].pos != null) ? nearest(target) : { i: 0, k: 0 }, off = target - scroll;
    layout();
    if (!dragging) { var it = items[Math.min(a.i, N - 1)]; target = it.pos + (N > 1 ? a.k * L : 0); scroll = target - off; }
  }
  function measure() {
    var r = stage.getBoundingClientRect();
    W = Math.max(200, r.width); H = Math.max(200, r.height); DPR = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    panelH = Math.round(clamp(H * 0.5, 150, PANEL_H));
    if (gl) makeFbo(canvas.width, canvas.height);
    layoutKeep();
  }

  /* ---------------- Navigation ---------------- */
  function snapTo(x) { if (N < 2) return; var n = nearest(x); target = items[n.i].pos + n.k * L; }
  function step(dir) {
    if (N < 2) return;
    var n = nearest(target), world = n.i + n.k * N + dir, k = Math.floor(world / N), i = mod(world, N);
    target = items[i].pos + k * L;
  }
  function jumpTo(idx, instant) {
    if (!N) return;
    var i = mod(idx, N), it = items[i];
    target = it.pos + (N > 1 ? Math.round((scroll - it.pos) / L) * L : 0);
    if (instant) scroll = target;
  }

  /* ---------------- Focus (click-to-expand) ---------------- */
  var focusIdx = -1, focusK = 0, focusT = 0, focusGoal = 0;
  function focusOn(i, k) {
    var c = items[i].c;
    focusIdx = i; focusK = k; focusGoal = 1; target = items[i].pos + k * L;
    if (!c.hi && !c.hiReq && c.full !== c.thumb) { c.hiReq = true; loadTex(c, c.full, true); }
    root.classList.add("focused");
  }
  function unfocus() { if (!focusGoal) return; focusGoal = 0; root.classList.remove("focused"); }

  /* ---------------- Caption ---------------- */
  var activeIdx = -1;
  function setActive(i, force) {
    if (i === activeIdx && !force) return;
    activeIdx = i; var it = items[i]; if (!it) return;
    titleEl.textContent = it.title || "Untitled";
    countEl.textContent = pad(i + 1) + "/" + pad(N);
  }

  /* ---------------- Render loop ---------------- */
  var rects = [], raf = 0, lastTS = 0, svel = 0, lensY = 0, clearHalf = 0, ptrX = 0, ptrY = 0, hasPtr = false;
  var entryT = 1, entryStart = 0, entryStarted = false, visible = true;

  function frame(ts) {
    raf = requestAnimationFrame(frame);
    if (!gl || !N || document.hidden || !visible) { lastTS = ts; return; }
    var dt = Math.min(0.05, (ts - lastTS) / 1000 || 0.016); lastTS = ts;
    var prev = scroll;
    scroll += (target - scroll) * fk(dragging ? 0.45 : 0.11, dt);
    if (Math.abs(target - scroll) < 0.05) scroll = target;
    svel += ((scroll - prev) / Math.max(dt * 60, 0.001) - svel) * 0.15;
    focusT += (focusGoal - focusT) * fk(0.12, dt);
    if (Math.abs(focusGoal - focusT) < 0.002) focusT = focusGoal;
    if (!focusGoal && focusT === 0) focusIdx = -1;
    if (entryT < 1) entryT = Math.min(1, (ts - entryStart) / ENTRY_MS);
    var ty = H / 2 + (hasPtr ? (ptrY - H / 2) * 0.2 : 0);
    var ni = nearest(scroll).i, cw = items[ni].w / 2 + 22;    // clear zone: the centred photo plus one neighbour on each side
    if (N > 1) cw += GAP + Math.max(items[mod(ni - 1, N)].w, items[mod(ni + 1, N)].w);
    cw = Math.min(cw, W / 2 - 90);                            // always leave room for the lenses at the edges
    if (!clearHalf) { clearHalf = cw; lensY = ty; }
    clearHalf += (cw - clearHalf) * fk(0.1, dt); lensY += (ty - lensY) * fk(0.06, dt);
    setActive(nearest(scroll).i);
    fullBtn.hidden = !(focusGoal && focusT > 0.85);
    draw(ts);
  }

  function draw(ts) {
    var bw = canvas.width, bh = canvas.height, i, k, it;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, bw, bh);
    gl.clearColor(BG[0], BG[1], BG[2], 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(P1); gl.activeTexture(gl.TEXTURE0); gl.uniform1i(U(P1, "u_tex"), 0); gl.uniform2f(U(P1, "u_res"), W, H);

    var eA = 1, eB = 1, sc = 1;
    if (entryT < 1) { eA = ease(clamp(entryT / 0.5, 0, 1)); eB = ease(clamp((entryT - 0.5) / 0.5, 0, 1)); sc = 0.14 + 0.86 * eB; }
    var maxW = 0; for (i = 0; i < N; i++) maxW = Math.max(maxW, items[i].w);
    var span = (W / 2 + maxW) / sc;
    var k0 = N > 1 ? Math.floor((scroll - span) / L) : 0, k1 = N > 1 ? Math.ceil((scroll + span) / L) : 0;
    var list = [];
    for (k = k0; k <= k1; k++) for (i = 0; i < N; i++) {
      it = items[i];
      var rel = it.pos + k * L - scroll, w = it.w * sc, h = panelH * sc, x = W / 2 + rel * sc, y = H / 2;
      if (eA < 1) { x = lerp(W * (0.18 + 0.64 * rnd(i * 7.1 + k * 13.3)), x, eA); y = lerp(H * (1.04 + 0.12 * rnd(i * 3.7 + k * 5.9 + 1.3)), y, eA); }
      var a = 1, isF = (i === focusIdx && k === focusK && focusT > 0);
      if (focusT > 0 && !isF) a = 1 - ease(focusT);
      if (isF) {
        var fe = ease(focusT), asp = it.c.aspect, th = Math.min(H * 0.84, (W * 0.9) / asp), tw = th * asp;
        w = lerp(w, tw, fe); h = lerp(h, th, fe); x = lerp(x, W / 2, fe); y = lerp(y, H / 2, fe);
      }
      if (x + w / 2 < 0 || x - w / 2 > W || a <= 0.01) continue;
      list.push({ it: it, i: i, k: k, x: x, y: y, w: w, h: h, a: a, f: isF ? 1 : 0 });
    }
    list.sort(function (p, q) { return p.f - q.f; });
    rects.length = 0;
    for (var n = 0; n < list.length; n++) {
      var p = list[n];
      gl.bindTexture(gl.TEXTURE_2D, p.it.c.tex);
      gl.uniform4f(U(P1, "u_rect"), p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);
      gl.uniform2f(U(P1, "u_size"), p.w, p.h);
      gl.uniform1f(U(P1, "u_aspect"), p.it.c.aspect);
      gl.uniform1f(U(P1, "u_alpha"), p.a);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      rects.push(p);
    }

    // lens pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, bw, bh); gl.disable(gl.BLEND);
    gl.useProgram(P2); gl.bindTexture(gl.TEXTURE_2D, fbTex); gl.uniform1i(U(P2, "u_scene"), 0);
    gl.uniform2f(U(P2, "u_res"), bw, bh);
    var rx = clamp((W / 2 - clearHalf) * 0.5, 70, 360), off = clearHalf + rx * 1.3;
    gl.uniform2f(U(P2, "u_cl"), (W / 2 - off) * DPR, lensY * DPR);
    gl.uniform2f(U(P2, "u_cr"), (W / 2 + off) * DPR, lensY * DPR);
    gl.uniform2f(U(P2, "u_r"), rx * DPR, panelH * 0.62 * DPR);
    gl.uniform1f(U(P2, "u_time"), reduce ? 0 : ts / 1000);
    gl.uniform1f(U(P2, "u_vel"), clamp(svel / 40, -1, 1));
    gl.uniform1f(U(P2, "u_str"), eB * (1 - ease(focusT)));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /* ---------------- Input ---------------- */
  var down = false, sx = 0, sy = 0, startT = 0, moved = false, lx = 0, lt = 0, pv = 0, wheelT = 0;
  function track(e) { var r = stage.getBoundingClientRect(); ptrX = e.clientX - r.left; ptrY = e.clientY - r.top; hasPtr = true; }
  stage.addEventListener("pointerdown", function (e) {
    if (e.button > 0 || !N) return;
    down = true; moved = false; sx = lx = e.clientX; sy = e.clientY; startT = target; lt = performance.now(); pv = 0; track(e);
  });
  stage.addEventListener("pointermove", function (e) { if (e.pointerType !== "touch" || down) track(e); });
  stage.addEventListener("pointerleave", function () { if (!down) hasPtr = false; });
  window.addEventListener("pointermove", function (e) {
    if (!down) return;
    var dx = e.clientX - sx;
    if (!moved && Math.abs(dx) + Math.abs(e.clientY - sy) > 6) { moved = true; if (!focusGoal) { dragging = true; stage.classList.add("dragging"); } }
    if (!moved || !dragging) return;
    var now = performance.now(), dt = now - lt;
    if (dt > 0) pv = pv * 0.6 + ((lx - e.clientX) / dt) * 0.4;
    lx = e.clientX; lt = now; target = startT - dx; track(e);
  });
  function release(e, ok) {
    if (!down) return; down = false;
    if (moved) {
      if (dragging) {
        dragging = false; stage.classList.remove("dragging");
        var fling = (performance.now() - lt < 90 && !reduce) ? pv * 260 : 0;
        snapTo(target + fling);
      }
    } else if (ok && stage.contains(e.target)) clickAt(e);
  }
  window.addEventListener("pointerup", function (e) { release(e, true); });
  window.addEventListener("pointercancel", function (e) { release(e, false); });
  function clickAt(e) {
    if (focusGoal) { unfocus(); return; }
    var r = stage.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    for (var j = rects.length - 1; j >= 0; j--) {
      var q = rects[j];
      if (Math.abs(x - q.x) <= q.w / 2 && Math.abs(y - q.y) <= q.h / 2) {
        var n = nearest(scroll);
        if (N < 2 || (q.i === n.i && q.k === n.k)) focusOn(q.i, q.k); else target = items[q.i].pos + q.k * L;
        return;
      }
    }
  }
  stage.addEventListener("wheel", function (e) {
    if (e.ctrlKey || !N) return;
    e.preventDefault(); if (focusGoal) return;
    var m = e.deltaMode === 1 ? 16 : 1, d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * m;
    target += d; clearTimeout(wheelT); wheelT = setTimeout(function () { snapTo(target); }, 120);
  }, { passive: false });
  stage.addEventListener("keydown", function (e) {
    if (!N) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); if (focusGoal) unfocus(); step(-1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); if (focusGoal) unfocus(); step(1); }
    else if (e.key === "Enter") { e.preventDefault(); if (focusGoal) unfocus(); else { var n = nearest(scroll); focusOn(n.i, n.k); } }
  });
  fullBtn.addEventListener("click", function (e) { e.stopPropagation(); if (focusIdx >= 0) openViewer(focusIdx); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !modalOpen && focusGoal) unfocus(); });
  window.addEventListener("resize", measure);
  if (window.ResizeObserver) new ResizeObserver(measure).observe(stage);
  if (window.IntersectionObserver) new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }).observe(stage);
  canvas.addEventListener("webglcontextlost", function (e) { e.preventDefault(); gl = null; });
  canvas.addEventListener("webglcontextrestored", function () {
    if (!initGL()) return;
    for (var id in cache) { var c = cache[id]; c.tex = null; c.loaded = false; c.hi = false; c.hiReq = false; loadTex(c, c.thumb, false); }
    measure();
  });


  /* ---------------- Modals ---------------- */
  var modalOpen = 0, unlocked = false;
  function openModal(m) { m.hidden = false; document.documentElement.classList.add("ec-lock"); modalOpen++; }
  function closeModal(m) {
    if (m.hidden) return;
    m.hidden = true; modalOpen = Math.max(0, modalOpen - 1);
    if (!modalOpen) document.documentElement.classList.remove("ec-lock");
    if (m.id === "pg-viewer") { var im = $("img", m); im.removeAttribute("src"); }
    if (m.id === "pg-manage") unlocked = false;
  }
  $$(".ec-modal").forEach(function (m) {
    m.addEventListener("mousedown", function (e) { if (e.target === m) closeModal(m); });
    $$("[data-close]", m).forEach(function (b) { b.addEventListener("click", function () { closeModal(m); }); });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      var open = $$(".ec-modal").filter(function (m) { return !m.hidden; });
      if (open.length) closeModal(open[open.length - 1]);
    } else if (!viewer.hidden && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault(); stepViewer(e.key === "ArrowLeft" ? -1 : 1);
    }
  });

  /* ---------------- Full-size viewer (always the original file) ---------------- */
  var viewer = $("#pg-viewer"), vImg = $("img", viewer), vIdx = 0;
  function showViewer(idx) {
    vIdx = mod(idx, N); var it = items[vIdx];
    vImg.alt = it.title || "Photo"; vImg.src = it.orig || it.full;
    $("h2", viewer).textContent = it.title || "";
    $("p", viewer).textContent = (it.meta ? it.meta + "  ·  " : "") + pad(vIdx + 1) + " / " + pad(N);
    $("h2", viewer).style.display = it.title ? "" : "none";
  }
  function openViewer(idx) {
    if (!N) return;
    viewer.classList.toggle("single", N < 2);
    showViewer(idx);
    if (viewer.hidden) openModal(viewer);
  }
  function stepViewer(k) { if (N > 1) showViewer(vIdx + k); }
  $(".pg-prev", viewer).addEventListener("click", function () { stepViewer(-1); });
  $(".pg-next", viewer).addEventListener("click", function () { stepViewer(1); });

  /* ---------------- Owner access ("+" button) ---------------- */
  var attempts = 0;
  var gate = $("#pg-gate"), gateForm = $("#pg-gate-form"), gateErr = $("#pg-gate-err"), pw = $("#pg-pw");
  var manage = $("#pg-manage"), form = $("#pg-form"), formErr = $("#pg-form-err"), statusEl = $("#pg-status"), saveBtn = $("#pg-save");
  var listEl = $("#pg-list");

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
    form.reset(); formErr.textContent = ""; statusEl.textContent = ""; saveBtn.disabled = false;
    renderLists(); openModal(manage); setTimeout(function () { $("#pg-files").focus(); }, 60);
  }

  function rowBtn(label, cls, fn) { var b = el("button", "ec-mini " + (cls || ""), label); b.type = "button"; b.addEventListener("click", fn); return b; }

  function renderLists() {
    // photos you added
    listEl.innerHTML = "";
    if (!records.length) listEl.appendChild(el("li", "ec-empty-li", "Nothing added yet."));
    records.slice().sort(function (a, b) { return a.created - b.created; }).forEach(function (r) {
      var li = el("li"), img = new Image(), b = el("b"), u = URL.createObjectURL(r.thumb || r.blob);
      img.src = u; img.alt = ""; img.onload = function () { URL.revokeObjectURL(u); };
      b.textContent = r.title || r.name || "Untitled";
      li.appendChild(img); li.appendChild(b);
      var rm = rowBtn("Remove", "danger", function () {
        if (!rm.classList.contains("sure")) { rm.classList.add("sure"); rm.textContent = "Sure?"; setTimeout(function () { rm.classList.remove("sure"); rm.textContent = "Remove"; }, 3000); return; }
        if (!unlocked) return;
        dbDel(r.id).then(reload).then(renderLists);
      });
      li.appendChild(rm); listEl.appendChild(li);
    });
  }

  /* small preview copy for the grid only — the original file is stored untouched */
  function loadBitmap(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: "from-image" }).catch(function () { return createImageBitmap(file); });
    }
    return Promise.reject();
  }
  function loadImg(file) {
    return new Promise(function (res, rej) {
      var u = URL.createObjectURL(file), im = new Image();
      im.onload = function () { URL.revokeObjectURL(u); res(im); };
      im.onerror = function () { URL.revokeObjectURL(u); rej(new Error("unreadable")); };
      im.src = u;
    });
  }
  function makeThumb(file) {
    return loadBitmap(file).catch(function () { return loadImg(file); }).then(function (src) {
      var sw = src.width || src.naturalWidth, sh = src.height || src.naturalHeight;
      var sc = Math.min(1, THUMB_MAX / Math.max(sw, sh)), w = Math.max(1, Math.round(sw * sc)), h = Math.max(1, Math.round(sh * sc));
      var c = document.createElement("canvas"); c.width = w; c.height = h;
      var g = c.getContext("2d"); g.fillStyle = "#0d0d14"; g.fillRect(0, 0, w, h);
      g.imageSmoothingQuality = "high"; g.drawImage(src, 0, 0, w, h);
      if (src.close) src.close();
      return new Promise(function (res) { c.toBlob(function (b) { res(b); }, "image/jpeg", 0.9); });
    });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!unlocked) return;
    formErr.textContent = "";
    var files = [].slice.call($("#pg-files").files || []);
    if (!files.length) { formErr.textContent = "Choose at least one photo."; return; }
    var bad = files.filter(function (f) { return f.type && f.type.indexOf("image/") !== 0; });
    if (bad.length) { formErr.textContent = "“" + bad[0].name + "” doesn't look like an image."; return; }
    var title = $("#pg-title").value.trim(), meta = $("#pg-meta").value.trim();
    saveBtn.disabled = true;
    var firstId = null, done = 0, failed = [];
    var chain = files.reduce(function (p, f, n) {
      return p.then(function () {
        statusEl.textContent = "Saving " + (n + 1) + " of " + files.length + "…";
        return makeThumb(f).catch(function () { return null; }).then(function (thumb) {
          var rec = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: title, meta: meta, name: f.name, created: Date.now() + n, blob: f };
          if (thumb) rec.thumb = thumb;
          if (!firstId) firstId = rec.id;
          return dbPut(rec).then(function () { done++; }, function (err) { err.__file = f.name; throw err; });
        });
      });
    }, Promise.resolve());
    chain.then(reload).then(function () {
      statusEl.textContent = "Added ✓";
      setTimeout(function () {
        closeModal(manage);
        var k = -1; items.forEach(function (it, i) { if (it.id === firstId) k = i; });
        if (k >= 0) jumpTo(k);
      }, 450);
    }).catch(function (err) {
      saveBtn.disabled = false; statusEl.textContent = "";
      var msg = /quota/i.test(String(err && (err.name + err.message)))
        ? "Not enough browser storage for these photos. Try fewer at a time."
        : "Couldn't save: " + ((err && err.message) || "browser storage is unavailable (private window?)");
      formErr.textContent = (done ? done + " saved. " : "") + msg;
      if (done) reload();
    });
  });

  /* ---------------- Google Drive folder (optional): window.AGM_DRIVE = { folderId, apiKey } ---------------- */
  function loadDrive() {
    var d = window.AGM_DRIVE;
    if (!d || !d.folderId || !d.apiKey || !window.fetch) return Promise.resolve();
    var out = [];
    function page(token) {
      var u = "https://www.googleapis.com/drive/v3/files?pageSize=200&orderBy=name&fields=nextPageToken,files(id,name,mimeType)" +
        "&q=" + encodeURIComponent("'" + d.folderId + "' in parents and mimeType contains 'image/' and trashed=false") +
        "&key=" + encodeURIComponent(d.apiKey) + (token ? "&pageToken=" + encodeURIComponent(token) : "");
      return fetch(u).then(function (r) { if (!r.ok) throw new Error("Drive " + r.status); return r.json(); }).then(function (j) {
        out = out.concat(j.files || []);
        return j.nextPageToken ? page(j.nextPageToken) : out;
      });
    }
    return page().then(function (files) {
      files.forEach(function (f) {
        var base = "https://lh3.googleusercontent.com/d/" + f.id;
        builtin.push({ id: "drive:" + f.id, title: f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "), meta: "", full: base + "=w2400", orig: base + "=s0", thumb: base + "=w1000", local: false });
      });
    }).catch(function (e) { if (window.console) console.warn("Google Drive folder could not be read:", e.message); });
  }

  /* ---------------- Load ---------------- */
  function sync() {
    emptyEl.hidden = N > 0 || noGL;
    titleEl.hidden = countEl.hidden = !N;
    if (noGL) { emptyEl.hidden = false; emptyEl.textContent = "Your browser can't run the WebGL carousel. Please try a recent version of Chrome, Edge, Safari or Firefox."; }
    if (N) {
      if (!entryStarted) { entryStarted = true; if (reduce) entryT = 1; else { entryT = 0; entryStart = performance.now(); } }
      setActive(activeIdx < 0 ? 0 : Math.min(activeIdx, N - 1), true);
    } else { activeIdx = -1; unfocus(); }
  }
  function reload() {
    return dbAll().then(function (r) { records = r || []; }, function () { records = []; }).then(function () {
      rebuildItems(); sync(); measure();
    });
  }

  initGL();
  rebuildItems(); sync(); measure(); jumpTo(0, true);
  raf = requestAnimationFrame(frame);
  loadDrive().then(function () { return reload(); }).then(function () { try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {} });
})();
