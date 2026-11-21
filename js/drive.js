/* =========================================================
   AGMDrive — show Google Drive files / folders directly on a page.
   Paste a Drive link (a folder or a single file) and the page lists what is inside and shows it itself.
   Needs: link shared as "Anyone with the link → Viewer"; folders also need the API key in js/drive-config.js.
   ========================================================= */
(function () {
  "use strict";
  var cache = {};

  function parse(link) {
    link = (link || "").trim();
    if (!/^https?:\/\/(?:drive|docs)\.google\.com\//i.test(link)) return null;
    var m;
    if ((m = link.match(/\/folders\/([\w-]{10,})/))) return { kind: "folder", id: m[1], link: link };
    if ((m = link.match(/\/(?:file|document|presentation|spreadsheets)\/d\/([\w-]{10,})/))) return { kind: "file", id: m[1], link: link };
    if ((m = link.match(/[?&]id=([\w-]{10,})/))) return { kind: /folderview/.test(link) ? "folder" : "file", id: m[1], link: link };
    return null;
  }
  function key() { return window.AGM_DRIVE_KEY || (window.AGM_DRIVE && window.AGM_DRIVE.apiKey) || ""; }

  /* picture served straight from Drive (w = width in px; 0 = original size) */
  function img(id, w) { return "https://lh3.googleusercontent.com/d/" + id + (w ? "=w" + w : "=s0"); }
  function thumb(id, w) { return "https://drive.google.com/thumbnail?id=" + id + "&sz=w" + (w || 1000); }
  function preview(id) { return "https://drive.google.com/file/d/" + id + "/preview"; }
  function view(id) { return "https://drive.google.com/file/d/" + id + "/view"; }
  function clean(name) { return String(name || "").replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim(); }

  function api(path, params) {
    var u = "https://www.googleapis.com/drive/v3/" + path + "?" + params + "&supportsAllDrives=true&key=" + encodeURIComponent(key());
    return fetch(u).then(function (r) {
      if (!r.ok) { var e = new Error("Drive " + r.status); e.status = r.status; throw e; }
      return r.json();
    });
  }

  /* files inside a parsed link. filter(mimeType) keeps only the kinds you want. Resolves to [{id,name,mimeType}] */
  function list(p, filter) {
    var ck = p.kind + p.id;
    var job = cache[ck] || (cache[ck] = (function () {
      if (p.kind === "file") {
        if (!key() || !window.fetch) return Promise.resolve([{ id: p.id, name: "", mimeType: "" }]);
        return api("files/" + p.id, "fields=id,name,mimeType").then(function (f) { return [f]; }, function () { return [{ id: p.id, name: "", mimeType: "" }]; });
      }
      if (!key()) return Promise.reject(new Error("Folders need the API key — see js/drive-config.js"));
      var out = [];
      function page(tok) {
        return api("files", "pageSize=200&orderBy=name&fields=nextPageToken,files(id,name,mimeType)&includeItemsFromAllDrives=true" +
          "&q=" + encodeURIComponent("'" + p.id + "' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'") +
          (tok ? "&pageToken=" + encodeURIComponent(tok) : "")).then(function (j) {
          out = out.concat(j.files || []);
          return j.nextPageToken ? page(j.nextPageToken) : out;
        });
      }
      return page();
    })());
    job.catch(function () { delete cache[ck]; });
    return job.then(function (files) { return filter ? files.filter(function (f) { return !f.mimeType || filter(f.mimeType); }) : files; });
  }

  /* records = [{link,title,id?}]  ->  [{rec, file}] for every file found; failures are reported, not fatal */
  function expand(records, filter) {
    var out = [];
    return records.reduce(function (p, rec) {
      return p.then(function () {
        var pr = parse(rec.link);
        if (!pr) return;
        return list(pr, filter).then(function (files) { files.forEach(function (f) { out.push({ rec: rec, file: f, single: pr.kind === "file" }); }); },
          function (e) { toast(e.status === 403 || e.status === 404 ? "Couldn't open a Drive link — is it shared as “Anyone with the link”?" : "Couldn't read a Drive link: " + e.message); });
      });
    }, Promise.resolve()).then(function () { return out; });
  }

  /* permanent links you list in the page itself:  window.AGM_DRIVE_LINKS = ["https://drive.google.com/drive/folders/…", …] */
  function permanent() { return (window.AGM_DRIVE_LINKS || []).map(function (l, i) { return { id: "perm" + i, link: l, title: "", permanent: true }; }); }

  var tt = 0;
  function toast(msg) {
    var t = document.querySelector(".agm-toast");
    if (!t) { t = document.createElement("div"); t.className = "agm-toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg; void t.offsetWidth; t.classList.add("show");
    clearTimeout(tt); tt = setTimeout(function () { t.classList.remove("show"); }, 5200);
  }

  var isImg = function (m) { return m.indexOf("image/") === 0; };
  var isVideo = function (m) { return m.indexOf("video/") === 0; };
  var isAudio = function (m) { return m.indexOf("audio/") === 0; };

  window.AGMDrive = { parse: parse, list: list, expand: expand, permanent: permanent, toast: toast, img: img, thumb: thumb, preview: preview, view: view, clean: clean, isImg: isImg, isVideo: isVideo, isAudio: isAudio, hasKey: function () { return !!key(); } };
})();
