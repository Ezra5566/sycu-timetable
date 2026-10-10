"use strict";
/* POST /api/login — verify administrator credentials, return signed token. */
const { json, bodyOf, configured, credsValid, issueToken, lockRemainingMs, recordFail } = require("./_lib");

module.exports = async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "method not allowed" });
  if (!configured()) return json(res, 503, { ok: false, error: "admin login not configured" });

  const locked = lockRemainingMs(req);
  if (locked) return json(res, 429, { ok: false, error: "too many attempts", retryAfter: Math.ceil(locked / 1000) });

  const b = bodyOf(req);
  if (!credsValid(b.email, b.password)) {
    recordFail(req);
    return json(res, 401, { ok: false, error: "wrong email or password" });
  }

  const t = issueToken();
  return json(res, 200, { ok: true, token: t.token, exp: t.exp });
};
