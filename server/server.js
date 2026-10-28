// #СказалаДа! — серверная часть портала.
// Node.js 22+, без внешних зависимостей: встроенные http, crypto и node:sqlite.
// Права доступа проверяются здесь, на сервере (ТЗ брокера, разделы 9, 13, 15).
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.resolve(HERE, "..", "public");
const DATA = path.resolve(process.env.DATA_DIR || path.join(HERE, "..", "data"));
const UPL = path.join(DATA, "uploads");
fs.mkdirSync(UPL, { recursive: true });
const PORT = +process.env.PORT || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const ADMINS = (process.env.ADMIN_EMAILS || "").toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
const SECURE_COOKIE = process.env.SECURE_COOKIE !== "0";

const db = new DatabaseSync(path.join(DATA, "portal.db"));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, pass TEXT NOT NULL, created TEXT NOT NULL, consent TEXT, disabled INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, uid TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS docs(path TEXT PRIMARY KEY, col TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated TEXT NOT NULL, by TEXT);
CREATE INDEX IF NOT EXISTS docs_col ON docs(col);
CREATE TABLE IF NOT EXISTS uploads(id TEXT PRIMARY KEY, uid TEXT, type TEXT, size INTEGER, created TEXT);
CREATE TABLE IF NOT EXISTS audit(at TEXT, uid TEXT, action TEXT, target TEXT, meta TEXT);`);

const nowIso = () => new Date().toISOString();
const rid = (n = 16) => crypto.randomBytes(n).toString("hex");
const uidNew = () => "u_" + crypto.randomBytes(12).toString("base64url").replace(/[^A-Za-z0-9]/g, "x");
const SEG = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
const BAD_TEXT = /(\+7|8)[\s\-()]*\d{3}[\s\-()]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}|https?:\/\/|www\.|t\.me\/|vk\.com\/|@[a-z0-9_]{4,}/i;
const audit = (uid, action, target, meta) => db.prepare("INSERT INTO audit VALUES(?,?,?,?,?)").run(nowIso(), uid || "", action, target || "", meta ? JSON.stringify(meta) : null);

/* ---------- пароли и сессии ---------- */
function hashPass(p) { const salt = rid(16); const h = crypto.scryptSync(p, salt, 64, { N: 16384 }).toString("hex"); return `scrypt$${salt}$${h}`; }
function checkPass(p, stored) { const [, salt, h] = String(stored).split("$"); if (!salt || !h) return false;
  const x = crypto.scryptSync(p, salt, 64, { N: 16384 }); const y = Buffer.from(h, "hex"); return x.length === y.length && crypto.timingSafeEqual(x, y); }
const SESSION_DAYS = 60;
function newSession(uid) { const t = rid(32); const now = Date.now(); db.prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(t, uid, now, now + SESSION_DAYS * 864e5); return t; }
function cookieHeader(t, maxAge) { return `sd_session=${t}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${SECURE_COOKIE ? "; Secure" : ""}`; }
function readCookie(req, name) { const m = (req.headers.cookie || "").match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)")); return m ? m[1] : ""; }
function currentUser(req) { const t = readCookie(req, "sd_session"); if (!t) return null;
  const s = db.prepare("SELECT * FROM sessions WHERE token=?").get(t); if (!s || s.expires < Date.now()) return null;
  const u = db.prepare("SELECT id,email,disabled FROM users WHERE id=?").get(s.uid); if (!u || u.disabled) return null;
  return { id: u.id, email: u.email, isAdmin: ADMINS.includes(u.email.toLowerCase()), token: t }; }

/* ---------- ограничение частоты ---------- */
const buckets = new Map();
function limited(key, max, perMs) { const now = Date.now(); const b = buckets.get(key) || { n: 0, t: now };
  if (now - b.t > perMs) { b.n = 0; b.t = now; } b.n++; buckets.set(key, b); return b.n > max; }
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (now - b.t > 36e5) buckets.delete(k); }, 6e5).unref();

/* ---------- хранилище документов ---------- */
function parsePath(p) { const segs = String(p || "").split("/"); if (!segs.length || segs.length > 16 || !segs.every(s => SEG.test(s) && s !== "." && s !== "..")) return null; return segs; }
function getDoc(p) { const r = db.prepare("SELECT data FROM docs WHERE path=?").get(p); return r ? JSON.parse(r.data) : null; }
function setDoc(p, data, by) { const segs = p.split("/"); db.prepare("INSERT INTO docs(path,col,id,data,updated,by) VALUES(?,?,?,?,?,?) ON CONFLICT(path) DO UPDATE SET data=excluded.data, updated=excluded.updated, by=excluded.by")
  .run(p, segs.slice(0, -1).join("/"), segs.at(-1), JSON.stringify(data), nowIso(), by || ""); }
function delDoc(p) { db.prepare("DELETE FROM docs WHERE path=?").run(p); }
function listCol(col) { return db.prepare("SELECT id,data FROM docs WHERE col=?").all(col).map(r => ({ id: r.id, data: JSON.parse(r.data) })); }
const itemsOf = d => (d && Array.isArray(d.items)) ? d.items : [];

/* ---------- контекст пользователя ---------- */
function ctxFor(user) { if (!user) return { uid: null, isAdmin: false, vendorIds: new Set(), vendorCats: new Set() };
  const vs = listCol("vendors").filter(v => v.id === user.id || (v.data && v.data.owner === user.id));
  return { uid: user.id, email: user.email, isAdmin: user.isAdmin, vendorIds: new Set(vs.map(v => v.id)), vendorCats: new Set(vs.map(v => v.data.cat)) }; }
function allRequests() { const out = []; for (const d of listCol("requests")) for (const r of itemsOf(d.data)) out.push({ ...r, coupleUid: d.id }); return out; }
function findRequest(id) { return allRequests().find(r => r.id === id) || null; }
function reqStatus(r) { if (r.status === "open" && r.deadlineAt && Date.now() > Date.parse(r.deadlineAt)) return "expired"; return r.status; }
function offersOfUid(uid) { return itemsOf(getDoc("offers/" + uid)); }
function vendorSeesRequest(r, ctx, myOfferReqIds) {
  if (!ctx.vendorIds.size) return false; const st = reqStatus(r);
  if (["draft", "pending_review", "rejected"].includes(st)) return false;
  if ((r.invited || []).some(i => ctx.vendorIds.has(i.vendorId))) return true;
  if (myOfferReqIds && myOfferReqIds.has(r.id)) return true;
  return r.mode === "tender" && st !== "paused" && ctx.vendorCats.has(r.categoryId);
}
function sanitizeRequestForVendor(r) { const { favs, history, autoExpand, ...rest } = r;
  return { ...rest, invited: (r.invited || []).map(i => ({ vendorId: i.vendorId, vendorName: i.vendorName, sentAt: i.sentAt, reasons: i.reasons, wave: i.wave })), history: [] }; }

/* ---------- чтение: что видит пользователь ---------- */
function readFilter(segs, data, ctx) {
  const col = segs.slice(0, -1).join("/"), id = segs.at(-1), top = segs[0];
  if (ctx.isAdmin) return data;
  if (top === "vendors" && segs.length === 2) { if (data.visible === false && !ctx.vendorIds.has(id)) return null; return data; }
  if (top === "data" && segs[1] === "users") return segs[2] === ctx.uid ? data : null;
  if (!ctx.uid) return null;
  if (top === "cards" || top === "complaints") return id === ctx.uid ? data : null;
  if (top === "blocks") return null;
  if (top === "redemptions") { if (id === ctx.uid) return data;
    const its = itemsOf(data).filter(x => x.cardOwner === ctx.uid || ctx.vendorIds.has(x.vendorId)); return its.length ? { ...data, items: its } : null; }
  if (top === "requests") { if (id === ctx.uid) return data;
    const mine = new Set(offersOfUid(ctx.uid).map(o => o.requestId));
    const its = itemsOf(data).map(r => ({ ...r, coupleUid: id })).filter(r => vendorSeesRequest(r, ctx, mine)).map(r => { const { coupleUid, ...x } = sanitizeRequestForVendor(r); return x; });
    return its.length ? { ...data, items: its } : null; }
  if (top === "offers") { if (id === ctx.uid) return data;
    // пара видит отклики только на свои заявки; конкуренты не видят чужих цен
    const its = itemsOf(data).filter(o => o.coupleUid === ctx.uid || ctx.vendorIds.has(o.vendorId)); return its.length ? { ...data, items: its } : null; }
  if (top === "messages") { if (id === ctx.uid) return data;
    const its = itemsOf(data).filter(m => { const r = findRequest(m.requestId); return (r && r.coupleUid === ctx.uid) || ctx.vendorIds.has(m.vendorId); });
    return its.length ? { ...data, items: its } : null; }
  return null;
}

/* ---------- запись: что можно менять ---------- */
const TEXT_LIMITS = { description: 2000, services: 600, comment: 600, body: 1000 };
function tooLong(o) { for (const [k, n] of Object.entries(TEXT_LIMITS)) if (o && typeof o[k] === "string" && o[k].length > n) return k; return null; }
function validateWrite(segs, data, prev, ctx) {
  const top = segs[0], id = segs.at(-1);
  if (!ctx.uid) return "auth";
  if (data !== null && (typeof data !== "object" || Array.isArray(data))) return "shape";
  if (JSON.stringify(data || {}).length > 256 * 1024) return "too_large";
  if (ctx.isAdmin) return null;
  if (top === "data" && segs[1] === "users") return segs[2] === ctx.uid && segs.length === 4 ? null : "forbidden";
  if (top === "vendors") { if (segs.length !== 2) return "forbidden";
    if (id !== ctx.uid && !(prev && prev.owner === ctx.uid)) return "forbidden";
    if (data) { data.owner = ctx.uid; delete data.demo; if (prev && prev.visible === false) data.visible = false; else data.visible = true; }
    return null; }
  if (top === "cards") { if (segs.length !== 2 || id !== ctx.uid) return "forbidden"; if (data) { delete data.blocked; } return null; }
  if (top === "blocks") return "forbidden";
  if (top === "complaints") return segs.length === 2 && id === ctx.uid ? null : "forbidden";
  if (["redemptions", "requests", "offers", "messages"].includes(top)) { if (segs.length !== 2 || id !== ctx.uid) return "forbidden"; }
  else return "forbidden";
  if (data === null) return top === "requests" && itemsOf(prev).some(r => r.status !== "draft") ? "forbidden" : null;
  const prevById = new Map(itemsOf(prev).map(x => [x.id, x]));
  const items = itemsOf(data);
  const changed = items.filter(x => JSON.stringify(x) !== JSON.stringify(prevById.get(x.id)));
  for (const x of changed) { const tl = tooLong(x); if (tl) return "too_long:" + tl; }
  if (top === "redemptions") { for (const x of changed) if (!ctx.vendorIds.has(x.vendorId)) return "not_your_vendor"; return null; }
  if (top === "requests") {
    const removed = itemsOf(prev).filter(p => !items.some(x => x.id === p.id));
    if (removed.some(p => p.status !== "draft")) return "cannot_delete_published";
    let submittedToday = items.filter(x => x.submittedAt && Date.now() - Date.parse(x.submittedAt) < 864e5).length;
    for (const x of changed) { const p = prevById.get(x.id);
      if (!x.id || !SEG.test(x.id)) return "bad_id";
      const from = p ? p.status : null, to = x.status;
      if (!p && !["draft", "pending_review"].includes(to)) return "bad_status";
      if (p && from !== to) {
        const ok = (to === "pending_review" && ["draft", "rejected", "pending_review"].includes(from))
          || (to === "draft" && ["draft", "rejected"].includes(from))
          || (to === "cancelled" && !["draft", "cancelled"].includes(from))
          || (to === "selected" && reqStatus(p) === "open")
          || (to === "open" && p.publishedAt && ["selected", "cancelled", "expired", "open"].includes(reqStatus(p)));
        if (!ok) return "bad_transition:" + from + "->" + to; }
      if (p && p.publishedAt && x.publishedAt !== p.publishedAt) return "publishedAt_locked";
      if (!p || !p.publishedAt) { if (x.publishedAt) return "cannot_self_publish"; }
      if (to === "pending_review" && from !== "pending_review") {
        if (!x.categoryId || !x.eventDate || !x.city || !x.description) return "required_fields";
        if (BAD_TEXT.test(x.description || "") || BAD_TEXT.test((x.tags || []).join(" "))) return "contacts_in_text";
        if (submittedToday > 3) return "rate_limit_requests"; }
      if (to === "selected") { const o = allOffersFlat().find(o => o.id === x.selectedOfferId && o.requestId === x.id); if (!o) return "offer_not_found"; }
      if (["rejected", "paused"].includes(to) && from !== to) return "admin_only"; }
    return null; }
  if (top === "offers") {
    for (const x of changed) { const p = prevById.get(x.id); const r = findRequest(x.requestId);
      if (!r) return "request_not_found"; if (!ctx.vendorIds.has(x.vendorId)) return "not_your_vendor";
      if (x.id !== x.vendorId + "~" + x.requestId) return "bad_id";
      x.coupleUid = r.coupleUid;
      const onlyWithdraw = p && x.status === "withdrawn";
      if (!onlyWithdraw) { const mine = new Set(offersOfUid(ctx.uid).map(o => o.requestId));
        if (!vendorSeesRequest(r, ctx, mine)) return "request_hidden";
        if (reqStatus(r) !== "open") return "request_closed"; }
      if (!x.priceOnRequest && !(Number.isInteger(x.price) && x.price > 0)) return "price"; }
    return null; }
  if (top === "messages") {
    for (const x of changed) { const r = findRequest(x.requestId); if (!r) return "request_not_found";
      if (x.from === "couple") { if (r.coupleUid !== ctx.uid) return "forbidden"; }
      else if (x.from === "vendor") { if (!ctx.vendorIds.has(x.vendorId)) return "not_your_vendor";
        if (reqStatus(r) !== "selected" && BAD_TEXT.test(x.body || "")) return "contacts_in_text"; }
      else return "bad_side"; }
    return null; }
  return "forbidden";
}
function allOffersFlat() { const out = []; for (const d of listCol("offers")) for (const o of itemsOf(d.data)) out.push(o); return out; }

/* ---------- HTTP ---------- */
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8", ".woff2": "font/woff2" };
function send(res, code, body, headers = {}) { const isObj = typeof body === "object" && !Buffer.isBuffer(body);
  res.writeHead(code, { "Content-Type": isObj ? "application/json; charset=utf-8" : "text/plain; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(isObj ? JSON.stringify(body) : body); }
const err = (res, code, c, msg) => send(res, code, { code: c, error: msg || c });
function readBody(req, max) { return new Promise((ok, bad) => { const chunks = []; let n = 0;
  req.on("data", c => { n += c.length; if (n > max) { bad(new Error("too_large")); req.destroy(); } else chunks.push(c); });
  req.on("end", () => ok(Buffer.concat(chunks))); req.on("error", bad); }); }
async function readJson(req) { const b = await readBody(req, 600 * 1024); try { return JSON.parse(b.toString("utf8") || "{}"); } catch { return null; } }
const SEC_HEADERS = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "X-Frame-Options": "SAMEORIGIN", "Permissions-Policy": "camera=(), microphone=(), geolocation=()" };

function serveStatic(req, res, urlPath) {
  let p = decodeURIComponent(urlPath); if (p === "/" || p === "") p = "/index.html";
  const file = path.resolve(PUB, "." + p); if (!file.startsWith(PUB)) return err(res, 403, "forbidden");
  fs.stat(file, (e, st) => { if (e || !st.isFile()) { if (!path.extname(p)) return serveStatic(req, res, "/index.html"); return err(res, 404, "not_found"); }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=604800", ...SEC_HEADERS });
    fs.createReadStream(file).pipe(res); }); }
function serveUpload(res, id) { if (!/^[a-f0-9]{32}$/.test(id)) return err(res, 404, "not_found");
  const u = db.prepare("SELECT type FROM uploads WHERE id=?").get(id); if (!u) return err(res, 404, "not_found");
  const f = path.join(UPL, id); if (!fs.existsSync(f)) return err(res, 404, "not_found");
  res.writeHead(200, { "Content-Type": u.type, "Cache-Control": "public, max-age=31536000, immutable", ...SEC_HEADERS }); fs.createReadStream(f).pipe(res); }
function sniffImage(b) { if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP") return "image/webp"; return null; }

async function api(req, res, url) {
  const user = currentUser(req); const ctx = ctxFor(user); const m = req.method; const route = url.pathname;
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  if (m !== "GET" && req.headers["x-sd"] !== "1") return err(res, 403, "csrf", "Обновите страницу и повторите");
  if (m !== "GET" && limited("w:" + (user ? user.id : ip), 120, 6e4)) return err(res, 429, "resource_exhausted", "Слишком много действий подряд. Подождите минуту.");

  if (route === "/api/me" && m === "GET") return send(res, 200, { user: user ? { id: user.id, email: user.email, isAdmin: user.isAdmin } : null });
  if (route === "/api/auth/register" && m === "POST") {
    if (limited("reg:" + ip, 10, 36e5)) return err(res, 429, "resource_exhausted", "Слишком много регистраций с этого адреса. Попробуйте позже.");
    const b = await readJson(req); const email = String(b && b.email || "").trim().toLowerCase(); const pass = String(b && b.password || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) return err(res, 400, "invalid_argument", "Проверьте email");
    if (pass.length < 8 || pass.length > 200) return err(res, 400, "invalid_argument", "Пароль должен быть не короче 8 символов");
    if (!b.consent) return err(res, 400, "invalid_argument", "Нужно согласие на обработку персональных данных");
    if (db.prepare("SELECT 1 FROM users WHERE email=?").get(email)) return err(res, 409, "exists", "Такой email уже зарегистрирован. Войдите или попросите организатора сбросить пароль.");
    const id = uidNew(); db.prepare("INSERT INTO users(id,email,pass,created,consent) VALUES(?,?,?,?,?)").run(id, email, hashPass(pass), nowIso(), nowIso());
    audit(id, "register", email); const t = newSession(id);
    return send(res, 200, { user: { id, email, isAdmin: ADMINS.includes(email) } }, { "Set-Cookie": cookieHeader(t, SESSION_DAYS * 86400) }); }
  if (route === "/api/auth/login" && m === "POST") {
    const b = await readJson(req); const email = String(b && b.email || "").trim().toLowerCase();
    if (limited("login:" + ip, 20, 9e5) || limited("login:" + email, 8, 9e5)) return err(res, 429, "resource_exhausted", "Слишком много попыток входа. Подождите 15 минут.");
    const u = db.prepare("SELECT * FROM users WHERE email=?").get(email);
    if (!u || u.disabled || !checkPass(String(b.password || ""), u.pass)) return err(res, 401, "auth", "Неверный email или пароль");
    const t = newSession(u.id); audit(u.id, "login", email);
    return send(res, 200, { user: { id: u.id, email: u.email, isAdmin: ADMINS.includes(u.email) } }, { "Set-Cookie": cookieHeader(t, SESSION_DAYS * 86400) }); }
  if (route === "/api/auth/logout" && m === "POST") { if (user) db.prepare("DELETE FROM sessions WHERE token=?").run(user.token); return send(res, 200, { ok: true }, { "Set-Cookie": cookieHeader("", 0) }); }
  if (route === "/api/auth/password" && m === "POST") { if (!user) return err(res, 401, "auth");
    const b = await readJson(req); const u = db.prepare("SELECT pass FROM users WHERE id=?").get(user.id);
    if (!checkPass(String(b.old || ""), u.pass)) return err(res, 400, "invalid_argument", "Текущий пароль неверный");
    if (String(b.password || "").length < 8) return err(res, 400, "invalid_argument", "Новый пароль должен быть не короче 8 символов");
    db.prepare("UPDATE users SET pass=? WHERE id=?").run(hashPass(String(b.password)), user.id); db.prepare("DELETE FROM sessions WHERE uid=? AND token<>?").run(user.id, user.token);
    audit(user.id, "password_change"); return send(res, 200, { ok: true }); }
  if (route === "/api/me" && m === "DELETE") { if (!user) return err(res, 401, "auth");
    const b = await readJson(req); const u = db.prepare("SELECT pass FROM users WHERE id=?").get(user.id);
    if (!checkPass(String(b && b.password || ""), u.pass)) return err(res, 400, "invalid_argument", "Пароль неверный");
    db.prepare("DELETE FROM docs WHERE path LIKE ? OR path=? OR path=?").run("data/users/" + user.id + "/%", "cards/" + user.id, "complaints/" + user.id);
    const reqs = getDoc("requests/" + user.id); if (reqs) setDoc("requests/" + user.id, { ...reqs, items: itemsOf(reqs).filter(r => r.status !== "draft").map(r => ({ ...r, status: ["open", "pending_review"].includes(r.status) ? "cancelled" : r.status, deletedAccount: true })) }, user.id);
    db.prepare("DELETE FROM sessions WHERE uid=?").run(user.id); db.prepare("UPDATE users SET disabled=1, email=?, pass='' WHERE id=?").run("deleted-" + user.id + "@deleted", user.id);
    audit(user.id, "account_deleted"); return send(res, 200, { ok: true }, { "Set-Cookie": cookieHeader("", 0) }); }

  if (route === "/api/doc") { const segs = parsePath(url.searchParams.get("path")); if (!segs || segs.length % 2) return err(res, 400, "invalid_argument", "Неверный путь");
    const p = segs.join("/"); const prev = getDoc(p);
    if (m === "GET") { if (segs[0] === "blocks" && ctx.uid && !ctx.isAdmin) return send(res, 200, { data: prev ? { num: prev.num } : null });
      return send(res, 200, { data: prev ? readFilter(segs, prev, ctx) : null }); }
    if (m === "PUT" || m === "DELETE") { const b = m === "PUT" ? await readJson(req) : { data: null }; if (!b) return err(res, 400, "invalid_argument");
      const data = m === "PUT" ? b.data : null; const e = validateWrite(segs, data, prev, ctx);
      if (e) return err(res, e === "auth" ? 401 : 400, "invalid_argument", e);
      if (data === null) delDoc(p); else setDoc(p, data, ctx.uid);
      if (ctx.isAdmin && !(p.startsWith("data/users/" + ctx.uid))) audit(ctx.uid, m === "PUT" ? "admin_write" : "admin_delete", p);
      return send(res, 200, { ok: true }); }
    return err(res, 405, "method"); }
  if (route === "/api/col" && m === "GET") { const segs = parsePath(url.searchParams.get("path")); if (!segs || segs.length % 2 === 0) return err(res, 400, "invalid_argument", "Неверный путь");
    const col = segs.join("/");
    if (segs[0] === "cards" && !ctx.isAdmin) { // проверка карты по номеру: только партнёрам с карточкой каталога
      let where = []; try { where = JSON.parse(url.searchParams.get("where") || "[]"); } catch {}
      const w = where.find(x => x[0] === "num" && (x[1] === "==" || x[1] === "eq")); if (!w || !ctx.uid) return send(res, 200, { docs: [] });
      if (!ctx.vendorIds.size) return err(res, 403, "invalid_argument", "Проверять карты могут партнёры с карточкой в каталоге");
      if (limited("chk:" + ctx.uid, 60, 36e5)) return err(res, 429, "resource_exhausted", "Слишком много проверок за час");
      const hit = listCol("cards").find(d => d.data && d.data.num === w[2]);
      return send(res, 200, { docs: hit ? [{ id: hit.id, data: { num: hit.data.num, names: hit.data.names, date: hit.data.date, createdAt: hit.data.createdAt } }] : [] }); }
    const docs = listCol(col).map(d => ({ id: d.id, data: readFilter([...segs, d.id], d.data, ctx) })).filter(d => d.data !== null);
    return send(res, 200, { docs }); }
  if (route === "/api/upload" && m === "POST") { if (!user) return err(res, 401, "auth");
    if (limited("up:" + user.id, 60, 36e5)) return err(res, 429, "resource_exhausted", "Слишком много загрузок за час");
    let b; try { b = await readBody(req, 10 * 1024 * 1024); } catch { return err(res, 413, "too_large", "Файл больше 10 МБ"); }
    const type = sniffImage(b); if (!type) return err(res, 400, "invalid_argument", "Нужен JPG, PNG или WebP");
    const id = rid(16); fs.writeFileSync(path.join(UPL, id), b); db.prepare("INSERT INTO uploads VALUES(?,?,?,?,?)").run(id, user.id, type, b.length, nowIso());
    return send(res, 200, { id, url: "/_blob/" + id, sizeBytes: b.length, contentType: type }); }

  /* --- организатор --- */
  if (route.startsWith("/api/admin/")) { if (!ctx.isAdmin) return err(res, 403, "forbidden");
    if (route === "/api/admin/users" && m === "GET") return send(res, 200, { users: db.prepare("SELECT id,email,created,disabled FROM users ORDER BY created DESC LIMIT 500").all() });
    const b = await readJson(req) || {};
    if (route === "/api/admin/reset-password" && m === "POST") { const u = db.prepare("SELECT id FROM users WHERE email=?").get(String(b.email || "").trim().toLowerCase());
      if (!u) return err(res, 404, "not_found", "Пользователь с таким email не найден");
      const tmp = crypto.randomBytes(6).toString("base64url"); db.prepare("UPDATE users SET pass=? WHERE id=?").run(hashPass(tmp), u.id); db.prepare("DELETE FROM sessions WHERE uid=?").run(u.id);
      audit(ctx.uid, "reset_password", u.id); return send(res, 200, { password: tmp }); }
    if (route === "/api/admin/assign-vendor" && m === "POST") { const u = db.prepare("SELECT id FROM users WHERE email=?").get(String(b.email || "").trim().toLowerCase());
      if (!u) return err(res, 404, "not_found", "Пользователь с таким email не найден");
      const v = getDoc("vendors/" + b.vendorId); if (!v) return err(res, 404, "not_found", "Карточка не найдена");
      if (getDoc("vendors/" + u.id) && b.vendorId !== u.id) return err(res, 409, "exists", "У этого пользователя уже есть своя карточка");
      const nv = { ...v, owner: u.id, updatedAt: nowIso() }; delete nv.demo;
      if (b.vendorId !== u.id) { setDoc("vendors/" + u.id, nv, ctx.uid); delDoc("vendors/" + b.vendorId);
        // ссылки на старый id в заявках, откликах и отметках
        for (const col of ["requests", "offers", "messages", "redemptions"]) for (const d of listCol(col)) { const s = JSON.stringify(d.data); if (s.includes(b.vendorId)) setDoc(col + "/" + d.id, JSON.parse(s.split('"' + b.vendorId).join('"' + u.id)), ctx.uid); } }
      else setDoc("vendors/" + u.id, nv, ctx.uid);
      audit(ctx.uid, "assign_vendor", b.vendorId, { to: u.id }); return send(res, 200, { ok: true, vendorId: u.id }); }
    return err(res, 404, "not_found"); }
  return err(res, 404, "not_found");
}

/* ---------- первичное наполнение ---------- */
function seed() { const f = path.resolve(HERE, "..", "seed", "seed.json"); if (!fs.existsSync(f)) return;
  if (db.prepare("SELECT COUNT(*) n FROM docs WHERE col='vendors'").get().n) return;
  const s = JSON.parse(fs.readFileSync(f, "utf8"));
  for (const [p, data] of Object.entries(s.docs || {})) setDoc(p, data, "seed");
  for (const up of s.uploads || []) { const src = path.resolve(HERE, "..", "seed", up.file); if (fs.existsSync(src)) { fs.copyFileSync(src, path.join(UPL, up.id)); db.prepare("INSERT OR IGNORE INTO uploads VALUES(?,?,?,?,?)").run(up.id, "seed", up.type, fs.statSync(src).size, nowIso()); } }
  console.log("seeded", Object.keys(s.docs || {}).length, "docs"); }
seed();
setInterval(() => db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now()), 36e5).unref();

http.createServer(async (req, res) => {
  try { const url = new URL(req.url, "http://x");
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    if (url.pathname.startsWith("/_blob/")) return serveUpload(res, url.pathname.slice(7));
    if (req.method !== "GET" && req.method !== "HEAD") return err(res, 405, "method");
    return serveStatic(req, res, url.pathname);
  } catch (e) { console.error(e); if (!res.headersSent) err(res, 500, "unavailable", "Ошибка сервера. Повторите позже."); }
}).listen(PORT, HOST, () => console.log(`#СказалаДа! portal on http://${HOST}:${PORT}`));
