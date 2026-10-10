"use strict";
/* GET  /api/timetable — published timetable (or null when none published).
   PUT  /api/timetable — publish a new timetable (admin token required). */
const { json, bodyOf, requireAuth, storeGet, storePut, validShape } = require("./_lib");

module.exports = async (req, res) => {
  try {
    if (req.method === "GET") {
      const data = await storeGet();
      const updated = data && data.metadata ? (data.metadata.updated || null) : null;
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
