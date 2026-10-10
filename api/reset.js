"use strict";
/* POST /api/reset — remove the published copy so the site falls back to the
   bundled data/timetable.js (admin token required). */
const { json, requireAuth, storeClear } = require("./_lib");

module.exports = async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "method not allowed" });
  if (!requireAuth(req)) return json(res, 401, { ok: false, error: "unauthorized" });
  try {
    await storeClear();
    return json(res, 200, { ok: true });
  } catch (e) {
    return json(res, 500, { ok: false, error: "storage error" });
  }
};
