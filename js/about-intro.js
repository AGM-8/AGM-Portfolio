/* About page: scroll progress (--p) + image ripple effect.
   The ripple is a plain-WebGL port of Componentry's ImageRippleEffect
   (brush sprites -> displacement buffer -> image lookup is displaced). */
(function () {
  var wrap = document.querySelector(".ai-wrap");
  if (!wrap) return;
  var box = wrap.querySelector(".ai-photo-box");
  var img = wrap.querySelector(".ai-photo");
  var cv = wrap.querySelector(".ai-canvas");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- show the WHOLE photo (never cropped) ----------
     The photo box takes the photo's own proportions, as large as the stage allows, centred. */
  var fitting = false, head = wrap.querySelector(".ai-head");
  function measureBox() {
    box.style.flex = "1"; box.style.width = ""; box.style.height = ""; box.style.alignSelf = "";
    var r = box.getBoundingClientRect(), aw = r.width, ah = r.height;
    // the stage starts below the top bar, so the photo must also fit what is left of the first screen
    var docTop = wrap.getBoundingClientRect().top + window.pageYOffset;
    ah = Math.min(ah, window.innerHeight - (docTop + box.offsetTop) - 14);
    var asp = img.naturalWidth / img.naturalHeight, w = Math.min(aw, Math.max(60, ah) * asp);
    return { aw: aw, w: w, h: w / asp };
  }
  function fitBox() {
    if (fitting || !img.naturalWidth) return;
    // "About" floats in the free space beside the photo; if the photo is too wide for that, it sits above the photo instead
    if (head) head.classList.add("ai-float");
    var m = measureBox();
    if (!m.aw) return;
    box.style.flex = "none"; box.style.alignSelf = "center";
    box.style.width = Math.round(m.w) + "px"; box.style.height = Math.round(m.h) + "px";
    fitting = true; window.dispatchEvent(new Event("resize")); fitting = false;   // let the ripple re-measure
  }
  window.addEventListener("resize", fitBox);
  if (img.complete && img.naturalWidth) fitBox(); else img.addEventListener("load", fitBox);

  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.scrollTo(0, 0);

  /* ---------- scroll: photo rises -> blurs out -> text comes up ---------- */
  var ticking = false;
  function updateScroll() {
    ticking = false;
    var y = -wrap.getBoundingClientRect().top, vh = window.innerHeight;
    function clamp(v) { return Math.min(1, Math.max(0, v)); }
    wrap.style.setProperty("--a", clamp(y / (vh * 0.7)).toFixed(3));              // photo comes up
    wrap.style.setProperty("--b", clamp((y - vh * 0.85) / (vh * 0.5)).toFixed(3)); // then blurs out
  }
  window.addEventListener("scroll", function () {
    if (!ticking) { ticking = true; requestAnimationFrame(updateScroll); }
  }, { passive: true });
  window.addEventListener("resize", updateScroll);
  updateScroll();
  setTimeout(function () { wrap.classList.add("ai-ready"); }, 1800);

  /* ---------- ripple settings (same names as the component props) ---------- */
  var OPT = {
    distortionStrength: 0.075,
    waveCount: 100,
    waveSize: 60,
    waveRotationSpeed: 0.025,
    waveFadeMultiplier: 0.95,
    waveGrowth: 0.155,
    waveSpawnThreshold: 0.1
  };
  var PAD = 90; // css px the canvas extends past the photo so the bulge can spill out

  if (reduce) return;
  var gl = cv.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false });
  if (!gl) return;

  function sh(type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function prog(vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  try {
    /* wave sprites: drawn additively into a displacement buffer */
    var waveP = prog(
      "attribute vec2 aPos; uniform vec2 uCenter,uRes; uniform float uSize,uRot; varying vec2 vUv;" +
      "void main(){ vec2 a=aPos*uSize; float c=cos(uRot),s=sin(uRot);" +
      " vec2 r=vec2(c*a.x-s*a.y, s*a.x+c*a.y); vec2 p=uCenter+r;" +
      " gl_Position=vec4(p.x/uRes.x*2.0-1.0, 1.0-p.y/uRes.y*2.0, 0.0, 1.0); vUv=aPos+0.5; }",
      "precision mediump float; uniform sampler2D uBrush; uniform float uOpacity; varying vec2 vUv;" +
      "void main(){ gl_FragColor=vec4(1.0,1.0,1.0, texture2D(uBrush,vUv).a*uOpacity); }"
    );
    /* final pass: displace the image lookup by the buffer, draw with rounded corners */
    var finP = prog(
      "attribute vec2 aPos; varying vec2 vUv; void main(){ vUv=vec2(aPos.x*0.5+0.5, 0.5-aPos.y*0.5); gl_Position=vec4(aPos,0.0,1.0); }",
      "precision highp float; uniform sampler2D uDisp,uImage; uniform vec2 uCanvas,uRectPos,uRectSize; uniform float uStrength,uRadius,uImgAspect;" +
      "varying vec2 vUv;" +
      "void main(){" +
      " vec4 d=texture2D(uDisp, vec2(vUv.x, 1.0-vUv.y));" +
      " float theta=d.r*6.2831853; vec2 dir=vec2(sin(theta),cos(theta));" +
      " vec2 suv=vUv+dir*d.r*uStrength;" +
      " vec2 p=suv*uCanvas; vec2 loc=(p-uRectPos)/uRectSize;" +
      " if(loc.x<0.0||loc.x>1.0||loc.y<0.0||loc.y>1.0){ gl_FragColor=vec4(0.0); return; }" +
      " vec2 q=abs(p-(uRectPos+uRectSize*0.5))-(uRectSize*0.5-vec2(uRadius));" +
      " float dist=length(max(q,0.0))+min(max(q.x,q.y),0.0)-uRadius;" +
      " float a=1.0-smoothstep(-1.0,1.0,dist);" +
      " float ra=uRectSize.x/uRectSize.y; vec2 t=loc;" +
      " if(ra>uImgAspect){ float f=uImgAspect/ra; t.y=(1.0-f)*0.62+loc.y*f; }" +
      " else { float f=ra/uImgAspect; t.x=(1.0-f)*0.5+loc.x*f; }" +
      " vec3 col=texture2D(uImage,t).rgb; gl_FragColor=vec4(col*a,a); }"
    );

    var quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
    var spriteQuad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, spriteQuad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-.5,-.5, .5,-.5, -.5,.5, -.5,.5, .5,-.5, .5,.5]), gl.STATIC_DRAW);

    /* brush texture: soft irregular cloud, so rotation reads as swirl */
    var bc = document.createElement("canvas"); bc.width = bc.height = 128;
    var bx = bc.getContext("2d");
    function blob(x, y, r, a) {
      var g = bx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(255,255,255," + a + ")"); g.addColorStop(1, "rgba(255,255,255,0)");
      bx.fillStyle = g; bx.fillRect(0, 0, 128, 128);
    }
    blob(64, 64, 62, 0.9); blob(84, 52, 30, 0.7); blob(42, 78, 32, 0.7); blob(70, 90, 26, 0.6); blob(50, 38, 24, 0.6);
    function tex(src, flip) {
      var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      if (src) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      return t;
    }
    var brushTex = tex(bc);

    /* wave pool */
    var waves = [], cur = 0, i;
    for (i = 0; i < OPT.waveCount; i++) waves.push({ x: 0, y: 0, s: 0, o: 0, r: 0 });

    var W = 0, H = 0, dpr = 1, fbo, fboTex, fW = 1, fH = 1, imgTex, imgAspect = 1, dirty = true, radius = 28;

    function makeFbo() {
      fW = Math.max(2, Math.ceil((W + PAD * 2) / 2)); fH = Math.max(2, Math.ceil((H + PAD * 2) / 2));
      if (fboTex) gl.deleteTexture(fboTex);
      fboTex = tex(null);
      gl.bindTexture(gl.TEXTURE_2D, fboTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fW, fH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      if (!fbo) fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboTex, 0);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    function resize() {
      var r = box.getBoundingClientRect();
      W = r.width; H = r.height; if (!W || !H) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      box.style.setProperty("--pad", PAD + "px");
      cv.style.width = (W + PAD * 2) + "px"; cv.style.height = (H + PAD * 2) + "px";
      cv.width = Math.round((W + PAD * 2) * dpr); cv.height = Math.round((H + PAD * 2) * dpr);
      radius = parseFloat(getComputedStyle(box).borderTopLeftRadius) || 28;
      makeFbo(); dirty = true;
    }

    function drawWaves() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, fW, fH);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.useProgram(waveP);
      gl.bindBuffer(gl.ARRAY_BUFFER, spriteQuad);
      var loc = gl.getAttribLocation(waveP, "aPos");
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, brushTex);
      gl.uniform1i(gl.getUniformLocation(waveP, "uBrush"), 0);
      gl.uniform2f(gl.getUniformLocation(waveP, "uRes"), W + PAD * 2, H + PAD * 2);
      var uC = gl.getUniformLocation(waveP, "uCenter"), uS = gl.getUniformLocation(waveP, "uSize"),
          uR = gl.getUniformLocation(waveP, "uRot"), uO = gl.getUniformLocation(waveP, "uOpacity");
      for (var k = 0; k < waves.length; k++) {
        var w = waves[k]; if (w.o <= 0) continue;
        gl.uniform2f(uC, w.x, w.y); gl.uniform1f(uS, OPT.waveSize * w.s);
        gl.uniform1f(uR, w.r); gl.uniform1f(uO, w.o);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    function drawFinal() {
      gl.viewport(0, 0, cv.width, cv.height);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(finP);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      var loc = gl.getAttribLocation(finP, "aPos");
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, fboTex);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, imgTex);
      gl.uniform1i(gl.getUniformLocation(finP, "uDisp"), 0);
      gl.uniform1i(gl.getUniformLocation(finP, "uImage"), 1);
      gl.uniform2f(gl.getUniformLocation(finP, "uCanvas"), W + PAD * 2, H + PAD * 2);
      gl.uniform2f(gl.getUniformLocation(finP, "uRectPos"), PAD, PAD);
      gl.uniform2f(gl.getUniformLocation(finP, "uRectSize"), W, H);
      gl.uniform1f(gl.getUniformLocation(finP, "uStrength"), OPT.distortionStrength);
      gl.uniform1f(gl.getUniformLocation(finP, "uRadius"), radius);
      gl.uniform1f(gl.getUniformLocation(finP, "uImgAspect"), imgAspect);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    /* animation loop: waves rotate, grow and fade every frame */
    function frame() {
      var any = false;
      for (var k = 0; k < waves.length; k++) {
        var w = waves[k];
        if (w.o > 0.002) { w.r += OPT.waveRotationSpeed; w.s = 0.982 * w.s + OPT.waveGrowth; w.o *= OPT.waveFadeMultiplier; any = true; }
        else w.o = 0;
      }
      if (any || dirty) { drawWaves(); drawFinal(); dirty = false; }
      requestAnimationFrame(frame);
    }

    /* pointer: spawn a wave on movement */
    var last = null;
    function spawn(cx, cy) {
      var r = cv.getBoundingClientRect(), x = cx - r.left, y = cy - r.top;
      if (last && Math.abs(x - last.x) < OPT.waveSpawnThreshold && Math.abs(y - last.y) < OPT.waveSpawnThreshold) return;
      last = { x: x, y: y };
      var w = waves[cur]; cur = (cur + 1) % waves.length;
      w.x = x; w.y = y; w.s = 0.2; w.o = 0.5; w.r = Math.random() * Math.PI * 2;
    }
    cv.addEventListener("pointermove", function (e) { spawn(e.clientX, e.clientY); });
    cv.addEventListener("pointerleave", function () { last = null; });

    /* load the photo into a texture (needs http(s); on file:// the plain photo stays) */
    function start() {
      imgAspect = img.naturalWidth / img.naturalHeight;
      imgTex = tex(img);
      resize(); drawWaves(); drawFinal();
      wrap.classList.add("ai-gl");
      window.addEventListener("resize", resize);
      requestAnimationFrame(frame);
    }
    function go() { try { start(); } catch (e) { console.warn("Ripple disabled:", e.message); } }
    if (img.complete && img.naturalWidth) go(); else img.addEventListener("load", go);
  } catch (err) {
    console.warn("Ripple disabled:", err.message);
  }
})();
