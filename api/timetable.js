"use strict";
/* GET  /api/timetable — published timetable (or null when none published).
   PUT  /api/timetable — publish a new timetable (admin token required). */
const { json, bodyOf, requireAuth, storeGet, storePut, validShape, etagFor } = require("./_lib");

module.exports = async (req, res) => {
  try {
    if (req.method === "GET") {
      const data = await storeGet();
      const updated = data && data.metadata ? (data.metadata.updated || null) : null;
      // conditional GET: a client holding this exact ETag gets 304 + no body,
      // so the once-a-minute poll costs the browser almost nothing
      const tag = data ? etagFor(data) : 'W/"empty"';
      res.setHeader("ETag", tag);
      const inm = String((req.headers && req.headers["if-none-match"]) || "");
      if (data && inm && inm.split(",").some(function (s) { return s.trim() === tag; })) {
        res.statusCode = 304;
        res.setHeader("Cache-Control", "no-store");
        return res.end();
      }
      return json(res, 200, { ok: true, data: data || null, updated: updated });
    }
    if (req.method === "PUT") {
      if (!requireAuth(req)) return json(res, 401, { ok: false, error: "unauthorized" });
      const b = bodyOf(req);
      const data = b && b.data ? b.data : b;
      if (!validShape(data)) return json(res, 400, { ok: false, error: "invalid timetable shape" });
      await storePut(data);
      const updated = data.metadata ? (data.metadata.updated || null) : null;
      return json(res, 200, { ok: true, updated: updated });
    }
    return json(res, 405, { ok: false, error: "method not allowed" });
  } catch (e) {
    return json(res, 500, { ok: false, error: "storage error" });
  }
};
