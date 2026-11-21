/* =========================================================
   Background music — comes from your Google Drive folder and plays once, from the start to the end.
   • The first audio file in the Drive folder below is played. No audio file in the folder = no music.
   • Starts on the intro page (index.html); refreshing the intro restarts it from the beginning.
   • Browsers block sound until the visitor's first click / tap / key press, so if autoplay is blocked it starts then.
   • It carries on through the site: each page resumes the track from where the last one stopped.
   • Clicking Shots or Cinematic Edits fades the music out and ends it for the rest of the visit.
   • Needs the API key in js/drive-config.js and the folder shared as "Anyone with the link → Viewer".
   ========================================================= */
(function () {
  "use strict";
  var FOLDER = "https://drive.google.com/drive/folders/1YBhgvwSfpr3fhLO1j72mI7F_L0LbAGuU";
  var KEY = "agm_music", VOLUME = 0.85, FADE_MS = 900;
  var page = document.body.getAttribute("data-page");
  var STOP_PAGES = { shots: 1, edits: 1 };      // body data-page of the pages that end the music

  function load() { try { return JSON.parse(sessionStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save(s) { try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  var st = load();
  if (page === "intro") { st = {}; save(st); }     // opening / refreshing the intro page always restarts the music
  if (STOP_PAGES[page]) { st.ended = true; save(st); return; }
  if (st.ended || st.none || !window.AGMDrive) return;

  var audio = null, gone = false, wantPlay = false;
  var gestures = ["pointerdown", "keydown", "touchstart", "click"];
  function removeGesture() { gestures.forEach(function (g) { document.removeEventListener(g, onGesture, true); }); }
  function onGesture() { wantPlay = true; if (audio && !gone) tryPlay(); }
  gestures.forEach(function (g) { document.addEventListener(g, onGesture, true); });

  function snapshot(extra) {
    var s = { started: true, t: audio ? audio.currentTime || 0 : 0, ts: Date.now(), ended: false, id: st.id };
    if (extra) for (var k in extra) s[k] = extra[k];
    save(s);
  }
  function tryPlay() {
    var p = audio.play();
    if (p && p.then) p.then(function () { removeGesture(); snapshot(); }, function () { /* blocked — wait for the first interaction */ });
  }

  function start(fileId) {
    st.id = fileId;
    audio = new Audio("https://www.googleapis.com/drive/v3/files/" + fileId + "?alt=media&key=" + encodeURIComponent(window.AGM_DRIVE_KEY || ""));
    audio.preload = "auto"; audio.volume = VOLUME; audio.loop = false;
    var startAt = 0;
    if (st.started && typeof st.t === "number") startAt = st.t + Math.min(3, Math.max(0, (Date.now() - (st.ts || Date.now())) / 1000));
    audio.addEventListener("loadedmetadata", function () { if (startAt && startAt < audio.duration - 0.5) { try { audio.currentTime = startAt; } catch (e) {} } });
    audio.addEventListener("timeupdate", function () { if (!gone) snapshot(); });
    audio.addEventListener("ended", function () { gone = true; save({ started: true, ended: true }); });
    window.addEventListener("pagehide", function () { if (!gone && !audio.paused) snapshot(); });
    tryPlay();
    if (wantPlay) tryPlay();
  }

  /* find the music in the Drive folder (remembered for the other pages of this visit) */
  if (st.id) start(st.id);
  else {
    var p = AGMDrive.parse(FOLDER);
    AGMDrive.list(p, AGMDrive.isAudio).then(function (files) {
      if (!files.length) { st.none = true; save({ none: true }); removeGesture(); return; }   // nothing in the folder: no music
      start(files[0].id);
    }, function () { removeGesture(); });
  }

  /* ---- fade out and end (Shots / Cinematic Edits clicked) ---- */
  function fadeEnd(done) {
    gone = true; save({ started: true, ended: true });
    var v0 = audio.volume, t0 = performance.now();
    (function step(now) {
      var k = Math.min(1, (now - t0) / FADE_MS);
      audio.volume = Math.max(0, v0 * (1 - k));
      if (k < 1) requestAnimationFrame(step); else { audio.pause(); if (done) done(); }
    })(t0);
  }
  document.addEventListener("click", function (e) {
    if (e.defaultPrevented) return;
    var a = e.target.closest && e.target.closest("a[href]"); if (!a) return;
    if (!/(^|\/)(shots|cinematic-edits)\.html(\?|#|$)/.test(a.getAttribute("href") || "")) return;
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button > 0 || a.target === "_blank" || !audio || gone || audio.paused) { gone = true; save({ started: true, ended: true }); return; }
    e.preventDefault();
    var url = a.href;
    fadeEnd(function () { window.location.href = url; });
  });
})();
