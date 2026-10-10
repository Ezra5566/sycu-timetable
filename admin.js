/* ============================================================
   SYCU Timetable — administration
   Login-gated editing of the timetable data (semesters, programs,
   classes, rooms). Edits persist in localStorage and can be
   exported back to data/timetable.js for publishing.
   Depends on: app.js (window.SYCU_APP)
   ============================================================ */
(function () {
  "use strict";

  if (!window.SYCU_APP) return; // viewer failed to load — nothing to manage

  /* ---- credentials ------------------------------------------
     Only a salted SHA-256 digest is shipped — never the password.
     Login: sycu@admin.com / sycu#timetableweb */
  var AUTH = {
    email: "sycu@admin.com",
    digest: "89824fa3a5bf7568380f4a44cf849703b01bf6fd9c7d5eef7975866bd2a351d8",
    salt: "sycu-timetable-admin-v1"
  };
  var SESSION_KEY = "sycu.admin.session";
  var SESSION_MS = 8 * 60 * 60 * 1000; // signed-in for 8 hours
  var MAX_FAILS = 5, LOCK_MS = 30000;  // soft brute-force brake
  var fails = 0, lockUntil = 0;

  /* ---- tiny sha256 (ASCII/UTF-8 safe) ---------------------- */
  function toBytes(str) {
    return String(str).replace(/[\u0080-\uFFFF]/g, function (ch) {
      var c = ch.charCodeAt(0);
      if (c < 0x800) return String.fromCharCode(0xC0 | (c >> 6), 0x80 | (c & 0x3f));
      return String.fromCharCode(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    });
  }
  function sha256(ascii) {
    function rightRotate(value, amount) { return (value >>> amount) | (value << (32 - amount)); }
    var mathPow = Math.pow, maxWord = mathPow(2, 32), lengthProperty = "length";
    var i, j, result = "", words = [], asciiBitLength = ascii[lengthProperty] * 8;
    var hash = sha256.h = sha256.h || [];
    var k = sha256.k = sha256.k || [];
    var primeCounter = k[lengthProperty];
    var isComposite = {};
    for (var candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (i = 0; i < 313; i += candidate) { isComposite[i] = candidate; }
        hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    ascii += "\x80";
    while ((ascii[lengthProperty] % 64) - 56) ascii += "\x00";
    for (i = 0; i < ascii[lengthProperty]; i++) {
      j = ascii.charCodeAt(i);
      words[i >> 2] |= j << (((3 - i) % 4) * 8);
    }
    words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
    words[words[lengthProperty]] = asciiBitLength;
    for (j = 0; j < words[lengthProperty];) {
      var w = words.slice(j, (j += 16));
      var oldHash = hash;
      hash = hash.slice(0, 8);
      for (i = 0; i < 64; i++) {
        var w15 = w[i - 15], w2 = w[i - 2];
        var a = hash[0], e = hash[4];
        var temp1 = hash[7]
          + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
          + ((e & hash[5]) ^ ((~e) & hash[6]))
          + k[i]
          + (w[i] = i < 16 ? w[i] : (
            w[i - 16]
            + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
            + w[i - 7]
            + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
          ) | 0);
        var temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
          + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(temp1 + temp2) | 0].concat(hash);
        hash[4] = (hash[4] + temp1) | 0;
      }
      for (i = 0; i < 8; i++) { hash[i] = (hash[i] + oldHash[i]) | 0; }
    }
    for (i = 0; i < 8; i++) {
      for (j = 3; j + 1; j--) {
        var b = (hash[i] >> (j * 8)) & 255;
        result += ((b < 16) ? "0" : "") + b.toString(16);
      }
    }
    return result;
  }
  function credDigest(pw) { return sha256(toBytes(AUTH.email + "|" + pw + "|" + AUTH.salt)); }

  /* ---- session -------------------------------------------- */
  function sig(email, exp) { return sha256(toBytes(email + "|" + exp + "|" + AUTH.salt)); }
  function readSession() {
    try {
      var raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || s.email !== AUTH.email) return null;
      if (!s.exp || s.exp < Date.now()) { sessionStorage.removeItem(SESSION_KEY); return null; }
      if (s.sig !== sig(s.email, s.exp)) return null; // tampered
      return s;
    } catch (e) { return null; }
  }
  function writeSession() {
    var exp = Date.now() + SESSION_MS;
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ email: AUTH.email, exp: exp, sig: sig(AUTH.email, exp) }));
    } catch (e) { /* private mode */ }
  }
  function clearSession() { try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {} }
  function isActive() { return !!readSession(); }

  /* ---- publishing token (from POST /api/login) ------------- */
  var TOKEN_KEY = "sycu.admin.token";
  function readToken() {
    try {
      var raw = sessionStorage.getItem(TOKEN_KEY);
      if (!raw) return null;
      var t = JSON.parse(raw);
      if (!t || !t.token || !t.exp || t.exp < Date.now()) { sessionStorage.removeItem(TOKEN_KEY); return null; }
      return t.token;
    } catch (e) { return null; }
  }
  function writeToken(token, exp) {
    try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token: token, exp: exp })); } catch (e) {}
  }
  function clearToken() { try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) {} }

  function apiSend(method, path, body, token) {
    return fetch("api/" + path, {
      method: method,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + (token || "") },
      body: JSON.stringify(body || {})
    }).then(function (r) {
      return r.json().then(function (j) { return { status: r.status, body: j }; });
    });
  }

  /* ---- dom helpers ---------------------------------------- */
  function $(id) { return document.getElementById(id); }
  var esc = window.SYCU_APP.esc;
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function stamp() {
    var d = new Date(), p = function (n) { return n < 10 ? "0" + n : "" + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }
  function toast(msg, kind) {
    var box = $("toasts");
    if (!box) return;
    var t = el("div", "toast" + (kind === "err" ? " err" : ""));
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(function () { t.classList.add("out"); }, 2600);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 3200);
  }

  /* ---- ids ------------------------------------------------- */
  function slug(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "item";
  }
  function allIds(d) {
    var set = {};
    d.semesters.forEach(function (s) {
      set[s.id] = 1;
      (s.programs || []).forEach(function (p) { set[p.id] = 1; });
    });
    return set;
  }
  function uniqueId(base, taken) {
    var id = base, n = 2;
    while (taken[id]) { id = base + "-" + n++; }
    return id;
  }

  /* ============================================================
     LOGIN
     ============================================================ */
  function openLogin() {
    $("login-error").classList.add("hidden");
    $("login-overlay").classList.remove("hidden");
    setTimeout(function () { $("login-email").focus(); }, 30);
  }
  function closeLogin() {
    $("login-overlay").classList.add("hidden");
    $("login-pass").value = "";
  }
  function applyAdminUI(on) {
    $("adminbar").classList.toggle("hidden", !on);
    $("admin-btn").classList.toggle("on", on);
    $("admin-btn").title = on ? "Signed in as " + AUTH.email : "Administration";
    window.SYCU_APP.renderAll();
  }
  /* Ask the server for a publishing token. Without one (offline, no
     API, static hosting) admin edits stay on this device — exactly
     the original behaviour, with Export as the publishing path. */
  function requestToken(pw) {
    var localMode = function (msg) { clearToken(); toast(msg); };
    if (typeof fetch !== "function" || location.protocol === "file:") {
      localMode("Signed in — offline editing, use Export to publish");
      return;
    }
    apiSend("POST", "login", { email: AUTH.email, password: pw })
      .then(function (r) {
        if (r.status === 200 && r.body && r.body.ok && r.body.token) {
          writeToken(r.body.token, r.body.exp);
          toast("Signed in — changes go live for everyone");
        } else {
          localMode("Signed in — live publishing unavailable, edits stay on this device");
        }
      })
      .catch(function () {
        localMode("Signed in — server unreachable, edits stay on this device");
      });
  }

  function login(email, pw) {
    var err = $("login-error");
    if (Date.now() < lockUntil) {
      err.textContent = "Too many attempts — try again in " + Math.ceil((lockUntil - Date.now()) / 1000) + "s.";
      err.classList.remove("hidden");
      return;
    }
    if (email.trim().toLowerCase() === AUTH.email && credDigest(pw) === AUTH.digest) {
      fails = 0;
      writeSession();
      requestToken(pw);
      closeLogin();
      applyAdminUI(true);
    } else {
      fails++;
      if (fails >= MAX_FAILS) {
        lockUntil = Date.now() + LOCK_MS;
        fails = 0;
        err.textContent = "Too many attempts — locked for 30 seconds.";
      } else {
        err.textContent = "Wrong email or password. " + (MAX_FAILS - fails) + " attempt(s) left.";
      }
      err.classList.remove("hidden");
    }
  }
  function logout() {
    clearSession();
    clearToken();
    applyAdminUI(false);
    toast("Signed out");
  }

  /* ============================================================
     MANAGER
     ============================================================ */
  var mgr = { open: false, tab: "programs", semId: null, progId: null, draft: null, base: "" };

  function getSem(id) {
    return mgr.draft.semesters.filter(function (s) { return s.id === id; })[0] || null;
  }
  function getProg(sem, id) {
    if (!sem) return null;
    return (sem.programs || []).filter(function (p) { return p.id === id; })[0] || null;
  }
  function progNow() { return getProg(getSem(mgr.semId), mgr.progId); }
  function slotsOf(sem) {
    var fmt = mgr.draft.timeSlotFormats[sem.timeSlotFormat];
    return fmt ? fmt.slots : [];
  }
  /* Selectable sessions for a semester: every slot of its format, plus
     paired double lessons (1-2, 3-4, 5-6, 7-8) for single-session formats
     so the teacher can mark a two-period lesson directly. */
  function sessionOptions(d, sem) {
    var fmt = d.timeSlotFormats[sem.timeSlotFormat];
    var slots = (fmt && fmt.slots) || [];
    var opts = slots.map(function (sl) {
      return { value: String(sl.session), time: String(sl.time), dbl: false };
    });
    if (sem.timeSlotFormat !== "block4" && slots.length > 1) {
      for (var i = 0; i + 1 < slots.length; i += 2) {
        var a = slots[i], b = slots[i + 1];
        var start = String(a.time).split("-")[0];
        var end = String(b.time).split("-").pop();
        opts.push({ value: String(a.session) + "-" + String(b.session), time: start + "-" + end, dbl: true });
      }
    }
    return opts;
  }
  /* <option> markup for a schedule row's session select, with the current
     value selected (unknown/imported values keep a custom option). */
  function sessionOptHtml(opts, cur) {
    var c = String(cur);
    var known = opts.some(function (o) { return o.value === c; });
    var tag = function (o) {
      return '<option value="' + esc(o.value) + '"' + (o.value === c ? " selected" : "") +
        ">Session " + esc(o.value) + " · " + esc(o.time) + "</option>";
    };
    var html = known ? "" : '<option value="' + esc(c) + '" selected>Session ' + esc(c) + "</option>";
    html += opts.filter(function (o) { return !o.dbl; }).map(tag).join("");
    var dbls = opts.filter(function (o) { return o.dbl; }).map(tag).join("");
    if (dbls) html += '<optgroup label="Double lessons">' + dbls + "</optgroup>";
    return html;
  }

  function openManager(progId) {
    if (!isActive()) { openLogin(); return; }
    mgr.draft = clone(window.SYCU_APP.getData());
    mgr.base = JSON.stringify(mgr.draft);
    mgr.open = true;
    mgr.progId = null;
    if (progId) {
      for (var i = 0; i < mgr.draft.semesters.length; i++) {
        var s = mgr.draft.semesters[i];
        if ((s.programs || []).some(function (p) { return p.id === progId; })) {
          mgr.semId = s.id;
          mgr.progId = progId;
          mgr.tab = "programs";
          break;
        }
      }
    }
    if (!mgr.semId || !getSem(mgr.semId)) {
      mgr.semId = window.SYCU_APP.getState().sem || (mgr.draft.semesters[0] && mgr.draft.semesters[0].id) || null;
    }
    $("mgr-overlay").classList.remove("hidden");
    render();
  }
  function isDirty() { return JSON.stringify(mgr.draft) !== mgr.base; }
  function closeManager(force) {
    if (!force && isDirty() && !window.confirm("Discard unsaved changes?")) return;
    mgr.open = false;
    mgr.draft = null;
    $("mgr-overlay").classList.add("hidden");
  }
  function updateDirty() {
    var f = $("mgr-dirty");
    f.textContent = isDirty() ? "● Unsaved changes" : "";
    f.classList.toggle("on", isDirty());
  }

  function render() {
    var tabs = $("mgr-tabs").querySelectorAll("button");
    Array.prototype.forEach.call(tabs, function (b) {
      b.classList.toggle("on", b.getAttribute("data-tab") === mgr.tab);
    });
    var body = $("mgr-body");
    body.textContent = "";
    if (mgr.tab === "semesters") renderSemestersTab(body);
    else if (mgr.tab === "programs") renderProgramsTab(body);
    else renderRoomsTab(body);
    updateDirty();
  }

  /* ---- semesters tab ---- */
  function renderSemestersTab(body) {
    body.appendChild(el("p", "mgr-hint",
      "Semesters appear as tabs on the site. The time slot format sets the session rows — " +
      "<b>standard8</b> = 8 single sessions (double lessons 1-2 … 7-8 selectable per class), " +
      "<b>block4</b> = 4 double blocks."));
    var formats = Object.keys(mgr.draft.timeSlotFormats || {});
    mgr.draft.semesters.forEach(function (s, i) {
      var row = el("div", "mgr-row row-sem");
      row.innerHTML =
        '<input data-field="sem-name" data-i="' + i + '" value="' + esc(s.name || "") + '" placeholder="Name (e.g. 2027 Spring)" />' +
        '<input data-field="sem-namecn" data-i="' + i + '" value="' + esc(s.nameCN || "") + '" placeholder="Chinese name (optional)" />' +
        '<select data-field="sem-format" data-i="' + i + '">' + formats.map(function (f) {
          return '<option value="' + esc(f) + '"' + (s.timeSlotFormat === f ? " selected" : "") + ">" + esc(f) + "</option>";
        }).join("") + "</select>" +
        '<span class="pill">' + (s.programs || []).length + " programs</span>" +
        '<button class="btn-icon danger" type="button" data-act="sem-del" data-i="' + i + '" title="Delete semester">✕</button>';
      body.appendChild(row);
    });
    body.appendChild(addBtn("sem-add", "+ Add semester"));
  }

  /* ---- programs tab ---- */
  function renderProgramsTab(body) {
    var d = mgr.draft;
    var sem = getSem(mgr.semId);
    if (!sem) {
      body.appendChild(el("p", "mgr-hint", "No semester yet — add one in the <b>Semesters</b> tab."));
      return;
    }
    var pick = el("div", "mgr-toolbar");
    var sel = document.createElement("select");
    sel.setAttribute("data-field", "mgr-sem");
    d.semesters.forEach(function (s) {
      var o = document.createElement("option");
      o.value = s.id;
      o.textContent = s.name || s.id;
      if (s.id === sem.id) o.selected = true;
      sel.appendChild(o);
    });
    var lbl = el("label", "field inline");
    lbl.innerHTML = "<span>Semester</span>";
    lbl.appendChild(sel);
    pick.appendChild(lbl);
    body.appendChild(pick);

    if (mgr.progId) { renderProgramEditor(body, sem); return; }

    var progs = sem.programs || [];
    if (!progs.length) body.appendChild(el("p", "mgr-hint", "No programs in this semester yet."));
    progs.forEach(function (p, i) {
      var row = el("div", "mgr-row row-prog");
      row.innerHTML =
        '<div class="mgr-strong">' + esc(p.name || "(unnamed)") + "</div>" +
        '<div class="mgr-sub">' + esc(p.nameCN || "—") + "</div>" +
        '<span class="pill">' + (p.schedule || []).length + " classes</span>" +
        '<button class="btn btn-sm" type="button" data-act="prog-open" data-i="' + i + '">Edit schedule</button>' +
        '<button class="btn-icon danger" type="button" data-act="prog-del" data-i="' + i + '" title="Delete program">✕</button>';
      body.appendChild(row);
    });
    body.appendChild(addBtn("prog-add", "+ Add program"));
  }

  function renderProgramEditor(body, sem) {
    var prog = progNow();
    if (!prog) { mgr.progId = null; renderProgramsTab(body); return; }

    body.appendChild(addBtn("prog-back", "← All programs"));

    var head = el("div", "mgr-form");
    head.innerHTML =
      '<label class="field grow"><span>Program name</span><input data-field="prog-name" value="' + esc(prog.name || "") + '" placeholder="e.g. Artificial Intelligence (International) 1" /></label>' +
      '<label class="field grow"><span>Chinese name (optional)</span><input data-field="prog-namecn" value="' + esc(prog.nameCN || "") + '" placeholder="e.g. 人工智能（国际）1" /></label>';
    body.appendChild(head);

    var slots = slotsOf(sem);
    var opts = sessionOptions(mgr.draft, sem);
    var list = el("div", "mgr-list");
    list.appendChild(el("div", "mgr-subhead",
      "<b>Schedule</b> · " + (prog.schedule || []).length + " classes · " + esc(sem.timeSlotFormat)));

    var dl = document.createElement("datalist");
    dl.id = "roomlist";
    Object.keys(mgr.draft.locations || {}).forEach(function (code) {
      var o = document.createElement("option");
      o.value = code;
      dl.appendChild(o);
    });
    body.appendChild(dl);

    (prog.schedule || []).forEach(function (e, i) {
      var row = el("div", "mgr-row row-entry" + (conflictOf(prog, i) ? " conflict" : ""));
      row.title = conflictOf(prog, i) ? "Clashes with another class in this time slot" : "";
      row.innerHTML =
        '<select data-field="ent-day" data-i="' + i + '">' + window.SYCU_APP.DAYS.map(function (day) {
          return "<option" + (e.day === day ? " selected" : "") + ">" + day + "</option>";
        }).join("") + "</select>" +
        '<select data-field="ent-session" data-i="' + i + '">' + sessionOptHtml(opts, e.session) + "</select>" +
        '<input data-field="ent-course" data-i="' + i + '" value="' + esc(e.course || "") + '" placeholder="Course name" />' +
        '<input data-field="ent-loc" data-i="' + i + '" value="' + esc(e.location || "") + '" placeholder="Room" list="roomlist" />' +
        '<button class="btn-icon danger" type="button" data-act="ent-del" data-i="' + i + '" title="Remove class">✕</button>';
      list.appendChild(row);
    });
    body.appendChild(list);
    body.appendChild(addBtn("ent-add", "+ Add class"));
    body.appendChild(el("p", "mgr-hint", "Amber rows clash with another class of this program in an overlapping session — double lessons count as both of their sessions. The same course listed in both sessions of a block (e.g. 5 and 6), or a <b>Double lesson</b> from the session list, renders as one continuous block. Unknown room codes are added automatically on save."));
  }

  function conflictOf(prog, idx) {
    var e = prog.schedule[idx];
    return (prog.schedule || []).some(function (x, i) {
      return i !== idx && x.day === e.day && window.SYCU_APP.sessionsOverlap(x.session, e.session);
    });
  }

  /* ---- rooms tab ---- */
  function renderRoomsTab(body) {
    body.appendChild(el("p", "mgr-hint",
      "Rooms referenced by classes. A room used by a class is created automatically if missing; renaming a code here updates every class that uses it."));
    var locs = mgr.draft.locations || (mgr.draft.locations = {});
    var codes = Object.keys(locs);
    if (!codes.length) body.appendChild(el("p", "mgr-hint", "No rooms yet."));
    codes.forEach(function (code, i) {
      var L = locs[code] || {};
      var row = el("div", "mgr-row row-room");
      row.innerHTML =
        '<input data-field="room-code" data-i="' + i + '" value="' + esc(code) + '" title="Room code" />' +
        '<input data-field="room-building" data-i="' + i + '" value="' + esc(L.building || "") + '" placeholder="Building" />' +
        '<input data-field="room-room" data-i="' + i + '" value="' + esc(L.room || "") + '" placeholder="Room" />' +
        '<input data-field="room-campus" data-i="' + i + '" value="' + esc(L.campus || "") + '" placeholder="Campus" />' +
        '<button class="btn-icon danger" type="button" data-act="room-del" data-i="' + i + '" title="Delete room">✕</button>';
      body.appendChild(row);
    });
    body.appendChild(addBtn("room-add", "+ Add room"));
  }

  function addBtn(act, label) {
    var b = el("button", "btn add-btn", label);
    b.type = "button";
    b.setAttribute("data-act", act);
    return b;
  }

  /* ---- mutations ---- */
  function onField(ev) {
    var t = ev.target;
    var f = t.getAttribute && t.getAttribute("data-field");
    if (!f || !mgr.draft) return;
    var i = parseInt(t.getAttribute("data-i"), 10);
    var d = mgr.draft, sem, prog;
    switch (f) {
      case "mgr-sem":
        mgr.semId = t.value;
        mgr.progId = null;
        render();
        return;
      case "sem-name": d.semesters[i].name = t.value; break;
      case "sem-namecn": d.semesters[i].nameCN = t.value; break;
      case "sem-format": d.semesters[i].timeSlotFormat = t.value; render(); return;
      case "prog-name": progNow().name = t.value; break;
      case "prog-namecn": progNow().nameCN = t.value; break;
      case "ent-day":
        progNow().schedule[i].day = t.value;
        render();
        return;
      case "ent-session":
        sem = getSem(mgr.semId);
        progNow().schedule[i].session = coerceSession(sem, t.value);
        render();
        return;
      case "ent-course": progNow().schedule[i].course = t.value; break;
      case "ent-loc":
        progNow().schedule[i].location = t.value.toUpperCase();
        t.value = progNow().schedule[i].location;
        break;
      case "room-code": {
        var oldKey = Object.keys(d.locations)[i];
        var newKey = t.value.trim().toUpperCase();
        if (!newKey || (newKey !== oldKey && d.locations[newKey])) { t.value = oldKey; return; }
        renameRoom(oldKey, newKey);
        render();
        return;
      }
      case "room-building": d.locations[Object.keys(d.locations)[i]].building = t.value.trim(); break;
      case "room-room": d.locations[Object.keys(d.locations)[i]].room = t.value.trim(); break;
      case "room-campus": d.locations[Object.keys(d.locations)[i]].campus = t.value.trim(); break;
    }
    updateDirty();
  }
  function coerceSession(sem, val) {
    var opts = sessionOptions(mgr.draft, sem);
    for (var k = 0; k < opts.length; k++) if (opts[k].value === String(val)) return opts[k].value;
    return val;
  }
  function renameRoom(oldKey, newKey) {
    var d = mgr.draft;
    d.locations[newKey] = d.locations[oldKey];
    delete d.locations[oldKey];
    d.semesters.forEach(function (s) {
      (s.programs || []).forEach(function (p) {
        (p.schedule || []).forEach(function (e) { if (e.location === oldKey) e.location = newKey; });
      });
    });
  }

  function onClick(ev) {
    var btn = ev.target && ev.target.closest ? ev.target.closest("[data-act]") : null;
    if (!btn || !mgr.draft) return;
    var a = btn.getAttribute("data-act");
    var i = parseInt(btn.getAttribute("data-i"), 10);
    var d = mgr.draft, sem = getSem(mgr.semId), prog;

    if (a === "sem-add") {
      var id = uniqueId(slug("semester-" + (d.semesters.length + 1)), allIds(d));
      d.semesters.push({
        id: id, name: "New Semester", nameCN: "",
        timeSlotFormat: d.semesters.length ? d.semesters[0].timeSlotFormat : "standard8",
        programs: []
      });
      mgr.semId = id;
      mgr.progId = null;
      render();
    } else if (a === "sem-del") {
      if (d.semesters.length <= 1) { toast("At least one semester is required", "err"); return; }
      var sDel = d.semesters[i];
      var nProgs = (sDel.programs || []).length;
      if (!window.confirm("Delete “" + (sDel.name || sDel.id) + "”" + (nProgs ? " and its " + nProgs + " program(s)" : "") + "?")) return;
      d.semesters.splice(i, 1);
      if (mgr.semId === sDel.id) mgr.semId = d.semesters[0] && d.semesters[0].id;
      mgr.progId = null;
      render();
    } else if (a === "prog-add") {
      if (!sem) { toast("Add a semester first", "err"); return; }
      sem.programs = sem.programs || [];
      var pid = uniqueId(slug("program-" + (sem.programs.length + 1)), allIds(d));
      sem.programs.push({ id: pid, name: "New Program", nameCN: "", schedule: [] });
      mgr.progId = pid;
      render();
    } else if (a === "prog-open") {
      mgr.progId = sem.programs[i].id;
      render();
    } else if (a === "prog-back") {
      mgr.progId = null;
      render();
    } else if (a === "prog-del") {
      prog = sem.programs[i];
      if (!window.confirm("Delete program “" + prog.name + "” and its schedule?")) return;
      sem.programs.splice(i, 1);
      if (mgr.progId === prog.id) mgr.progId = null;
      render();
    } else if (a === "ent-add") {
      prog = progNow();
      var slots = slotsOf(sem);
      prog.schedule = prog.schedule || [];
      prog.schedule.push({
        day: "Monday",
        session: slots.length ? slots[0].session : 1,
        course: "",
        location: (prog.schedule[prog.schedule.length - 1] || {}).location || ""
      });
      render();
      var inputs = $("mgr-body").querySelectorAll('[data-field="ent-course"]');
      if (inputs.length) inputs[inputs.length - 1].focus();
    } else if (a === "ent-del") {
      progNow().schedule.splice(i, 1);
      render();
    } else if (a === "room-add") {
      d.locations = d.locations || {};
      var n = 1;
      while (d.locations["N10" + n]) n++;
      d.locations["N10" + n] = { building: "N", room: "10" + n, campus: "Main" };
      render();
    } else if (a === "room-del") {
      var code = Object.keys(d.locations)[i];
      var used = 0;
      d.semesters.forEach(function (sx) {
        (sx.programs || []).forEach(function (px) {
          (px.schedule || []).forEach(function (e) { if (e.location === code) used++; });
        });
      });
      if (used && !window.confirm("Room " + code + " is used by " + used + " class(es). Delete it anyway?")) return;
      delete d.locations[code];
      render();
    }
    updateDirty();
  }

  /* ---- validate / normalize / save ---- */
  function normalize(d) {
    var fixes = 0;
    (d.semesters || []).forEach(function (s) {
      s.name = (s.name || "").trim();
      s.nameCN = (s.nameCN || "").trim();
      if (!d.timeSlotFormats[s.timeSlotFormat]) s.timeSlotFormat = Object.keys(d.timeSlotFormats)[0];
      var slots = d.timeSlotFormats[s.timeSlotFormat].slots;
      var opts = sessionOptions(d, s);
      (s.programs || []).forEach(function (p) {
        p.name = (p.name || "").trim();
        p.nameCN = (p.nameCN || "").trim();
        var before = (p.schedule || []).length;
        p.schedule = (p.schedule || []).filter(function (e) { return (e.course || "").trim() !== ""; });
        fixes += before - p.schedule.length; // incomplete rows dropped
        p.schedule.forEach(function (e) {
          e.course = e.course.trim();
          e.location = (e.location || "").trim().toUpperCase();
          if (window.SYCU_APP.DAYS.indexOf(e.day) < 0) { e.day = "Monday"; fixes++; }
          var known = opts.some(function (o) { return o.value === String(e.session); });
          if (!known && slots.length) { e.session = slots[0].session; fixes++; }
          if (e.location && !d.locations[e.location]) {
            var m = e.location.match(/^([A-Za-z]+)[- ]?(\d.*)$/);
            d.locations[e.location] = {
              building: m ? m[1].toUpperCase() : e.location.charAt(0),
              room: m ? m[2] : e.location.slice(1),
              campus: "Main"
            };
            fixes++;
          }
        });
      });
    });
    return fixes;
  }
  function validate(d) {
    if (!d.semesters.length) return "Add at least one semester.";
    var sn = {};
    for (var i = 0; i < d.semesters.length; i++) {
      var s = d.semesters[i];
      if (!s.name) return "Every semester needs a name.";
      if (sn[s.name]) return "Two semesters share the name “" + s.name + "”.";
      sn[s.name] = 1;
      var pn = {};
      var progs = s.programs || [];
      for (var j = 0; j < progs.length; j++) {
        if (!progs[j].name) return "Every program needs a name (" + s.name + ").";
        if (pn[progs[j].name]) return "Duplicate program “" + progs[j].name + "” in " + s.name + ".";
        pn[progs[j].name] = 1;
      }
    }
    return null;
  }
  function countConflicts(d) {
    var n = 0;
    d.semesters.forEach(function (s) {
      (s.programs || []).forEach(function (p) {
        (p.schedule || []).forEach(function (e, i) {
          if ((p.schedule || []).some(function (x, j) {
            return j !== i && x.day === e.day && String(x.session) === String(e.session);
          })) n++;
        });
      });
    });
    return n / 2; // each clash counted twice
  }
  function save() {
    var d = mgr.draft;
    var fixes = normalize(d);
    var problem = validate(d);
    if (problem) { toast(problem, "err"); render(); return; }
    d.metadata = d.metadata || {};
    d.metadata.updated = stamp();
    var conflicts = countConflicts(d);
    var suffix = (fixes ? " · " + fixes + " row(s) auto-adjusted" : "") + (conflicts ? " · " + conflicts + " slot conflict(s)" : "");
    var token = readToken();

    if (!token) { saveLocalOnly(d, "Saved on this device only — not published" + suffix); return; }

    apiSend("PUT", "timetable", { data: d }, token).then(function (r) {
      if (r.status === 200 && r.body && r.body.ok) {
        window.SYCU_APP.storeClear();          // published copy is now the source of truth
        window.SYCU_APP.applyData(d);
        window.SYCU_APP.syncRemote();
        closeManager(true);
        toast("Published — live for everyone" + suffix);
      } else if (r.status === 401) {
        clearToken();
        saveLocalOnly(d, "Session expired — sign in again to publish" + suffix);
      } else {
        saveLocalOnly(d, "Server error — saved on this device only" + suffix);
      }
    }).catch(function () {
      saveLocalOnly(d, "Server unreachable — saved on this device only" + suffix);
    });
  }
  function saveLocalOnly(d, msg) {
    if (!window.SYCU_APP.storeSave(d)) { toast("Could not write to local storage", "err"); return; }
    window.SYCU_APP.applyData(d);
    closeManager(true);
    toast(msg);
  }

  /* ============================================================
     EXPORT / IMPORT / RESET
     ============================================================ */
  function exportData() {
    var d = window.SYCU_APP.getData();
    var content = "/* SYCU timetable data — exported " + stamp() + " */\n" +
      "window.SYCU_DATA = " + JSON.stringify(d, null, 2) + ";\n";
    var blob = new Blob([content], { type: "text/javascript" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "timetable.js";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    toast("Exported timetable.js — put it in data/ to publish");
  }
  function parseLoose(text) {
    text = text.trim();
    var start = text.indexOf("{"), end = text.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("no JSON object found");
    return JSON.parse(text.slice(start, end + 1));
  }
  function importFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var d;
      try { d = parseLoose(String(reader.result)); }
      catch (e) { toast("Could not read that file as timetable JSON", "err"); return; }
      if (!d || !Array.isArray(d.semesters) || !d.timeSlotFormats) {
        toast("File is missing semesters or timeSlotFormats", "err");
        return;
      }
      if (!window.confirm("Replace the current timetable with “" + file.name + "”?")) return;
      d.locations = d.locations || {};
      d.metadata = d.metadata || {};
      d.metadata.updated = stamp();
      var token = readToken();
      if (!token) {
        if (!window.SYCU_APP.storeSave(d)) { toast("Could not write to local storage", "err"); return; }
        window.SYCU_APP.applyData(d);
        if (mgr.open) openManager();
        toast("Imported on this device only — not published");
        return;
      }
      apiSend("PUT", "timetable", { data: d }, token).then(function (r) {
        if (r.status === 200 && r.body && r.body.ok) {
          window.SYCU_APP.storeClear();
          window.SYCU_APP.applyData(d);
          window.SYCU_APP.syncRemote();
          if (mgr.open) openManager();
          toast("Imported and published — live for everyone");
        } else if (r.status === 401) {
          clearToken();
          toast("Session expired — sign in again to publish", "err");
        } else {
          toast("Server error — import not published", "err");
        }
      }).catch(function () {
        toast("Server unreachable — import not published", "err");
      });
    };
    reader.readAsText(file);
  }
  function resetData() {
    if (!window.confirm("Restore the built-in timetable and discard all edits?")) return;
    var token = readToken();
    window.SYCU_APP.storeClear();
    window.SYCU_APP.reload();
    if (mgr.open) closeManager(true);
    if (!token) { toast("Restored built-in timetable on this device"); return; }
    apiSend("POST", "reset", {}, token).then(function (r) {
      if (r.status === 200 && r.body && r.body.ok) {
        window.SYCU_APP.syncRemote();
        toast("Published copy removed — everyone sees the built-in timetable");
      } else if (r.status === 401) {
        clearToken();
        toast("Session expired — published copy was not removed", "err");
      } else {
        toast("Server error — published copy was not removed", "err");
      }
    }).catch(function () {
      toast("Server unreachable — published copy was not removed", "err");
    });
  }

  /* ============================================================
     WIRING
     ============================================================ */
  $("admin-btn").onclick = function () { isActive() ? openManager() : openLogin(); };
  $("adm-manage").onclick = function () { openManager(); };
  $("adm-export").onclick = exportData;
  $("adm-import").onclick = function () { $("adm-file").click(); };
  $("adm-reset").onclick = resetData;
  $("adm-logout").onclick = logout;
  $("adm-file").onchange = function () {
    if (this.files && this.files[0]) importFile(this.files[0]);
    this.value = "";
  };

  $("login-form").onsubmit = function (ev) {
    ev.preventDefault();
    login($("login-email").value, $("login-pass").value);
  };
  $("login-close").onclick = closeLogin;
  $("login-overlay").addEventListener("click", function (ev) { if (ev.target === this) closeLogin(); });
  $("pw-toggle").onclick = function () {
    var inp = $("login-pass");
    var show = inp.type === "password";
    inp.type = show ? "text" : "password";
    this.textContent = show ? "Hide" : "Show";
  };

  $("mgr-tabs").addEventListener("click", function (ev) {
    var b = ev.target && ev.target.closest ? ev.target.closest("button[data-tab]") : null;
    if (!b) return;
    mgr.tab = b.getAttribute("data-tab");
    mgr.progId = null;
    render();
  });
  $("mgr-body").addEventListener("input", onField);
  $("mgr-body").addEventListener("change", onField);
  $("mgr-body").addEventListener("click", onClick);
  $("mgr-save").onclick = save;
  $("mgr-cancel").onclick = function () { closeManager(false); };
  $("mgr-close").onclick = function () { closeManager(false); };
  $("mgr-overlay").addEventListener("click", function (ev) { if (ev.target === this) closeManager(false); });

  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "Escape") return;
    if (!$("mgr-overlay").classList.contains("hidden")) closeManager(false);
    else if (!$("login-overlay").classList.contains("hidden")) closeLogin();
  });

  /* ---- boot ---- */
  if (isActive()) applyAdminUI(true);

  /* public surface used by app.js */
  window.SYCU_ADMIN = {
    isActive: isActive,
    openProgram: function (progId) { openManager(progId); }
  };
})();
