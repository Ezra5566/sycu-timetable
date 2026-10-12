/* ============================================================
   SYCU Timetable viewer — vanilla JS, no build step.
   Data: window.SYCU_DATA (data/timetable.js)
   ============================================================ */
(function () {
  "use strict";

  /* ---- data store ----------------------------------------
     Precedence (lowest to highest):
       shipped data (data/timetable.js)
       REMOTE_KEY — cache of the published copy from /api/timetable
       DATA_KEY   — unpublished admin edits made on this device
     When served over http(s) the published copy is re-fetched on a
     timer, so admin publishes appear on open tabs within a minute. */
  var DEFAULT_DATA = window.SYCU_DATA;
  var DATA_KEY = "sycu.data.v1";
  var REMOTE_KEY = "sycu.data.remote";
  var REMOTE_TAG_KEY = "sycu.data.remoteTag"; // ETag of the published copy
  var API_BASE = "api/";

  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
  function readCache(key) {
    try {
      var raw = localStorage.getItem(key);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.semesters) && parsed.semesters.length) return parsed;
      }
    } catch (e) { /* unreadable cache — ignore */ }
    return null;
  }
  function cacheSet(key, d) {
    try { localStorage.setItem(key, JSON.stringify(d)); } catch (e) { /* quota / private mode */ }
  }
  function cacheDrop(key) { try { localStorage.removeItem(key); } catch (e) {} }
  function loadData() {
    return readCache(DATA_KEY) || readCache(REMOTE_KEY) || deepClone(DEFAULT_DATA);
  }

  /* Pull the published timetable. Silently keeps current data when the
     API is absent (file://, offline, plain static hosting). A failed
     fetch is retried with backoff (2s → 30s) so a fresh visitor sees a
     recent publish promptly even if the very first request hiccups. */
  var syncFailures = 0, syncRetryTimer = null, liveOk = true;
  function setLiveOk(v) {
    if (liveOk === v) return;
    liveOk = v;
    renderFooter();
  }
  function tagGet() { try { return localStorage.getItem(REMOTE_TAG_KEY) || ""; } catch (e) { return ""; } }
  function tagSet(t) {
    try { t ? localStorage.setItem(REMOTE_TAG_KEY, t) : localStorage.removeItem(REMOTE_TAG_KEY); }
    catch (e) { /* quota / private mode */ }
  }
  /* metadata.updated is stamped "YYYY-MM-DD HH:mm" by admin.js, so plain
     string comparison is chronological (see stamp() in admin.js) */
  function stampOf(d) { return (d && d.metadata && d.metadata.updated) || ""; }
  function scheduleSyncRetry() {
    // capped backoff: the 60 s / focus / visibility polls already keep
    // retrying, so hammering further only wastes requests (and, when the
    // storage backend is unhappy, quota)
    if (syncRetryTimer || syncFailures >= 4) return;
    var delay = Math.min(2000 * Math.pow(2, Math.min(syncFailures, 4)), 30000);
    syncFailures++;
    syncRetryTimer = setTimeout(function () { syncRetryTimer = null; syncRemote(); }, delay);
  }
  function syncRemote() {
    if (typeof fetch !== "function" || location.protocol === "file:") return Promise.resolve(false);
    // conditional GET — only send the tag when a published copy is actually
    // cached, so an "empty" 304 can never hide a server-side reset
    var tag = readCache(REMOTE_KEY) ? tagGet() : "";
    var opts = { cache: "no-store" };
    if (tag) opts.headers = { "If-None-Match": tag };
    return fetch(API_BASE + "timetable", opts)
      .then(function (r) {
        if (r.status === 304) { syncFailures = 0; setLiveOk(true); return true; }
        if (!r.ok) throw new Error("http " + r.status);
        var newTag = "";
        try { newTag = r.headers.get("ETag") || ""; } catch (e) { /* older browsers */ }
        return r.json().then(function (res) {
          if (!res || !res.ok) return false;
          syncFailures = 0;
          setLiveOk(true);
          if (!res.data) {
            // nothing published (e.g. admin reset) — revert to device/shipped data
            cacheDrop(REMOTE_KEY);
            tagSet("");
            var next = readCache(DATA_KEY) || deepClone(DEFAULT_DATA);
            if (JSON.stringify(DATA) !== JSON.stringify(next)) { DATA = next; normalizeState(); renderAll(); }
            return true;
          }
          // Retire stale device-only edits: a published copy that is provably
          // newer wins, so a browser whose publish once failed can never stay
          // forked forever. Unpublished work is never discarded — only when
          // both sides carry a comparable timestamp and the server is newer.
          var localEdits = readCache(DATA_KEY);
          if (localEdits) {
            var srvStamp = stampOf(res.data), locStamp = stampOf(localEdits);
            if (srvStamp && locStamp && srvStamp > locStamp) cacheDrop(DATA_KEY);
          }
          cacheSet(REMOTE_KEY, res.data);
          if (newTag) tagSet(newTag);
          if (JSON.stringify(DATA) === JSON.stringify(res.data)) return true;
          DATA = res.data;
          normalizeState();
          renderAll();
          return true;
        });
      })
      .catch(function () { setLiveOk(false); scheduleSyncRetry(); return false; });
  }
  function storeSave(d) {
    try { localStorage.setItem(DATA_KEY, JSON.stringify(d)); return true; }
    catch (e) { return false; }
  }
  function storeClear() { try { localStorage.removeItem(DATA_KEY); } catch (e) {} }
  function isCustomized() { try { return !!localStorage.getItem(DATA_KEY); } catch (e) { return false; } }

  var DATA = loadData();

  var DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  var DAY_CN = {
    Monday: "周一", Tuesday: "周二", Wednesday: "周三",
    Thursday: "周四", Friday: "周五", Saturday: "周六", Sunday: "周日"
  };
  var BUILDING = { N: "North", G: "Global" };

  /* inline SVG icons — consistent across platforms (unlike emoji) */
  var ICON_SUNRISE = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 20h18"/><path d="M7.5 17a4.5 4.5 0 0 1 9 0"/><path d="M12 3v4"/><path d="m9.8 5.2 2.2-2.2 2.2 2.2"/><path d="M5.2 9.5 7 11.3"/><path d="M18.8 9.5 17 11.3"/></svg>';
  var ICON_SUNSET = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 20h18"/><path d="M7 20a5 5 0 0 1 10 0"/><path d="M12 2.5v5"/><path d="m9.8 5.8 2.2 2.2 2.2-2.2"/></svg>';
  var ICON_CALENDAR = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="16" rx="3"/><path d="M8 2.5v4M16 2.5v4M3 9.5h18"/></svg>';
  function periodLabel(period) {
    return (period === "morning" ? ICON_SUNRISE : ICON_SUNSET) +
      (period === "morning" ? "Morning" : "Afternoon");
  }

  /* ---- tiny helpers -------------------------------------- */
  var $ = function (id) { return document.getElementById(id); };

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function fmt12(min) {
    var h = Math.floor(min / 60) % 24, m = min % 60;
    var ap = h < 12 ? "AM" : "PM";
    var hh = h % 12 === 0 ? 12 : h % 12;
    return hh + ":" + pad(m) + " " + ap;
  }
  function fmtMin(min) {
    var h = Math.floor(min / 60) % 24, m = min % 60;
    return h + ":" + pad(m);
  }
  /* course accent colours — keyed by stable course string */
  var PALETTE = ["#6aa8ff", "#2ec7a5", "#b18cff", "#f5b45a", "#5ad1e8", "#ff8f6b", "#7ddc7d", "#f58fbf"];
  function hash(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }
  function colorFor(course) { return PALETTE[hash(course) % PALETTE.length]; }
  var roomName = function (code) { return (DATA.locations[code] || {}).campus ? code : code; };
  function buildingTag(code) {
    var b = (DATA.locations[code] || {}).building;
    return b ? BUILDING[b] || b : "";
  }

  /* ---- time parsing -------------------------------------- */
  function toMin(t) {
    var p = String(t).split(":");
    return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
  }
  function timeOfSlot(s) {
    if (!s || !s.time) return null;
    var parts = s.time.split("-");
    return { start: toMin(parts[0]), end: toMin(parts[1]) };
  }
  /* Sessions can be single ("5") or a double lesson ("5-6").
     Everything below matches by session RANGE, so a double lesson
     works in any time-slot format and merges across its rows. */
  function parseSession(v) {
    var m = String(v).match(/^\s*(\d+)\s*-\s*(\d+)\s*$/);
    if (m) return { from: +m[1], to: +m[2] };
    var n = parseInt(v, 10);
    return isNaN(n) ? null : { from: n, to: n };
  }
  function sessionsOverlap(a, b) {
    var ra = parseSession(a), rb = parseSession(b);
    return !!(ra && rb && ra.from <= rb.to && rb.from <= ra.to);
  }
  function fmtSlots(sem) {
    var fmt = DATA.timeSlotFormats[sem.timeSlotFormat];
    return (fmt && fmt.slots) ? fmt.slots : [];
  }
  function slotFor(sem, session) {
    var slots = fmtSlots(sem), i;
    for (i = 0; i < slots.length; i++) {
      if (String(slots[i].session) === String(session)) return slots[i];
    }
    for (i = 0; i < slots.length; i++) {
      if (sessionsOverlap(slots[i].session, session)) return slots[i];
    }
    return null;
  }
  /* Union of clock time covered by a session — a double lesson spans
     both of its slots (e.g. 1-2 → 8:20-10:00). */
  function timeSpanOf(sem, session) {
    var slots = fmtSlots(sem), start = null, end = null;
    for (var i = 0; i < slots.length; i++) {
      if (!sessionsOverlap(slots[i].session, session)) continue;
      var t = timeOfSlot(slots[i]);
      if (!t) continue;
      if (start === null || t.start < start) start = t.start;
      if (end === null || t.end > end) end = t.end;
    }
    return start === null ? null : { start: start, end: end };
  }
  /* Which grid rows an entry occupies: first slot index + row count. */
  function entrySpan(sem, session) {
    var slots = fmtSlots(sem), start = -1, span = 0;
    for (var i = 0; i < slots.length; i++) {
      if (sessionsOverlap(slots[i].session, session)) {
        if (start < 0) start = i;
        span++;
      } else if (start >= 0) break;
    }
    return start < 0 ? null : { start: start, span: span };
  }

  /* ---- day structure: blocks, breaks, double lessons ----
     The day is four teaching blocks of two periods each:
       Block 1  8:20–10:00   (break 9:05–9:15)
       Block 2  10:20–12:00  (break 11:05–11:15)
       Block 3  13:30–15:10  (break 14:15–14:25)
       Block 4  15:20–17:00  (break 16:05–16:15)      A course can be one 45-minute period, or a double lesson covering
     both periods of a block (~100 min including the internal break). */
  function blockOfRange(r) {
    if (!r) return -1;
    var k = Math.floor((r.from - 1) / 2);
    return r.to > 2 * k + 2 ? -1 : k; // -1 = crosses a block boundary
  }
  /* two single sessions forming one block: odd → odd+1 (1|2, 3|4 …) */
  function sameBlock(a, b) {
    var ra = parseSession(a), rb = parseSession(b);
    return !!(ra && rb && ra.from === ra.to && rb.from === rb.to &&
      ra.from % 2 === 1 && rb.from === ra.from + 1);
  }
  /* gap between two consecutive slots, or null when they touch */
  function gapBetween(prev, next) {
    var a = timeOfSlot(prev), b = timeOfSlot(next);
    if (!a || !b || b.start <= a.end) return null;
    var mins = b.start - a.end;
    var internal = sameBlock(prev.session, next.session);
    return {
      time: fmtMin(a.end) + "–" + fmtMin(b.start),
      internal: internal,
      mins: mins,
      label: internal ? "Break" : (mins >= 60 ? "Lunch" : mins + " min break")
    };
  }
  /* A double lesson entered as two rows — the odd and even session of the
     same block, same course + day — becomes ONE entry covering the whole
     block. Combined codes ("5-6") already are a single entry. */
  function mergedSchedule(sem, program) {
    var groups = {};
    (program.schedule || []).forEach(function (e) {
      var key = e.day + "\u0001" + e.course;
      (groups[key] = groups[key] || []).push(e);
    });
    var out = [];
    Object.keys(groups).forEach(function (key) {
      var list = groups[key];
      if (list.length === 1) { out.push(list[0]); return; }
      var sorted = list.slice().sort(function (a, b) {
        var ra = parseSession(a.session), rb = parseSession(b.session);
        return (ra ? ra.from : 99) - (rb ? rb.from : 99);
      });
      var clusters = [];
      sorted.forEach(function (e) {
        var r = parseSession(e.session);
        if (!r) { out.push(e); return; }
        var k = blockOfRange(r), c = null;
        for (var ci = 0; ci < clusters.length; ci++) {
          var cc = clusters[ci];
          if (k >= 0 && cc.k === k && r.from <= cc.to + 1 && cc.from <= r.to + 1) { c = cc; break; }
        }
        if (c) {
          c.entries.push(e);
          if (r.from < c.from) c.from = r.from;
          if (r.to > c.to) c.to = r.to;
        } else {
          clusters.push({ k: k, from: r.from, to: r.to, entries: [e] });
        }
      });
      clusters.forEach(function (c) {
        if (c.entries.length === 1) { out.push(c.entries[0]); return; }
        var rooms = [];
        c.entries.forEach(function (e) {
          if (e.location && rooms.indexOf(e.location) < 0) rooms.push(e.location);
        });
        out.push({
          day: c.entries[0].day,
          session: c.from === c.to ? String(c.from) : c.from + "-" + c.to,
          course: c.entries[0].course,
          location: rooms.join(" · "),
          merged: true
        });
      });
    });
    return out;
  }
  function dayIndex(day) { return DAYS.indexOf(day); }
  function dayKey(d) { return DAYS.indexOf(d); }

  /* ---- live status --------------------------------------- */
  /* Returns { nowMin, nowDay, liveId, nextId } for a given schedule */
  function statusFor(program) {
    var now = new Date();
    var nowMin = now.getHours() * 60 + now.getMinutes();
    var nowDay = now.getDay(); // 0 Sun..6 Sat
    var nowIdx = nowDay === 0 ? 6 : nowDay - 1; // Mon=0

    var events = mergedSchedule(currentSem, program).map(function (e) {
      var t = timeSpanOf(currentSem, e.session);
      return t ? { e: e, start: t.start, end: t.end, di: dayIndex(e.day) } : null;
    }).filter(Boolean).sort(function (a, b) { return a.di * 1440 + a.start - (b.di * 1440 + b.start); });

    var next = null;
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      var ahead = (ev.di * 1440 + ev.start) - (nowIdx * 1440 + nowMin);
      if (ahead >= 0) { next = ev; break; }
    }

    /* In progress now: started earlier today, not yet finished. A class in
       progress is by definition no longer "ahead of now", so it needs its
       own pass — keying it off `next` meant the live badge only ever fired
       at the exact minute a class started. */
    var live = null;
    for (var j = 0; j < events.length; j++) {
      var lv = events[j];
      if (lv.di === nowIdx && nowMin >= lv.start && nowMin < lv.end) { live = lv; break; }
    }

    var idOf = function (ev) { return ev ? ev.e.day + "|" + ev.e.session + "|" + ev.e.course : null; };
    return { nowMin: nowMin, nowIdx: nowIdx, live: idOf(live), next: idOf(next) };
  }

  /* ---- state --------------------------------------------- */
  var state = {
    sem: DATA.semesters[0] ? DATA.semesters[0].id : null,
    prog: null,
    view: localStorage.getItem("sycu.view") || "grid",
    q: ""
  };
  var currentSem = DATA.semesters[0];
  var STATUS = {};

  /* Signature of everything that visually changes the view. tick() uses it
     to skip the DOM rebuild when nothing moved (the clock/status line is
     refreshed in place), so the grid no longer re-renders every 30s. */
  var VIEW_KEY = null;
  function viewKey(p) {
    var st = STATUS[p.id] || {};
    return [state.prog, state.sem, state.view, p.id, st.live, st.next, st.nowIdx].join("\u0001");
  }

  function curSem() {
    for (var i = 0; i < DATA.semesters.length; i++)
      if (DATA.semesters[i].id === state.sem) return DATA.semesters[i];
    return DATA.semesters[0];
  }
  function curProgs() { return curSem().programs || []; }
  function normalizeState() {
    if (!DATA.semesters.length) { state.sem = null; state.prog = null; return; }
    if (!DATA.semesters.some(function (s) { return s.id === state.sem; })) state.sem = DATA.semesters[0].id;
  }
  function adminOn() { return !!(window.SYCU_ADMIN && window.SYCU_ADMIN.isActive()); }

  /* ---- semesters bar ------------------------------------- */
  function renderSemesters() {
    var bar = $("semesters");
    bar.textContent = "";
    DATA.semesters.forEach(function (s, si) {
      var b = el("button", "seg" + (s.id === state.sem ? " on" : ""));
      b.type = "button";
      b.style.setProperty("--i", String(si));
      b.innerHTML = esc(s.name) + '<span class="count">' + (s.programs || []).length + "</span>";
      b.onclick = function () {
        state.sem = s.id;
        state.prog = null;
        pickFirstProgram();
        renderAll();
      };
      bar.appendChild(b);
    });
  }

  function pickFirstProgram() {
    var list = curProgs();
    if (!list.length) { state.prog = null; return; }
    if (!state.prog || !list.some(function (p) { return p.id === state.prog; })) state.prog = list[0].id;
  }

  /* ---- sidebar programs ---------------------------------- */
  function renderPrograms(animate) {
    var box = $("progs");
    box.textContent = "";
    box.classList.toggle("stagger", animate !== false);
    var list = curProgs();
    var q = state.q.trim().toLowerCase();

    var filtered = list.filter(function (p) {
      if (!q) return true;
      var hay = [p.name, p.nameCN, p.id].join(" ").toLowerCase();
      if (hay.indexOf(q) >= 0) return true;
      return (p.schedule || []).some(function (e) {
        return (e.course + " " + e.location + " " + e.day).toLowerCase().indexOf(q) >= 0;
      });
    });

    if (!filtered.length) {
      box.appendChild(el("div", "no-result", "No match for “" + esc(state.q) + "”"));
      return;
    }

    filtered.forEach(function (p, fi) {
      var b = el("button", "program" + (p.id === state.prog ? " on" : ""));
      b.type = "button";
      b.style.setProperty("--i", String(fi));
      var c = colorFor((p.schedule && p.schedule[0] && p.schedule[0].course) || p.name);
      var kindLabel = curSem().timeSlotFormat === "block4" ? "4 blocks" : "8 sessions";
      b.innerHTML =
        '<div class="p-top"><span class="dot" style="background:' + c + '"></span>' +
        '<span class="p-name">' + esc(p.name) + "</span></div>" +
        '<div class="p-cn">' + esc(p.nameCN || "") + "</div>" +
        '<div class="p-meta"><span class="pill">' + mergedSchedule(curSem(), p).length + " slots</span>" +
        '<span class="pill ghost">' + esc(kindLabel) + "</span></div>";
      b.onclick = function () { state.prog = p.id; renderPrograms(false); renderInfo(); renderView(); };
      box.appendChild(b);
    });
  }

  /* ---- info header --------------------------------------- */
  function renderInfo() {
    var box = $("info");
    box.textContent = "";
    var sem = curSem();
    var p = curProgs().filter(function (x) { return x.id === state.prog; })[0];

    var left = el("div");
    left.appendChild(el("h1", null, p ? esc(p.name) : "Select a program"));
    var sub = el("div", "sub");
    sub.textContent = p ? ((p.nameCN ? p.nameCN + "  ·  " : "") + sem.name + (sem.nameCN ? "（" + sem.nameCN + "）" : "")) : sem.name;
    left.appendChild(sub);

    var right = el("div", "info-right");
    if (p) {
      right.appendChild(el("span", "badge",
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4.5" width="18" height="16" rx="3"/><path d="M8 2.5v4M16 2.5v4M3 9.5h18"/></svg>' +
        esc(p.nameCN || "") + "  ·  " + mergedSchedule(sem, p).length + " slots"));
    }

    var sw = el("div", "switch");
    sw.appendChild(switchBtn("grid", "Grid",
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>'));
    sw.appendChild(switchBtn("list", "List",
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>'));
    right.appendChild(sw);

    box.appendChild(left);
    box.appendChild(right);

    var legend = el("div", "legend");
    if (p) {
      var seen = {};
      (p.schedule || []).forEach(function (e) {
        if (seen[e.course]) return;
        seen[e.course] = 1;
        legend.appendChild(el("span", "lg", '<span class="sw" style="--dot:' + colorFor(e.course) + '"></span>' + esc(shortName(e.course))));
      });
    }
    box.appendChild(legend);
  }

  function switchBtn(id, label, icon) {
    var b = el("button", state.view === id ? "on" : "");
    b.type = "button";
    b.dataset.v = id;
    b.innerHTML = icon + label;
    b.onclick = function () {
      state.view = id;
      localStorage.setItem("sycu.view", id);
      renderInfo();
      renderView();
    };
    return b;
  }

  /* ---- views --------------------------------------------- */
  function renderView() {
    var v = $("view");
    v.textContent = "";
    v.classList.remove("quiet");
    var p = curProgs().filter(function (x) { return x.id === state.prog; })[0];
    if (!p) {
      v.appendChild(el("div", "panel empty", '<div class="big">' + ICON_CALENDAR + '</div>No program available for this semester.'));
      VIEW_KEY = null;
      return;
    }
    if (state.view === "list") renderList(v, p);
    else renderGrid(v, p);
    VIEW_KEY = viewKey(p);
  }

  /* ---------- grid view ---------- */
  function renderGrid(v, p) {
    var sem = curSem();
    var fmt = DATA.timeSlotFormats[sem.timeSlotFormat];
    var slots = fmt ? fmt.slots : [];
    var st = STATUS[p.id] || statusFor(p);
    var sched = mergedSchedule(sem, p);
    var semDaySet = {};
    sched.forEach(function (e) { semDaySet[e.day] = 1; });
    var days = DAYS.filter(function (d) { return semDaySet[d]; });
    if (!days.length) days = DAYS.slice(0, 5);

    var scroll = el("div", "grid-scroll");
    var t = document.createElement("table");
    t.className = "tgrid" + (sem.timeSlotFormat === "block4" ? " has-blocks" : "");

    // header row
    var tr = document.createElement("tr");
    var corner = document.createElement("th");
    corner.className = "corner";
    tr.appendChild(corner);
    days.forEach(function (d) {
      var th = document.createElement("th");
      th.className = "dayhead" + (d === DAYS[st.nowIdx] ? " today" : "");
      th.innerHTML = esc(d) + '<span class="cn">' + (DAY_CN[d] || "") + "</span>";
      tr.appendChild(th);
    });
    t.appendChild(tr);

    /* Row plan: Morning/Afternoon section headers, lesson rows, and the
       breaks between them (10-minute internal breaks as faint dividers,
       larger gaps labelled — lunch between the halves of the day). */
    var plan = [];
    var lastPeriod = null;
    slots.forEach(function (s, idx) {
      if (idx > 0) {
        var g = gapBetween(slots[idx - 1], s);
        if (g) plan.push({ type: "gap", gap: g });
      }
      if (s.period !== lastPeriod) {
        var end = s;
        for (var j = idx; j < slots.length && slots[j].period === s.period; j++) end = slots[j];
        plan.push({ type: "group", period: s.period, from: s, to: end });
        lastPeriod = s.period;
      }
      plan.push({ type: "lesson", slot: s, lesson: idx });
    });
    var lessonPhys = {};
    plan.forEach(function (pr, pi) { if (pr.type === "lesson") lessonPhys[pr.lesson] = pi; });

    // render the plan: section headers, breaks, and lesson rows. A double
    // lesson is one card merged (rowspan) across every physical row it
    // covers — including the break inside it — labelled by session.
    var placed = {};
    var colCell = {}; /* day → active merged cell { stack, until } (physical row) */
    var keyOf = function (e) { return e.day + "|" + e.session + "|" + e.course; };
    var entriesStarting = function (d, lessonIdx) {
      return sched.filter(function (e) {
        if (e.day !== d || placed[keyOf(e)]) return false;
        var sp = entrySpan(sem, e.session);
        return !!sp && sp.start === lessonIdx;
      });
    };
    var cardFor = function (e) {
      var id = keyOf(e);
      var cls = el("div", "cls" + (id === st.live ? " live" : id === st.next ? " next" : ""));
      cls.style.setProperty("--c", colorFor(e.course));
      var tag = id === st.live ? '<span class="c-live">● Now</span>' : id === st.next ? '<span class="c-live" style="color:var(--accent)">↑ Next</span>' : "";
      var tspan = timeSpanOf(sem, e.session);
      var timeText = tspan ? fmtMin(tspan.start) + "-" + fmtMin(tspan.end) : "";
      cls.innerHTML =
        '<div class="c-name">' + esc(e.course) + tag + "</div>" +
        '<div class="c-meta"><span class="c-loc">' + esc(e.location) + "</span>" +
        '<span class="c-sess">' + esc("Session " + e.session) + "</span>" +
        '<span class="c-time">' + esc(timeText) + "</span>" +
        (adminOn() ? '<button class="mini-edit" type="button" title="Edit program" data-edit-prog="' + esc(p.id) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 19.5h4L20 8a2.1 2.1 0 0 0-3-3L5.5 16.5v3Z"/><path d="m15.5 6.5 3 3"/></svg></button>' : "") +
        "</div>";
      return cls;
    };
    var coveredAt = function (d, pi) {
      return colCell[d] && colCell[d].until >= pi;
    };

    plan.forEach(function (pr, pi) {
      var row = document.createElement("tr");

      if (pr.type === "group") {
        row.className = "grp";
        var label = periodLabel(pr.period);
        var range = pr.from.time.split("-")[0] + "–" + pr.to.time.split("-").pop();
        var covered = days.some(function (d) { return coveredAt(d, pi); });
        var gh = document.createElement("th");
        gh.className = "grp-head";
        if (!covered) {
          gh.colSpan = 1 + days.length;
          gh.innerHTML = label + '<span class="grp-time">' + esc(range) + "</span>";
          row.appendChild(gh);
        } else {
          // a double lesson crosses this row — keep its column clear
          gh.innerHTML = label;
          row.appendChild(gh);
          days.forEach(function (d) {
            if (coveredAt(d, pi)) return;
            var td = document.createElement("td");
            td.className = "grp-cell";
            row.appendChild(td);
          });
        }
        t.appendChild(row);
        return;
      }

      if (pr.type === "gap") {
        row.className = "brk" + (pr.gap.internal ? " internal" : "");
        var bh = document.createElement("th");
        bh.className = "slot brk-head";
        bh.innerHTML = '<span class="num">' + esc(pr.gap.label) + "</span>" +
          '<span class="time">' + esc(pr.gap.time) + "</span>";
        row.appendChild(bh);
        days.forEach(function (d) {
          if (coveredAt(d, pi)) return;
          var td = document.createElement("td");
          td.className = "brk-cell";
          row.appendChild(td);
        });
        t.appendChild(row);
        return;
      }

      /* lesson row */
      row.className = "lesson";
      var s = pr.slot;
      var th = document.createElement("th");
      th.className = "slot";
      th.innerHTML = '<span class="num">Session ' + esc(s.session) + "</span>" +
        '<span class="time">' + esc(s.time) + "</span>" +
        '<span class="kind">' + periodLabel(s.period) + "</span>";
      row.appendChild(th);

      days.forEach(function (d) {
        if (coveredAt(d, pi)) {
          // column belongs to a merged double lesson above — join it
          entriesStarting(d, pr.lesson).forEach(function (e) {
            placed[keyOf(e)] = 1;
            colCell[d].stack.appendChild(cardFor(e));
          });
          return;
        }
        var here = entriesStarting(d, pr.lesson);
        var cell = document.createElement("td");
        cell.className = "cell";
        if (!here.length) { cell.classList.add("gap"); row.appendChild(cell); return; }

        var stack = el("div", "stack");
        var span = 1;
        here.forEach(function (e) {
          placed[keyOf(e)] = 1;
          var sp = entrySpan(sem, e.session);
          if (sp && sp.span > span) span = sp.span;
          stack.appendChild(cardFor(e));
        });
        if (span > 1) {
          var physEnd = lessonPhys[Math.min(pr.lesson + span - 1, slots.length - 1)];
          cell.rowSpan = physEnd - pi + 1;
          cell.classList.add("merge");
          colCell[d] = { stack: stack, until: physEnd };
        }
        cell.appendChild(stack);
        row.appendChild(cell);
      });
      t.appendChild(row);
    });

    scroll.appendChild(t);
    v.appendChild(scroll);

    // live line under grid
    var line = el("div", "empty livestat");
    line.innerHTML = liveMessage(p, st);
    v.appendChild(line);
  }

  /* ---------- list view ---------- */
  function renderList(v, p) {
    var wrap = el("div", "panel listwrap");
    var byDay = {};
    mergedSchedule(curSem(), p).forEach(function (e) {
      (byDay[e.day] = byDay[e.day] || []).push(e);
    });
    var st = STATUS[p.id] || statusFor(p);

    var days = DAYS.filter(function (d) { return byDay[d]; });
    if (!days.length) { wrap.appendChild(el("div", "empty", "No scheduled slots.")); v.appendChild(wrap); return; }

    days.forEach(function (d) {
      var list = byDay[d].slice().sort(function (a, b) {
        return slotPos(p, a.session) - slotPos(p, b.session);
      });
      var row = el("div", "dayrow");
      row.appendChild(el("div", "dhead",
        '<span class="en">' + esc(d) + (d === DAYS[st.nowIdx] ? " · today" : "") + "</span>" +
        '<span class="cn">' + (DAY_CN[d] || "") + "</span>" +
        '<span class="n">' + list.length + " class" + (list.length > 1 ? "es" : "") + "</span>"));
      var en = el("div", "entries");
      list.forEach(function (e) {
        var tspan = timeSpanOf(curSem(), e.session);
        var timeText = tspan ? fmtMin(tspan.start) + "-" + fmtMin(tspan.end) : "";
        var id = e.day + "|" + e.session + "|" + e.course;
        var tag = id === st.live ? '<span class="tag live">Now</span>' : id === st.next ? '<span class="tag next">Next</span>' : "";
        var c = colorFor(e.course);
        var item = el("div", "entry");
        item.style.setProperty("--c", c);
        item.innerHTML =
          '<div class="e-when">' + esc(e.session) + '<span class="s">' + esc(timeText) + "</span></div>" +
          '<div class="e-name">' + esc(e.course) + tag + "</div>" +
          '<div class="e-right"><span class="e-room">' + esc(e.location) + "</span>" +
          (adminOn() ? '<button class="mini-edit" type="button" title="Edit program" data-edit-prog="' + esc(p.id) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 19.5h4L20 8a2.1 2.1 0 0 0-3-3L5.5 16.5v3Z"/><path d="m15.5 6.5 3 3"/></svg></button>' : "") +
          "</div>";
        en.appendChild(item);
      });
      row.appendChild(en);
      wrap.appendChild(row);
    });

    v.appendChild(wrap);
    var line = el("div", "empty livestat");
    line.innerHTML = liveMessage(p, st);
    v.appendChild(line);
  }

  function slotPos(p, session) {
    var slots = fmtSlots(curSem());
    for (var i = 0; i < slots.length; i++) {
      if (sessionsOverlap(slots[i].session, session)) return i;
    }
    return 99;
  }

  function shortName(c) {
    return String(c).replace(/\s*\(International\)/g, "").replace(/\s*\(A[12]\)/g, "").replace(/\s*\(A\)/g, "").trim();
  }

  function liveMessage(p, st) {
    var nowS = fmt12(st.nowMin);
    var parts = ["<span style=\"color:var(--muted)\">Local time <b style=\"color:var(--text)\">" + nowS + "</b> · " + esc(DAYS[st.nowIdx]) + "</span>"];
    if (st.live) {
      var e = findEvent(p, st.live);
      if (e) parts.push('<span style="color:var(--live)">● Now in class: <b>' + esc(e.course) + '</b> @ ' + esc(e.location) + "</span>");
    } else if (st.next) {
      var n = findEvent(p, st.next);
      if (n) parts.push('<span style="color:var(--accent)">↑ Next: <b>' + esc(n.course) + "</b> @ " + esc(n.location) + "</span>");
    } else {
      parts.push('<span style="color:var(--muted)">No more classes this week.</span>');
    }
    return parts.join('<span style="margin:0 8px;color:var(--faint)">·</span>');
  }
  function findEvent(p, id) {
    var key = id.split("|");
    return mergedSchedule(currentSem, p).filter(function (e) {
      return e.day === key[0] && String(e.session) === key[1] && e.course === key[2];
    })[0];
  }

  /* ---- render all + status ------------------------------- */
  function refreshStatus() {
    STATUS = {};
    curProgs().forEach(function (p) { STATUS[p.id] = statusFor(p); });
  }
  function renderAll() {
    normalizeState();
    currentSem = curSem();
    pickFirstProgram();
    refreshStatus();
    renderSemesters();
    renderPrograms();
    renderInfo();
    renderView();
    renderFooter();
  }
  function renderFooter() {
    var m = DATA.metadata || {};
    var progs = 0, entries = 0;
    DATA.semesters.forEach(function (s) {
      (s.programs || []).forEach(function (p) { progs++; entries += (p.schedule || []).length; });
    });
    var updated = m.updated ? " · updated " + esc(m.updated) : "";
    $("foot-left").innerHTML = esc(m.source || "Timetable") + " · generated " + esc(m.generated || "—") + updated + " · " + esc(m.timezone || "");
    $("foot-right").innerHTML = DATA.semesters.length + " semesters · " + progs + " programs · " + entries + " classes" +
      (isCustomized() ? " · local edits" : "") +
      (liveOk ? "" : ' <span class="sync-warn">· live updates unavailable</span>');
  }

  /* ---- clock --------------------------------------------- */
  function tick() {
    var d = new Date();
    $("now").textContent = DAYS[d.getDay() === 0 ? 6 : d.getDay() - 1] + " " + fmt12(d.getHours() * 60 + d.getMinutes());
    // refresh live badges every 30s
    refreshStatus();
    var p = curProgs().filter(function (x) { return x.id === state.prog; })[0];
    if (!p) return;
    // keep the status line fresh in place (it embeds the current time)
    var line = document.querySelector("#view .livestat");
    if (line) line.innerHTML = liveMessage(p, STATUS[p.id]);
    // rebuild only when the live/next badge or today actually changed
    if (viewKey(p) === VIEW_KEY) return;
    var v = $("view");
    v.classList.add("quiet");
    v.innerHTML = "";
    state.view === "list" ? renderList(v, p) : renderGrid(v, p);
    VIEW_KEY = viewKey(p);
  }

  /* ---- theme --------------------------------------------- */
  var themeTimer = null;
  function applyTheme(t) {
    var root = document.documentElement;
    root.dataset.theme = t;
    // cross-fade surfaces while the palette swaps, then step aside
    root.classList.add("theming");
    clearTimeout(themeTimer);
    themeTimer = setTimeout(function () { root.classList.remove("theming"); }, 360);
    localStorage.setItem("sycu.theme", t);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = t === "light" ? "#f3f5f9" : "#080b12";
  }
  $("theme").onclick = function () {
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  };

  /* ---- init ---------------------------------------------- */
  applyTheme(localStorage.getItem("sycu.theme") || "dark");
  var qEl = $("q");
  var qTimer = null;
  qEl.oninput = function () {
    clearTimeout(qTimer);
    var val = qEl.value;
    qTimer = setTimeout(function () { state.q = val; renderPrograms(false); }, 110);
  };
  qEl.onkeydown = function (e) {
    if (e.key === "Enter") {
      // jump to first program whose timetable contains the first match
      var hit = (curProgs().filter(function (p) {
        return (p.schedule || []).some(function (ee) {
          return (ee.course + " " + ee.location).toLowerCase().indexOf(state.q.toLowerCase()) >= 0;
        });
      })[0]);
      if (hit) { state.prog = hit.id; state.q = ""; qEl.value = ""; renderPrograms(false); renderInfo(); renderView(); }
    }
  };

  /* ---- admin integration --------------------------------- */
  // Pencil buttons on cards open the admin editor (admin mode only).
  $("view").addEventListener("click", function (ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest("[data-edit-prog]") : null;
    if (t && window.SYCU_ADMIN) window.SYCU_ADMIN.openProgram(t.getAttribute("data-edit-prog"));
  });

  /* Public surface used by admin.js */
  window.SYCU_APP = {
    getData: function () { return DATA; },
    getState: function () { return state; },
    syncRemote: syncRemote,
    applyData: function (d) { DATA = d; normalizeState(); renderAll(); },
    reload: function () { DATA = loadData(); normalizeState(); renderAll(); },
    defaultData: function () { return deepClone(DEFAULT_DATA); },
    storeSave: storeSave,
    storeClear: storeClear,
    isCustomized: isCustomized,
    resetToBundled: function () {
      cacheDrop(DATA_KEY);
      cacheDrop(REMOTE_KEY);
      DATA = deepClone(DEFAULT_DATA);
      normalizeState();
      renderAll();
    },
    renderAll: renderAll,
    colorFor: colorFor,
    esc: esc,
    DAYS: DAYS,
    DAY_CN: DAY_CN,
    sessionsOverlap: sessionsOverlap,
    entrySpan: entrySpan,
    timeSpanOf: timeSpanOf
  };

  renderAll();
  tick();
  setInterval(tick, 30000);

  /* live sync — fetch the published timetable at boot, whenever the tab
     is focused again, and every minute while visible */
  syncRemote();
  setInterval(function () { if (!document.hidden) syncRemote(); }, 60000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) syncRemote(); });
  window.addEventListener("focus", function () { syncRemote(); });
})();
