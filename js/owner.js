/* =========================================================
   AGMOwner — the shared "+" button for every page.
   Click "+" -> password -> add / remove your own work. Same password as Cinematic Edits and Photography.
   Everything added is stored in THIS browser only (IndexedDB); files are kept byte-for-byte (original quality).
   Each page calls AGMOwner.init({...}) with its own fields and a render function (see the bottom of each page).
   ========================================================= */
(function () {
  "use strict";
  var PASS_HASH = "c1478e6ee33661a477b4272c853233478a1f61c94cb0fbb73dc0c72fa780024c"; // SHA-256 of the owner password — the password itself is never written in the site files
  var SALT = "agm::";

  function $(s, r) { return (r || document).querySelector(s); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

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

  /* ---------------- modal plumbing ---------------- */
  var open = 0;
  function show(m) { m.hidden = false; document.documentElement.classList.add("ec-lock"); open++; }
  function hide(m) {
    if (m.hidden) return; m.hidden = true; open = Math.max(0, open - 1);
    if (!open) document.documentElement.classList.remove("ec-lock");
    if (m.__onClose) m.__onClose();
  }
  function modal(html, small) {
    var m = el("div", "ec-modal"); m.hidden = true;
    m.innerHTML = '<div class="ec-card' + (small ? " sm" : "") + '" role="dialog" aria-modal="true"><button class="ec-x" type="button" data-close aria-label="Close">×</button>' + html + "</div>";
    m.addEventListener("mousedown", function (e) { if (e.target === m) hide(m); });
    $("[data-close]", m).addEventListener("click", function () { hide(m); });
    document.body.appendChild(m); return m;
  }
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    var ms = [].slice.call(document.querySelectorAll(".ec-modal")).filter(function (m) { return !m.hidden && !m.hasAttribute("data-own"); });
    if (ms.length) hide(ms[ms.length - 1]);
  });

  /* ---------------- password gate (3 wrong tries = 30 s lock, shared across pages) ---------------- */
  var gateM = null, attempts = 0;
  function lockLeft() { try { return Math.max(0, Math.ceil((+localStorage.getItem("agm_edit_lock") - Date.now()) / 1000)); } catch (e) { return 0; } }
  function gate(note, ok) {
    if (!gateM) {
      gateM = modal('<h2>Owner access</h2><p class="ec-note"></p><form autocomplete="off"><div class="field"><label for="agm-pw">Password</label><input id="agm-pw" type="password" autocomplete="off" required></div><p class="ec-err" role="alert"></p><button class="btn solid" type="submit">Unlock</button></form>', true);
    }
    var f = $("form", gateM), pw = $("input", gateM), err = $(".ec-err", gateM);
    $(".ec-note", gateM).textContent = note; err.textContent = ""; pw.value = "";
    f.onsubmit = function (e) {
      e.preventDefault();
      var wait = lockLeft();
      if (wait) { err.textContent = "Too many attempts. Try again in " + wait + "s."; return; }
      if (sha256(SALT + pw.value) === PASS_HASH) { attempts = 0; pw.value = ""; hide(gateM); ok(); }
      else {
        attempts++; pw.value = "";
        if (attempts >= 3) { attempts = 0; try { localStorage.setItem("agm_edit_lock", String(Date.now() + 30000)); } catch (x) {} err.textContent = "Too many attempts. Locked for 30 seconds."; }
        else err.textContent = "Wrong password.";
      }
    };
    show(gateM); setTimeout(function () { pw.focus(); }, 60);
  }

  function plusButton(label, onClick) {
    var b = el("button", "ec-add", '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>');
    b.type = "button"; b.setAttribute("aria-label", label); b.title = label;
    b.addEventListener("click", onClick); document.body.appendChild(b); return b;
  }

  /* ---------------- generic page store + add/manage panel ---------------- */
  function init(o) {
    var dbp = null, records = [], panel = null, unlocked = false;
    function db() {
      if (dbp) return dbp;
      dbp = new Promise(function (res, rej) {
        if (!window.indexedDB) { rej(new Error("This browser can't store files.")); return; }
        var r = indexedDB.open("agm-" + o.page, 1);
        r.onupgradeneeded = function () { r.result.createObjectStore("items", { keyPath: "id" }); };
        r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
      });
      return dbp;
    }
    function tx(mode, fn) {
      return db().then(function (d) {
        return new Promise(function (res, rej) {
          var t = d.transaction("items", mode), req = fn(t.objectStore("items"));
          t.oncomplete = function () { res(req && req.result); };
          t.onerror = t.onabort = function () { rej(t.error || new Error("Storage error")); };
        });
      });
    }
    function reload() {
      return tx("readonly", function (s) { return s.getAll(); }).then(function (r) { records = (r || []).sort(function (a, b) { return a.created - b.created; }); }, function () { records = []; })
        .then(function () { try { o.render(records); } catch (e) { if (window.console) console.error(e); } });
    }

    function fieldHtml(f, i) {
      var id = "agm-f-" + i, lab = esc(f.label) + (f.optional ? " <small>(optional)</small>" : "");
      if (f.type === "textarea") return '<div class="field"><label for="' + id + '">' + lab + '</label><textarea id="' + id + '" rows="3" maxlength="' + (f.max || 600) + '"' + (f.optional ? "" : " required") + "></textarea></div>";
      if (f.type === "select") return '<div class="field"><label for="' + id + '">' + lab + '</label><select id="' + id + '">' + f.options.map(function (op) { return '<option value="' + esc(op[0]) + '">' + esc(op[1]) + "</option>"; }).join("") + "</select></div>";
      if (f.type === "file") return '<div class="field"><label for="' + id + '">' + lab + '</label><input id="' + id + '" type="file" accept="' + esc(f.accept || "") + '"' + (f.multiple ? " multiple" : "") + "></div>";
      return '<div class="field"><label for="' + id + '">' + lab + '</label><input id="' + id + '" type="' + (f.type || "text") + '" maxlength="' + (f.max || 120) + '" placeholder="' + esc(f.placeholder || "") + '"' + (f.optional ? "" : " required") + "></div>";
    }
    function build() {
      panel = modal('<h2>' + esc(o.title) + '</h2><p class="ec-note">' + o.note + '</p><form autocomplete="off">' + o.fields.map(fieldHtml).join("") +
        '<p class="ec-err" role="alert"></p><div class="ec-actions"><button class="btn solid" type="submit">' + esc(o.button || "Add") + '</button><span role="status"></span></div></form>' +
        '<div class="ec-added"><h3>Added by you</h3><ul class="pg-list"></ul><p class="ec-note" style="margin:0">Things added here are saved in <b>this browser only</b>, so other visitors won\'t see them. ' + (o.permanent || "") + "</p></div>");
      panel.__onClose = function () { unlocked = false; };
      $(".ec-card", panel).style.maxHeight = "92vh"; $(".ec-card", panel).style.overflowY = "auto";
      $("form", panel).addEventListener("submit", submit);
    }
    function renderList() {
      var ul = $(".pg-list", panel); ul.innerHTML = "";
      if (!records.length) ul.appendChild(el("li", "ec-empty-li", "Nothing added yet."));
      records.forEach(function (r) {
        var li = el("li"), b = el("b"); b.textContent = (o.label ? o.label(r) : r.title) || r.fileName || "Untitled"; li.appendChild(b);
        var rm = el("button", "ec-mini danger", "Remove"); rm.type = "button";
        rm.addEventListener("click", function () {
          if (!rm.classList.contains("sure")) { rm.classList.add("sure"); rm.textContent = "Sure?"; setTimeout(function () { rm.classList.remove("sure"); rm.textContent = "Remove"; }, 3000); return; }
          if (!unlocked) return;
          tx("readwrite", function (s) { return s.delete(r.id); }).then(reload).then(renderList);
        });
        li.appendChild(rm); ul.appendChild(li);
      });
    }
    function submit(e) {
      e.preventDefault(); if (!unlocked) return;
      var form = e.target, err = $(".ec-err", panel), st = $("[role=status]", panel), btn = $(".btn", panel); err.textContent = "";
      var vals = {}, files = [], fileField = null;
      o.fields.forEach(function (f, i) {
        var inp = $("#agm-f-" + i, form);
        if (f.type === "file") { fileField = f; files = [].slice.call(inp.files || []); }
        else vals[f.name] = (inp.value || "").trim();
      });
      if (fileField && !fileField.optional && !files.length) { err.textContent = "Choose a file first."; return; }
      var jobs = files.length ? files : [null];
      btn.disabled = true; var done = 0, now = Date.now();
      var chain = jobs.reduce(function (p, f, n) {
        return p.then(function () {
          st.textContent = "Saving " + (n + 1) + " of " + jobs.length + "…";
          var rec = { id: now.toString(36) + n + Math.random().toString(36).slice(2, 6), created: now + n };
          Object.keys(vals).forEach(function (k) { rec[k] = vals[k]; });
          if (f) { rec.file = f; rec.fileName = f.name; rec.fileType = f.type; if (!rec.title && o.titleFromFile !== false) rec.title = f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "); }
          var first = (o.single && n === 0) ? tx("readwrite", function (s) { return s.clear(); }) : Promise.resolve();
          return first.then(function () { return tx("readwrite", function (s) { return s.put(rec); }); }).then(function () { done++; });
        });
      }, Promise.resolve());
      chain.then(reload).then(function () { st.textContent = "Added ✓"; btn.disabled = false; form.reset(); renderList(); setTimeout(function () { st.textContent = ""; }, 1800); })
        .catch(function (x) {
          btn.disabled = false; st.textContent = "";
          err.textContent = (done ? done + " saved. " : "") + (/quota/i.test(String(x && (x.name + x.message))) ? "Not enough browser storage. Try fewer or smaller files." : "Couldn't save: " + ((x && x.message) || "browser storage is unavailable (private window?)"));
          if (done) reload().then(renderList);
        });
    }

    plusButton(o.aria || "Add (owner only)", function () {
      gate("Enter the password to add or remove " + (o.noun || "items") + ".", function () {
        unlocked = true; if (!panel) build();
        $(".ec-err", panel).textContent = ""; $("[role=status]", panel).textContent = ""; renderList(); show(panel);
      });
    });
    reload();
    return { reload: reload };
  }

  window.AGMOwner = { init: init, gate: gate, plusButton: plusButton, esc: esc, el: el };
})();
