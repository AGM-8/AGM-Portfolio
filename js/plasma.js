/* ClosingPlasma — vanilla WebGL port.
   Usage: <canvas id="plasma"></canvas> then AGMPlasma.init(canvas, { ...options })
   Options mirror the Componentry props. */
(function () {
  var DEFAULTS = {
    speed: 1, turbulence: 1, mouseInfluence: 1, grain: 1, sparkle: 1,
    vignette: 1, opacity: 1, interactive: true,
    darkColorA: "#0d0d14", darkColorB: "#1f2540", darkColorC: "#4a6191",
    lightColorA: "#f0f2f7", lightColorB: "#d7dceb", lightColorC: "#bcc5e0",
    theme: "dark" // "dark" | "light"
  };

  function hex(h) {
    h = h.replace("#", "");
    return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
  }

  var VERT = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";

  var FRAG = [
    "precision highp float;",
    "uniform vec2 uRes;uniform float uTime;uniform vec2 uMouse;",
    "uniform float uTurb,uMouseInf,uGrain,uSparkle,uVig,uOpacity;",
    "uniform vec3 uA,uB,uC;",
    "float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}",
    "float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);",
    " return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}",
    "float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.02+vec2(1.7,9.2);a*=.5;}return v;}",
    "void main(){",
    " vec2 uv=gl_FragCoord.xy/uRes;",
    " vec2 p=(gl_FragCoord.xy-.5*uRes)/min(uRes.x,uRes.y);",
    " float t=uTime*.12;",
    " vec2 m=(uMouse-.5)*vec2(uRes.x/uRes.y,1.);",
    " float md=length(p-m);",
    " float pull=exp(-md*2.6)*uMouseInf;",
    " vec2 q=p*1.4+(m-p)*pull*.35;",
    " vec2 w=vec2(fbm(q+vec2(0.,t)),fbm(q+vec2(5.2,1.3)-t));",
    " w=(w-.5)*2.*uTurb;",
    " vec2 r=vec2(fbm(q+2.2*w+vec2(1.7,9.2)+t*.8),fbm(q+2.2*w+vec2(8.3,2.8)-t*.6));",
    " float f=fbm(q+2.4*r);",
    " float ridge=1.-abs(2.*f-1.);",
    " ridge=pow(ridge,2.2);",
    " vec3 col=mix(uA,uB,smoothstep(.15,.65,f));",
    " col=mix(col,uC,smoothstep(.45,1.,ridge*(.6+.8*length(r))));",
    " col+=uC*pull*.22;",
    " float sp=hash(floor(gl_FragCoord.xy/2.)+floor(uTime*6.));",
    " float tw=step(.9965,sp)*ridge*uSparkle;",
    " col+=vec3(.75,.85,1.)*tw*.9;",
    " float g=(hash(gl_FragCoord.xy+uTime*60.)-.5)*.09*uGrain;",
    " col+=g;",
    " float v=smoothstep(1.15,.25,length(uv-.5)*1.25);",
    " col*=mix(1.,v,clamp(uVig,0.,1.5)*.9);",
    " gl_FragColor=vec4(col,uOpacity);",
    "}"
  ].join("\n");

  function init(canvas, opts) {
    var o = Object.assign({}, DEFAULTS, opts || {});
    var gl = canvas.getContext("webgl", { antialias: false, alpha: true, premultipliedAlpha: false });
    if (!gl) { canvas.style.background = "radial-gradient(circle at 50% 40%," + o.darkColorC + "," + o.darkColorB + " 45%," + o.darkColorA + ")"; return; }

    function sh(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
      return s;
    }
    var prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog); gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    var U = {};
    ["uRes", "uTime", "uMouse", "uTurb", "uMouseInf", "uGrain", "uSparkle", "uVig", "uOpacity", "uA", "uB", "uC"]
      .forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });

    var light = o.theme === "light";
    gl.uniform3fv(U.uA, hex(light ? o.lightColorA : o.darkColorA));
    gl.uniform3fv(U.uB, hex(light ? o.lightColorB : o.darkColorB));
    gl.uniform3fv(U.uC, hex(light ? o.lightColorC : o.darkColorC));
    gl.uniform1f(U.uTurb, o.turbulence);
    gl.uniform1f(U.uMouseInf, o.mouseInfluence);
    gl.uniform1f(U.uGrain, o.grain);
    gl.uniform1f(U.uSparkle, o.sparkle);
    gl.uniform1f(U.uVig, o.vignette);
    gl.uniform1f(U.uOpacity, o.opacity);

    var dpr = Math.min(window.devicePixelRatio || 1, o.maxDpr || 1.5);
    function resize() {
      var w = canvas.clientWidth, h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
    }
    resize();
    window.addEventListener("resize", resize);

    var target = [.5, .5], cur = [.5, .5];
    if (o.interactive) {
      window.addEventListener("pointermove", function (e) {
        target = [e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight];
      });
    }

    var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    var start = performance.now(), running = true;
    document.addEventListener("visibilitychange", function () { running = !document.hidden; if (running) requestAnimationFrame(frame); });

    function frame(now) {
      if (!running) return;
      cur[0] += (target[0] - cur[0]) * .06;
      cur[1] += (target[1] - cur[1]) * .06;
      gl.uniform1f(U.uTime, reduce ? 20 : ((now - start) / 1000) * o.speed);
      gl.uniform2f(U.uMouse, cur[0], cur[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!reduce) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  window.AGMPlasma = { init: init };
})();
