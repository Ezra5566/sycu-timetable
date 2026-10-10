"use strict";
/* ============================================================
   SYCU Timetable API — shared helpers (not deployed as a route;
   files prefixed with "_" are helper modules only).

   Storage: Vercel Blob over its REST API (zero dependencies).
   When BLOB_READ_WRITE_TOKEN is not configured (local development)
   blobs fall back to .data-local/*.json on disk.

   Auth: POST /api/login verifies ADMIN_EMAIL / ADMIN_PASSWORD from
   env and returns a signed token (HMAC-SHA256 with ADMIN_SECRET)
   valid for 8 hours. Write endpoints require it.
   ============================================================ */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const BLOB_BASE = "https://blob.vercel-storage.com";
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || "";
// NOTE: do not send x-api-version — the unversioned API accepts slash
// pathnames on PUT/list/delete, while versioned (12) rejects them with
// "Invalid pathname". All three calls verified with curl against a live store.
const DATA_PATHNAME = "timetable/data.json";

/* ---------- responses ---------- */
function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

function bodyOf(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "object") return req.body;
    try { return JSON.parse(req.body); } catch (e) { return {}; }
  }
  return {};
}

/* ---------- credentials / tokens ---------- */
function timingSafeEqualStr(a, b) {
  const ba = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  if (ba.length !== bb.length) {
    crypto.timingSafeEqual(ba, ba); // keep timing flat
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

function configured() {
  return !!(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD && process.env.ADMIN_SECRET);
}

function credsValid(email, password) {
  return timingSafeEqualStr(String(email || ""), process.env.ADMIN_EMAIL) &&
    timingSafeEqualStr(String(password || ""), process.env.ADMIN_PASSWORD);
}

function hmac(exp) {
  return crypto.createHmac("sha256", process.env.ADMIN_SECRET).update(String(exp)).digest("hex");
}

function issueToken(ttlMs) {
  const exp = Date.now() + (ttlMs || 8 * 60 * 60 * 1000);
  return { token: exp + "." + hmac(exp), exp: exp };
}

function tokenValid(token) {
  if (!configured() || !token || typeof token !== "string") return false;
  const i = token.indexOf(".");
  if (i < 0) return false;
  const exp = Number(token.slice(0, i));
  const sig = token.slice(i + 1);
  if (!isFinite(exp) || exp < Date.now()) return false;
  return timingSafeEqualStr(sig, hmac(exp));
}

function requireAuth(req) {
  const h = (req.headers && req.headers.authorization) || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return tokenValid(m ? m[1] : null);
}

/* best-effort per-instance login throttle (warm lambdas keep state a while) */
const attempts = new Map();
function lockRemainingMs(req) {
  const a = attempts.get(clientIp(req));
  if (a && a.until && a.until > Date.now()) return a.until - Date.now();
  return 0;
}
function recordFail(req) {
  const ip = clientIp(req);
  const a = attempts.get(ip) || { n: 0, until: 0 };
  a.n += 1;
  if (a.n >= 5) { a.until = Date.now() + 30000; a.n = 0; }
  attempts.set(ip, a);
}
function clientIp(req) {
  const fwd = (req.headers && req.headers["x-forwarded-for"]) || "";
  return String(fwd).split(",")[0].trim() || "local";
}

/* ---------- storage ---------- */
function blobHeaders(extra) {
  return Object.assign({ Authorization: "Bearer " + BLOB_TOKEN }, extra || {});
}

/* Transient Blob failures (429 / 5xx / network) are retried with a short
   backoff — every storage operation below is idempotent (list, read,
   full-payload PUT, delete), so retrying cannot corrupt anything. */
const RETRY_DELAYS = [300, 900];
function blobError(kind, status) {
  const e = new Error("blob " + kind + " " + status);
  if (status != null) e.status = status;
  return e;
}
function retryable(err) {
  const s = err && err.status;
  return s == null || s === 429 || s >= 500;
}
async function withRetry(fn) {
  for (let i = 0; ; i++) {
    try { return await fn(); }
    catch (e) {
      if (i >= RETRY_DELAYS.length || !retryable(e)) throw e;
      await new Promise(function (r) { setTimeout(r, RETRY_DELAYS[i]); });
    }
  }
}

async function storeGet() {
  if (!BLOB_TOKEN) return localGet();
  return withRetry(async function () {
    const list = await fetch(BLOB_BASE + "/?pathname=" + encodeURIComponent(DATA_PATHNAME), {
      headers: blobHeaders()
    });
    if (!list.ok) throw blobError("list", list.status);
    const body = await list.json();
    const blobs = (body && body.blobs) || [];
    if (!blobs.length) return null;
    const file = await fetch(blobs[0].url);
    if (!file.ok) throw blobError("read", file.status);
    return await file.json();
  });
}

async function storePut(data) {
  if (!BLOB_TOKEN) return localPut(data);
  return withRetry(async function () {
    const r = await fetch(BLOB_BASE + "/" + DATA_PATHNAME, {
      method: "PUT",
      headers: blobHeaders({
        "content-type": "application/json",
        "x-add-random-suffix": "0",
        "x-cache-control-max-age": "0"
      }),
      body: JSON.stringify(data)
    });
    if (!r.ok) throw blobError("write", r.status);
    return true;
  });
}

async function storeClear() {
  if (!BLOB_TOKEN) return localClear();
  return withRetry(async function () {
    const list = await fetch(BLOB_BASE + "/?pathname=" + encodeURIComponent(DATA_PATHNAME), {
      headers: blobHeaders()
    });
    if (!list.ok) throw blobError("list", list.status);
    const body = await list.json();
    const blobs = (body && body.blobs) || [];
    if (!blobs.length) return true;
    // deletion is POST /delete with the blob URLs (not HTTP DELETE)
    const r = await fetch(BLOB_BASE + "/delete", {
      method: "POST",
      headers: blobHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ urls: blobs.map(function (b) { return b.url; }) })
    });
    if (!r.ok) throw blobError("delete", r.status);
    return true;
  });
}

/* ---------- local (dev) fallback ---------- */
const LOCAL_DIR = path.join(process.cwd(), ".data-local");
const LOCAL_FILE = path.join(LOCAL_DIR, "timetable.json");
function localGet() {
  try { return JSON.parse(fs.readFileSync(LOCAL_FILE, "utf8")); } catch (e) { return null; }
}
function localPut(data) {
  fs.mkdirSync(LOCAL_DIR, { recursive: true });
  fs.writeFileSync(LOCAL_FILE, JSON.stringify(data));
  return true;
}
function localClear() {
  try { fs.unlinkSync(LOCAL_FILE); } catch (e) { /* absent is fine */ }
  return true;
}

/* ---------- validation ---------- */
function validShape(data) {
  return !!(data && typeof data === "object" &&
    Array.isArray(data.semesters) && data.semesters.length > 0 &&
    data.timeSlotFormats && typeof data.timeSlotFormats === "object");
}

module.exports = {
  json, bodyOf, configured, credsValid, issueToken, requireAuth,
  lockRemainingMs, recordFail, storeGet, storePut, storeClear, validShape
};
