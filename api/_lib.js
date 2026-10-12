"use strict";
/* ============================================================
   SYCU Timetable API — shared helpers (not deployed as a route;
   files prefixed with "_" are helper modules only).

   Storage: Redis over its REST API (plain fetch — still zero dependencies,
   no driver, no connection pool to leak between warm lambdas). Accepts
   UPSTASH_REDIS_REST_URL/_TOKEN or the Vercel KV integration's
   KV_REST_API_URL/KV_REST_API_TOKEN (read-only token used for GETs). When
   neither is configured (local development) data falls back to
   .data-local/*.json.

   Auth: POST /api/login verifies ADMIN_EMAIL / ADMIN_PASSWORD from
   env and returns a signed token (HMAC-SHA256 with ADMIN_SECRET)
   valid for 8 hours. Write endpoints require it.
   ============================================================ */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

/* Storage credentials — two accepted spellings:
   UPSTASH_REDIS_REST_URL / _TOKEN   (direct Upstash database)
   KV_REST_API_URL / KV_REST_API_TOKEN (Vercel Marketplace KV integration)
   KV_REST_API_READ_ONLY_TOKEN, when present, is used for reads so the
   once-a-minute poll never carries a write-capable token. */
const REDIS_URL = String(
  process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || ""
).replace(/\/+$/, "");
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
const REDIS_RO_TOKEN = process.env.KV_REST_API_READ_ONLY_TOKEN || REDIS_TOKEN;
const DATA_KEY = "timetable:data";
function redisOn() { return !!(REDIS_URL && REDIS_TOKEN); }

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
/* Transient storage failures (429 / 5xx / network) are retried with a short
   backoff — every operation below is idempotent (GET, SET, DEL), so
   retrying cannot corrupt anything. */
const RETRY_DELAYS = [300, 900];
function storageError(kind, status) {
  const e = new Error("storage " + kind + (status != null ? " " + status : ""));
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

/* content hash for conditional (If-None-Match / 304) GETs */
function etagFor(data) {
  return '"' + crypto.createHash("sha1").update(JSON.stringify(data)).digest("base64").replace(/=+$/, "") + '"';
}

/* ---------- Redis over REST ----------
   POST {rest url} with the command as a JSON array; the reply is
   {"result": ...}. One HTTP round trip per storage call. `ro` picks the
   read-only token for GETs. */
async function redisCmd(cmd, ro) {
  return withRetry(async function () {
    const r = await fetch(REDIS_URL, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + (ro ? REDIS_RO_TOKEN : REDIS_TOKEN),
        "Content-Type": "application/json"
      },
      body: JSON.stringify(cmd)
    });
    if (!r.ok) throw storageError("redis", r.status);
    const body = await r.json();
    if (body && body.error) throw storageError(String(body.error), 400);
    return body ? body.result : null;
  });
}

async function storeGet() {
  if (!redisOn()) return localGet();
  const raw = await redisCmd(["GET", DATA_KEY], true);
  if (raw == null || raw === "") return null; // nothing published yet
  try { return JSON.parse(raw); }
  catch (e) { throw storageError("corrupt payload", 500); }
}

async function storePut(data) {
  if (!redisOn()) return localPut(data);
  await redisCmd(["SET", DATA_KEY, JSON.stringify(data)]);
  return true;
}

async function storeClear() {
  if (!redisOn()) return localClear();
  await redisCmd(["DEL", DATA_KEY]);
  return true;
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
  lockRemainingMs, recordFail, storeGet, storePut, storeClear, validShape,
  etagFor
};
