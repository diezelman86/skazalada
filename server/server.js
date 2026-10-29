// #СказалаДа! — серверная часть портала.
// Node.js 22+, без внешних зависимостей: встроенные http, crypto и node:sqlite.
// Права доступа проверяются здесь, на сервере (ТЗ брокера, разделы 9, 13, 15; ТЗ «Реклама, Партнёр + и Сотрудничество» v2.1).
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { seoRoute, sitemapXml, robotsTxt, injectSeo } from "./seo.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.resolve(HERE, "..", "public");
const DATA = path.resolve(process.env.DATA_DIR || path.join(HERE, "..", "data"));
const UPL = path.join(DATA, "uploads");
fs.mkdirSync(UPL, { recursive: true });
const PORT = +process.env.PORT || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const ADMINS = (process.env.ADMIN_EMAILS || "").toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
const SECURE_COOKIE = process.env.SECURE_COOKIE !== "0";
const PUBLIC_URL = (process.env.PUBLIC_URL || "https://xn----7sbaabxrwm9c.xn--p1ai").replace(/\/$/, "");
const EVENT_SALT = process.env.EVENT_SALT || "sd-events";

const db = new DatabaseSync(path.join(DATA, "portal.db"));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, pass TEXT NOT NULL, created TEXT NOT NULL, consent TEXT, disabled INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, uid TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS docs(path TEXT PRIMARY KEY, col TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated TEXT NOT NULL, by TEXT);
CREATE INDEX IF NOT EXISTS docs_col ON docs(col);
CREATE TABLE IF NOT EXISTS uploads(id TEXT PRIMARY KEY, uid TEXT, type TEXT, size INTEGER, created TEXT);
CREATE TABLE IF NOT EXISTS audit(at TEXT, uid TEXT, action TEXT, target TEXT, meta TEXT);
CREATE TABLE IF NOT EXISTS migrations(id TEXT PRIMARY KEY, at TEXT NOT NULL, backup TEXT);
CREATE TABLE IF NOT EXISTS events(day TEXT NOT NULL, at TEXT NOT NULL, kind TEXT NOT NULL, slot TEXT NOT NULL DEFAULT '', campaign TEXT NOT NULL DEFAULT '', vendor TEXT NOT NULL DEFAULT '', sid TEXT NOT NULL, page TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS events_uniq ON events(day, kind, slot, campaign, vendor, sid);
CREATE INDEX IF NOT EXISTS events_day ON events(day);
CREATE INDEX IF NOT EXISTS audit_at ON audit(at);`);
try { db.exec("ALTER TABLE users ADD COLUMN role TEXT"); } catch (_) { /* колонка уже есть */ }
const ROLES = ["couple", "vendor"];

const nowIso = () => new Date().toISOString();
const rid = (n = 16) => crypto.randomBytes(n).toString("hex");
const uidNew = () => "u_" + crypto.randomBytes(12).toString("base64url").replace(/[^A-Za-z0-9]/g, "x");
const genId = p => p + Date.now().toString(36) + crypto.randomBytes(3).toString("hex");
const SEG = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
const BAD_TEXT = /(\+7|8)[\s\-()]*\d{3}[\s\-()]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}|https?:\/\/|www\.|t\.me\/|vk\.com\/|@[a-z0-9_]{4,}/i;
const audit = (uid, action, target, meta) => db.prepare("INSERT INTO audit VALUES(?,?,?,?,?)").run(nowIso(), uid || "", action, target || "", meta ? JSON.stringify(meta) : null);
const tx = fn => { db.exec("BEGIN IMMEDIATE"); try { const r = fn(); db.exec("COMMIT"); return r; } catch (e) { try { db.exec("ROLLBACK"); } catch (_) {} throw e; } };

/* ---------- разделы каталога (для SEO, слагов и подбора) ---------- */
export const CATS = { venue: "Площадки и рестораны", reg: "Выездная регистрация", travel: "Свадебные путешествия", photo: "Фотографы", video: "Видеографы", host: "Ведущие", agency: "Организаторы и агентства",
  beauty: "Стилисты и визажисты", music: "Музыканты и DJ", show: "Шоу-программа", dance: "Постановка танца", dress: "Свадебные платья", suit: "Мужские костюмы", rings: "Кольца и украшения",
  decor: "Декор и флористика", cake: "Торты и кондитеры", print: "Приглашения и полиграфия", car: "Транспорт" };
const TR = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya" };
export const translit = s => String(s || "").toLowerCase().split("").map(c => TR[c] ?? c).join("").replace(/&/g, "-i-").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "partner";
export const catSlug = id => translit(CATS[id] || id);

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
  const u = db.prepare("SELECT id,email,disabled,role FROM users WHERE id=?").get(s.uid); if (!u || u.disabled) return null;
  return { id: u.id, email: u.email, isAdmin: ADMINS.includes(u.email.toLowerCase()), role: u.role || inferRole(u.id), token: t }; }
/* Роль аккаунта: пара или подрядчик. У старых аккаунтов без роли определяем по данным и запоминаем. */
function inferRole(uid) {
  let role = null;
  if (getDoc("vendors/" + uid) || listCol("vendors").some(v => v.data && v.data.owner === uid)) role = "vendor";
  else if (getDoc("cards/" + uid) || getDoc("requests/" + uid)) role = "couple";
  if (role) db.prepare("UPDATE users SET role=? WHERE id=? AND role IS NULL").run(role, uid);
  return role; }
const pubUser = u => ({ id: u.id, email: u.email, isAdmin: ADMINS.includes(String(u.email).toLowerCase()), role: u.role || null });

/* ---------- ограничение частоты ---------- */
const buckets = new Map();
function limited(key, max, perMs) { const now = Date.now(); const b = buckets.get(key) || { n: 0, t: now };
  if (now - b.t > perMs) { b.n = 0; b.t = now; } b.n++; buckets.set(key, b); return b.n > max; }
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (now - b.t > 864e5) buckets.delete(k); }, 6e5).unref();

/* ---------- хранилище документов ---------- */
function parsePath(p) { const segs = String(p || "").split("/"); if (!segs.length || segs.length > 16 || !segs.every(s => SEG.test(s) && s !== "." && s !== "..")) return null; return segs; }
function getDoc(p) { const r = db.prepare("SELECT data FROM docs WHERE path=?").get(p); return r ? JSON.parse(r.data) : null; }
function setDoc(p, data, by) { const segs = p.split("/"); db.prepare("INSERT INTO docs(path,col,id,data,updated,by) VALUES(?,?,?,?,?,?) ON CONFLICT(path) DO UPDATE SET data=excluded.data, updated=excluded.updated, by=excluded.by")
  .run(p, segs.slice(0, -1).join("/"), segs.at(-1), JSON.stringify(data), nowIso(), by || ""); if (segs[0] === "subs" || segs[0] === "settings" || segs[0] === "reviews") resetCaches(); }
function delDoc(p) { db.prepare("DELETE FROM docs WHERE path=?").run(p); resetCaches(); }
function listCol(col) { return db.prepare("SELECT id,data FROM docs WHERE col=?").all(col).map(r => ({ id: r.id, data: JSON.parse(r.data) })); }
const itemsOf = d => (d && Array.isArray(d.items)) ? d.items : [];

/* ---------- настройки, тарифы, статус партнёра ---------- */
export const DEFAULT_SETTINGS = {
  features: { plus: true, ads: true, favorites: true, direct: true, calendar: true, sos: true, reviews: true, seo: true },
  pinnedMobile: 2, pinnedDesktop: 3, firstPage: 12, excludePinnedFromOrganic: true, plusRotation: true, adMarker: "Реклама",
  viewMinPct: 50, viewMinMs: 1000, calendarMonths: 18, sosWaveMinutes: 30, sosMaxWaves: 3, sosPerDay: 1, sosPerMonth: 3, sosAutoPublish: true,
  plusPriceText: "Условия уточняет организатор", plusDurationText: "", reviewMin: 50, reviewMax: 1500, trialEnd: "2027-02-28",
};
let cache = {};
function resetCaches() { cache = {}; }
function settings() { if (!cache.settings) { const s = getDoc("settings/main") || {}; cache.settings = { ...DEFAULT_SETTINGS, ...s, features: { ...DEFAULT_SETTINGS.features, ...(s.features || {}) } }; } return cache.settings; }
const feat = name => settings().features[name] !== false;
function subsMap() { if (!cache.subs) cache.subs = new Map(listCol("subs").map(d => [d.id, d.data])); return cache.subs; }
/* PLUS действует только в срок подписки; допуск к программе и утверждение скидки — отдельные проверки организатора (ТЗ 2.3, 2.6). */
function planOf(vendorId) { const s = subsMap().get(vendorId) || null; const now = nowIso();
  const inTerm = !!s && s.status === "active" && (!s.startAt || s.startAt <= now) && (!s.endAt || now <= s.endAt);
  return { plan: inTerm ? "PLUS" : "FREE", active: inTerm, admitted: inTerm && !!s.participationVerified && feat("plus"), discountOk: inTerm && !!s.participationVerified && !!s.discountApproved && !!s.terms && feat("plus"),
    expired: !!s && s.status === "active" && !!s.endAt && now > s.endAt, sub: s }; }
const normTerms = v => ({ discount: { pct: +(v && v.discount && v.discount.pct) || 0, cond: String((v && v.discount && v.discount.cond) || "") }, promo: String((v && v.promo) || ""),
  offer: { title: String((v && v.offer && v.offer.title) || ""), terms: String((v && v.offer && v.offer.terms) || ""), until: String((v && v.offer && v.offer.until) || "") } });
const termsEmpty = t => !t.discount.pct && !t.discount.cond && !t.promo && !t.offer.title && !t.offer.terms;
const sameTerms = (a, b) => JSON.stringify(normTerms(a)) === JSON.stringify(normTerms(b));
function reviewsByVendor() { if (!cache.rev) { const m = new Map(); for (const d of listCol("reviews")) { const r = d.data; if (r.status !== "published") continue; const x = m.get(r.vendorId) || { n: 0, sum: 0 }; x.n++; x.sum += r.rating; m.set(r.vendorId, x); } cache.rev = m; } return cache.rev; }
function ratingOf(id) { const x = reviewsByVendor().get(id); return x ? { avg: Math.round(x.sum / x.n * 10) / 10, count: x.n } : { avg: 0, count: 0 }; }

/* ---------- контекст пользователя ---------- */
const isApproved = v => !v || !v.mod || v.mod === "approved"; // карточки без поля mod — созданы до премодерации
function ctxFor(user) { const empty = new Set(); if (!user) return { uid: null, isAdmin: false, vendorIds: empty, ownVendorIds: empty, plusIds: empty, vendorCats: empty, plusCats: empty };
  const vs = listCol("vendors").filter(v => v.id === user.id || (v.data && v.data.owner === user.id));
  const ok = vs.filter(v => isApproved(v.data)); const plus = ok.filter(v => planOf(v.id).admitted);
  return { uid: user.id, email: user.email, isAdmin: user.isAdmin, role: user.role, ownVendorIds: new Set(vs.map(v => v.id)), vendorIds: new Set(ok.map(v => v.id)), vendorCats: new Set(ok.map(v => v.data.cat)),
    plusIds: new Set(plus.map(v => v.id)), plusCats: new Set(plus.map(v => v.data.cat)) }; }
const today = () => new Date(Date.now() + 3 * 36e5).toISOString().slice(0, 10); // по Москве
const addMonths = (d, n) => { const x = new Date(d + "T12:00:00Z"); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10); };
function coupleDate(uid) { const p = getDoc("data/users/" + uid + "/profile"); const c = getDoc("cards/" + uid); return (p && p.date) || (c && c.date) || ""; }
function allRequests() { const out = []; for (const d of listCol("requests")) for (const r of itemsOf(d.data)) out.push({ ...r, coupleUid: d.id }); return out; }
function findRequest(id) { return allRequests().find(r => r.id === id) || null; }
function reqStatus(r) { if (r.status === "open" && r.deadlineAt && Date.now() > Date.parse(r.deadlineAt)) return "expired"; return r.status; }
function offersOfUid(uid) { return itemsOf(getDoc("offers/" + uid)); }
function vendorSeesRequest(r, ctx, myOfferReqIds) {
  if (!ctx.vendorIds.size) return false; const st = reqStatus(r);
  if (["draft", "pending_review", "rejected"].includes(st)) return false;
  if (myOfferReqIds && myOfferReqIds.has(r.id)) return true; // уже начатая сделка остаётся видна и после окончания PLUS
  if (r.mode === "direct") return ctx.plusIds.has(r.targetedVendorId);
  if ((r.invited || []).some(i => ctx.plusIds.has(i.vendorId))) return true;
  return r.mode === "tender" && st !== "paused" && ctx.plusCats.has(r.categoryId);
}
function sanitizeRequestForVendor(r) { const { favs, history, autoExpand, ...rest } = r;
  return { ...rest, invited: (r.invited || []).map(i => ({ vendorId: i.vendorId, vendorName: i.vendorName, sentAt: i.sentAt, reasons: i.reasons, wave: i.wave })), history: [] }; }
function availabilityOf(vendorId) { const a = getDoc("availability/" + vendorId); return a && a.enabled && planOf(vendorId).admitted && feat("calendar") ? a : null; }
const busyOn = (vendorId, date) => { const a = availabilityOf(vendorId); return !!(a && a.dates && a.dates[date] === "busy"); };

/* ---------- карточка подрядчика: что видит каждый ---------- */
function vendorView(id, data, ctx) {
  const own = ctx.isAdmin || ctx.ownVendorIds.has(id);
  if (!own && (data.visible === false || !isApproved(data))) return null;
  const ps = planOf(id), s = ps.sub; const rt = ratingOf(id);
  const out = { ...data, plan: ps.admitted ? "PLUS" : "FREE", rating: rt.avg, ratingCount: rt.count };
  // публично показываются только утверждённые организатором условия скидки и только у действующего PLUS
  delete out.discount; delete out.promo; delete out.offer;
  if (ps.discountOk) Object.assign(out, normTerms(s.terms));
  else Object.assign(out, { discount: { pct: 0, cond: "" }, promo: "", offer: { title: "", terms: "", until: "" } });
  if (own) {
    const draft = normTerms(data);
    out._draft = draft;
    out._plan = { plan: ps.plan, active: ps.active, admitted: ps.admitted, discountOk: ps.discountOk, expired: ps.expired, until: s ? s.endAt || "" : "", startAt: s ? s.startAt || "" : "", status: s ? s.status : "",
      participationVerified: !!(s && s.participationVerified), discountApproved: !!(s && s.discountApproved), source: s ? s.source || "" : "",
      termsStatus: termsEmpty(draft) ? "none" : (s && s.terms && sameTerms(s.terms, draft) && s.discountApproved) ? "approved" : "pending", termsNote: s ? s.termsNote || "" : "" };
  } else { delete out.owner; delete out.modNote; delete out.prevModNote; delete out.slugHistory; delete out.submittedAt; }
  return out;
}
function prepVendorWrite(data, prev, id) {
  // клиент присылает карточку целиком: если в ней публичные (утверждённые) условия без изменений — сохраняем черновик подрядчика
  if (data._draft) { const s = subsMap().get(id); const pubT = planOf(id).discountOk ? normTerms(s.terms) : normTerms(null); if (sameTerms(data, pubT)) Object.assign(data, normTerms(data._draft)); }
  for (const k of Object.keys(data)) if (k.startsWith("_")) delete data[k];
  delete data.plan; delete data.rating; delete data.ratingCount;
  if (data.name && (!prev || prev.name !== data.name || !prev.slug)) {
    let base = translit(data.name), slug = base, n = 2; const taken = new Set(listCol("vendors").filter(v => v.id !== id).flatMap(v => [v.data.slug, ...(v.data.slugHistory || [])]).filter(Boolean));
    while (taken.has(slug)) slug = base + "-" + n++;
    data.slug = slug; const hist = (prev && prev.slugHistory) || []; data.slugHistory = prev && prev.slug && prev.slug !== slug ? [...hist, prev.slug].slice(-10) : hist;
  } else if (prev) { data.slug = prev.slug; data.slugHistory = prev.slugHistory || []; }
}

/* ---------- реклама ---------- */
const SLOT_CODES = ["HOME_HERO", "HOME_FEATURED", "CAT_BANNER", "CAT_PINNED", "GLOBAL_STRIP", "WEEKLY_OFFER"];
const CAMP_ST = ["draft", "pending", "scheduled", "active", "paused", "completed", "rejected", "cancelled"];
function campaignLive(c) { const now = nowIso(); if (!["active", "scheduled"].includes(c.status)) return false; if (c.startAt && c.startAt > now) return false; if (c.endAt && c.endAt < now) return false;
  const slot = getDoc("adslots/" + c.slot); if (!slot || slot.enabled === false) return false;
  if (c.vendorId) { const v = getDoc("vendors/" + c.vendorId); if (!v || v.visible === false || !isApproved(v)) return false; }
  return true; }
function publicCampaign(id, c) { if (!feat("ads") || !campaignLive(c)) return null;
  const { slot, title, text, button, link, image, imageMobile, categories, startAt, endAt, weight, priority, exclusive, vendorId, advertiser, erid, alt } = c;
  return { id, slot, title, text, button, link, image, imageMobile, categories: categories || [], startAt, endAt, weight: weight || 1, priority: priority || 0, exclusive: !!exclusive, vendorId: vendorId || "", advertiser: advertiser || "", erid: erid || "", alt: alt || title || "", marker: settings().adMarker }; }
function safeLink(l) { if (!l) return true; if (/^#[a-z0-9\-~_]+$/i.test(l)) return true; if (/^\/[a-z0-9\-/]*$/i.test(l)) return true; return /^https:\/\/[^\s"'<>]+$/i.test(l); }
function validateCampaign(id, c, prev, ctx) {
  if (!SLOT_CODES.includes(c.slot)) return "bad_slot"; if (!CAMP_ST.includes(c.status)) return "bad_status";
  if (!safeLink(c.link)) return "bad_link"; if (c.vendorId && !getDoc("vendors/" + c.vendorId)) return "vendor_not_found";
  for (const k of ["title", "text", "button", "advertiser", "alt"]) if (c[k] != null && String(c[k]).length > 300) return "too_long:" + k;
  if (c.startAt && c.endAt && c.endAt < c.startAt) return "bad_period";
  if (c.exclusive && ["active", "scheduled", "pending"].includes(c.status)) {
    const clash = listCol("campaigns").find(d => d.id !== id && d.data.slot === c.slot && d.data.exclusive && ["active", "scheduled", "pending"].includes(d.data.status)
      && (!d.data.endAt || !c.startAt || d.data.endAt >= c.startAt) && (!c.endAt || !d.data.startAt || c.endAt >= d.data.startAt)
      && (!(d.data.categories || []).length || !(c.categories || []).length || d.data.categories.some(x => c.categories.includes(x))));
    if (clash) return "slot_conflict:" + (clash.data.title || clash.id); }
  if (!prev || prev.status !== c.status) c.history = [...((prev && prev.history) || []), { at: nowIso(), by: ctx.uid, status: c.status }];
  else c.history = prev.history || [];
  c.updatedAt = nowIso(); if (!c.createdAt) c.createdAt = (prev && prev.createdAt) || nowIso();
  return null; }

/* ---------- чтение: что видит пользователь ---------- */
function readFilter(segs, data, ctx) {
  const id = segs.at(-1), top = segs[0];
  if (top === "vendors" && segs.length === 2) return vendorView(id, data, ctx);
  if (ctx.isAdmin) return data;
  if (top === "settings") return data;
  if (top === "plans") return data.isPublic !== false && data.enabled !== false ? data : null;
  if (top === "adslots") return { code: data.code, name: data.name, enabled: data.enabled !== false, maxCards: data.maxCards, devices: data.devices, categories: data.categories || [] };
  if (top === "campaigns") return publicCampaign(id, data);
  if (top === "availability") { if (ctx.ownVendorIds.has(id)) return data;
    if (!availabilityOf(id)) return null; const from = today(), to = addMonths(from, settings().calendarMonths);
    const dates = {}; for (const [d, st] of Object.entries(data.dates || {})) if (d >= from && d <= to && ["free", "busy", "maybe"].includes(st)) dates[d] = st;
    return { enabled: true, dates, updatedAt: data.updatedAt }; }
  if (top === "reviews") { const mineV = ctx.ownVendorIds.has(data.vendorId);
    if (ctx.uid && data.coupleUid === ctx.uid) return data;
    if (data.status !== "published") return null;
    const { coupleUid, complaint, history, moderation, ...pub } = data; return mineV ? { ...pub, complaint } : pub; }
  if (top === "freedates") { if (id === ctx.uid) return data; if (!ctx.uid) return null;
    // свободная дата подрядчика видна только паре, у которой свадьба в этот день; дата «Занято» в календаре снимает акцию с показа
    const d = coupleDate(ctx.uid); if (!d || d < today()) return null;
    const its = itemsOf(data).filter(x => x.status === "active" && x.date === d && planOf(x.vendorId).admitted && !busyOn(x.vendorId, x.date)); return its.length ? { items: its } : null; }
  if (top === "data" && segs[1] === "users") return segs[2] === ctx.uid ? data : null;
  if (!ctx.uid) return null;
  if (top === "cards" || top === "complaints" || top === "favorites" || top === "sosresp") return id === ctx.uid ? data : null;
  if (top === "subs") return ctx.ownVendorIds.has(id) ? data : null;
  if (top === "applications") return data.applicantUid === ctx.uid ? data : null;
  if (top === "orders") return data.coupleUid === ctx.uid || ctx.ownVendorIds.has(data.vendorId) ? data : null;
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
const TEXT_LIMITS = { description: 2000, services: 600, comment: 600, body: 1000, reason: 600, requirements: 600 };
function tooLong(o) { for (const [k, n] of Object.entries(TEXT_LIMITS)) if (o && typeof o[k] === "string" && o[k].length > n) return k; return null; }
const ADMIN_API_ONLY = ["subs", "applications", "orders", "reviews", "sosresp", "sosmeta"];
function validateWrite(segs, data, prev, ctx) {
  const top = segs[0], id = segs.at(-1);
  if (!ctx.uid) return "auth";
  if (data !== null && (typeof data !== "object" || Array.isArray(data))) return "shape";
  if (JSON.stringify(data || {}).length > 256 * 1024) return "too_large";
  if (ctx.isAdmin) {
    if (ADMIN_API_ONLY.includes(top)) return "use_api";
    if (top === "vendors" && data) { prepVendorWrite(data, prev, id); if (!data.mod) data.mod = "approved"; }
    if (top === "campaigns" && data) return validateCampaign(id, data, prev, ctx);
    if (top === "adslots" && data && !SLOT_CODES.includes(id)) return "bad_slot";
    return null; }
  // разделение ролей: подрядчик ведёт карточку, отмечает карты и отвечает на заявки; пара оформляет карту и размещает заявки
  const need = { vendors: "vendor", offers: "vendor", redemptions: "vendor", freedates: "vendor", availability: "vendor", cards: "couple", requests: "couple", complaints: "couple", favorites: "couple" }[top];
  if (need && ctx.role !== need) return need === "vendor" ? "role_vendor_only" : "role_couple_only";
  if (top === "data" && segs[1] === "users") return segs[2] === ctx.uid && segs.length === 4 ? null : "forbidden";
  if (top === "vendors") { if (segs.length !== 2) return "forbidden";
    if (id !== ctx.uid && !(prev && prev.owner === ctx.uid)) return "forbidden";
    if (data) { prepVendorWrite(data, prev, id);
      // FREE не может создавать и менять публичную скидку, промокод и спецпредложение (ТЗ 2.6)
      const nt = normTerms(data); if (!termsEmpty(nt) && !sameTerms(nt, prev) && !planOf(id).admitted) return "plus_required";
      data.owner = ctx.uid; delete data.demo; if (prev && prev.visible === false) data.visible = false; else data.visible = true;
      // премодерация: новая или отклонённая карточка уходит организатору на проверку; одобренная обновляется сразу
      if (prev && isApproved(prev)) { data.mod = "approved"; if (prev.modAt) data.modAt = prev.modAt; delete data.modNote; }
      else { data.mod = "pending"; data.submittedAt = nowIso(); if (prev && prev.modAt) data.modAt = prev.modAt; if (prev && prev.modNote) data.prevModNote = prev.modNote; delete data.modNote; }
      if (data.avatar != null && typeof data.avatar !== "string") return "shape"; }
    return null; }
  if (top === "cards") { if (segs.length !== 2 || id !== ctx.uid) return "forbidden"; if (data) { delete data.blocked; } return null; }
  if (top === "blocks") return "forbidden";
  if (top === "complaints") return segs.length === 2 && id === ctx.uid ? null : "forbidden";
  if (top === "favorites") { if (segs.length !== 2 || id !== ctx.uid) return "forbidden"; if (!feat("favorites")) return "feature_off"; if (data === null) return null;
    const ids = Array.isArray(data.vendorIds) ? [...new Set(data.vendorIds.filter(x => typeof x === "string" && SEG.test(x)))] : null; if (!ids) return "shape"; if (ids.length > 300) return "too_large";
    data.vendorIds = ids; data.updatedAt = nowIso(); for (const k of Object.keys(data)) if (!["vendorIds", "updatedAt"].includes(k)) delete data[k]; return null; }
  if (top === "availability") { if (segs.length !== 2 || !ctx.ownVendorIds.has(id)) return "forbidden"; if (data === null) return "forbidden";
    if (!feat("calendar")) return "feature_off"; if (!planOf(id).admitted) return "plus_required";
    if (limited("av:" + ctx.uid, 200, 36e5)) return "rate_limit";
    const from = addMonths(today(), -1), to = addMonths(today(), settings().calendarMonths); const dates = {};
    for (const [d, st] of Object.entries(data.dates || {})) { if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d < from || d > to) continue; if (!["free", "busy", "maybe"].includes(st)) return "bad_status"; dates[d] = st; }
    if (Object.keys(dates).length > 800) return "too_large";
    data.enabled = !!data.enabled; data.dates = dates; data.updatedAt = nowIso(); data.version = ((prev && prev.version) || 0) + 1; for (const k of Object.keys(data)) if (!["enabled", "dates", "updatedAt", "version"].includes(k)) delete data[k];
    return null; }
  if (top === "freedates") { if (segs.length !== 2 || id !== ctx.uid) return "forbidden";
    if (data === null) return "forbidden";
    const prevById = new Map(itemsOf(prev).map(x => [x.id, x])), items = itemsOf(data);
    if (items.length > 30) return "too_large";
    const month = today().slice(0, 7); const log = ((prev && prev.log) || []).filter(d => String(d) >= new Date(Date.now() - 62 * 864e5).toISOString());
    for (const x of items) { const p = prevById.get(x.id);
      if (!x.id || !SEG.test(String(x.id))) return "bad_id";
      if (!["active", "closed"].includes(x.status)) return "shape";
      if (typeof x.text === "string" && x.text.length > 400) return "too_long:text";
      if (!(Number.isInteger(x.price) && x.price > 0 && x.price < 1e8)) return "price";
      if (x.oldPrice != null && x.oldPrice !== "" && !(Number.isInteger(x.oldPrice) && x.oldPrice > x.price)) return "old_price";
      const v = getDoc("vendors/" + x.vendorId) || {}; x.vendorName = v.name || ""; x.cat = v.cat || "";
      if (p) { x.date = p.date; x.createdAt = p.createdAt; if (JSON.stringify(p) !== JSON.stringify(x) && x.status === "active" && !ctx.plusIds.has(x.vendorId)) return "plus_required"; continue; }
      if (!ctx.vendorIds.has(x.vendorId)) return "vendor_not_approved";
      if (!ctx.plusIds.has(x.vendorId)) return "plus_required";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(x.date)) || x.date < today()) return "freedate_past";
      if (busyOn(x.vendorId, x.date)) return "freedate_busy";
      if (log.filter(d => d.slice(0, 7) === month).length >= 3) return "freedate_limit";
      x.createdAt = nowIso(); x.status = "active"; log.push(x.createdAt); }
    data.log = log; return null; }
  if (["redemptions", "requests", "offers", "messages"].includes(top)) { if (segs.length !== 2 || id !== ctx.uid) return "forbidden"; }
  else return "forbidden";
  if (data === null) return top === "requests" && itemsOf(prev).some(r => r.status !== "draft") ? "forbidden" : null;
  const prevById = new Map(itemsOf(prev).map(x => [x.id, x]));
  const items = itemsOf(data);
  const changed = items.filter(x => JSON.stringify(x) !== JSON.stringify(prevById.get(x.id)));
  for (const x of changed) { const tl = tooLong(x); if (tl) return "too_long:" + tl; }
  if (top === "redemptions") { for (const x of changed) { if (!ctx.vendorIds.has(x.vendorId)) return "not_your_vendor"; if (!planOf(x.vendorId).discountOk) return "plus_required"; } return null; }
  if (top === "requests") {
    const removed = itemsOf(prev).filter(p => !items.some(x => x.id === p.id));
    if (removed.some(p => p.status !== "draft")) return "cannot_delete_published";
    let submittedToday = items.filter(x => x.submittedAt && x.mode !== "sos" && Date.now() - Date.parse(x.submittedAt) < 864e5).length;
    for (const x of changed) { const p = prevById.get(x.id);
      if (!x.id || !SEG.test(x.id)) return "bad_id";
      const mode = x.mode || "tender"; if (!["tender", "broker", "direct", "sos"].includes(mode)) return "bad_mode";
      if (p && (p.mode || "tender") !== mode && !((p.mode === "broker") && mode === "tender")) return "mode_locked"; // адресный запрос нельзя превратить в тендер без новой заявки
      if (mode === "direct") { if (!feat("direct")) return "feature_off";
        if (p && p.targetedVendorId !== x.targetedVendorId) return "mode_locked";
        if (!p) { const tv = getDoc("vendors/" + x.targetedVendorId); if (!tv || tv.visible === false || !isApproved(tv) || !planOf(x.targetedVendorId).admitted) return "direct_not_allowed"; x.targetedVendorName = tv.name; x.categoryId = tv.cat; } }
      if (mode === "sos" && !p) { if (!feat("sos")) return "feature_off";
        const mine = items.filter(r => r.mode === "sos" && r.id !== x.id && r.submittedAt);
        if (mine.filter(r => Date.now() - Date.parse(r.submittedAt) < 864e5).length >= settings().sosPerDay) return "sos_limit";
        if (mine.filter(r => Date.now() - Date.parse(r.submittedAt) < 30 * 864e5).length >= settings().sosPerMonth) return "sos_limit"; }
      const newInv = (x.invited || []).filter(i => !(p && (p.invited || []).some(j => j.vendorId === i.vendorId)));
      for (const i of newInv) if (!planOf(i.vendorId).admitted) return "plus_required_vendor";
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
      if (p && p.sosEscalated !== x.sosEscalated) return "admin_only";
      if (to === "pending_review" && from !== "pending_review") {
        if (!x.categoryId || !x.eventDate || !x.city || !x.description) return "required_fields";
        if (mode === "sos" && !x.urgency) return "required_fields";
        if (BAD_TEXT.test(x.description || "") || BAD_TEXT.test((x.tags || []).join(" ")) || BAD_TEXT.test(x.reason || "") || BAD_TEXT.test(x.requirements || "")) return "contacts_in_text";
        if (mode !== "sos" && submittedToday > 3) return "rate_limit_requests"; }
      if (to === "selected") { const o = allOffersFlat().find(o => o.id === x.selectedOfferId && o.requestId === x.id); if (!o) return "offer_not_found"; }
      if (["rejected", "paused"].includes(to) && from !== to) return "admin_only"; }
    return null; }
  if (top === "offers") {
    for (const x of changed) { const p = prevById.get(x.id); const r = findRequest(x.requestId);
      if (!r) return "request_not_found"; if (!ctx.vendorIds.has(x.vendorId)) return "not_your_vendor";
      if (x.id !== x.vendorId + "~" + x.requestId) return "bad_id";
      x.coupleUid = r.coupleUid;
      const onlyWithdraw = p && x.status === "withdrawn";
      if (!onlyWithdraw) { if (!ctx.plusIds.has(x.vendorId)) return "plus_required";
        const mine = new Set(offersOfUid(ctx.uid).map(o => o.requestId));
        if (!vendorSeesRequest(r, ctx, mine)) return "request_hidden";
        if (reqStatus(r) !== "open") return "request_closed"; }
      if (!x.priceOnRequest && !(Number.isInteger(x.price) && x.price > 0)) return "price"; }
    return null; }
  if (top === "messages") {
    for (const x of changed) { const r = findRequest(x.requestId); if (!r) return "request_not_found";
      if (x.from === "couple") { if (r.coupleUid !== ctx.uid) return "forbidden"; }
      else if (x.from === "vendor") { if (!ctx.vendorIds.has(x.vendorId)) return "not_your_vendor";
        const started = offersOfUid(ctx.uid).some(o => o.requestId === r.id && o.vendorId === x.vendorId);
        if (!ctx.plusIds.has(x.vendorId) && !started) return "plus_required";
        if (reqStatus(r) !== "selected" && BAD_TEXT.test(x.body || "")) return "contacts_in_text"; }
      else return "bad_side"; }
    return null; }
  return "forbidden";
}
function allOffersFlat() { const out = []; for (const d of listCol("offers")) for (const o of itemsOf(d.data)) out.push(o); return out; }

/* ---------- после записи: заказы из выбранных откликов, SOS ---------- */
function afterWrite(segs, data, prev, ctx) {
  if (segs[0] !== "requests" || !data) return;
  const coupleUid = segs[1]; const prevById = new Map(itemsOf(prev).map(x => [x.id, x]));
  for (const x of itemsOf(data)) { const p = prevById.get(x.id);
    if (x.status === "selected" && x.selectedOfferId && (!p || p.status !== "selected" || p.selectedOfferId !== x.selectedOfferId)) orderFromSelection(coupleUid, x, ctx.uid);
    if (p && p.status === "selected" && x.status !== "selected") { const o = getDoc("orders/" + x.id); if (o && !["completed_verified"].includes(o.status)) setDoc("orders/" + x.id, { ...o, status: "cancelled", history: [...(o.history || []), { at: nowIso(), by: ctx.uid, type: "selection_cancelled" }] }, ctx.uid); }
    if (x.mode === "sos" && x.status === "pending_review" && (!p || p.status !== "pending_review")) sosAutoPublish(coupleUid, x.id); }
}
function orderFromSelection(coupleUid, r, by) {
  const o = allOffersFlat().find(o => o.id === r.selectedOfferId); if (!o) return;
  const ex = getDoc("orders/" + r.id); if (ex && ex.status === "completed_verified") return;
  setDoc("orders/" + r.id, { id: r.id, kind: r.mode === "sos" ? "sos" : r.mode === "direct" ? "direct" : "tender", coupleUid, vendorId: o.vendorId, vendorName: o.vendorName, cat: o.cat || r.categoryId, requestId: r.id, offerId: o.id,
    eventDate: r.eventDate, price: o.priceOnRequest ? null : o.price, status: "selected", confirm: {}, createdAt: nowIso(), history: [...((ex && ex.history) || []), { at: nowIso(), by, type: "selected" }] }, by);
}

/* ---------- Свадебный SOS: волны приглашений ---------- */
function sosCandidates(r, exclude, anyCity) { const out = [], excluded = [];
  for (const d of listCol("vendors")) { const v = d.data; if (exclude.has(d.id) || v.cat !== r.categoryId || v.visible === false || !isApproved(v) || !v.name) continue;
    if (!planOf(d.id).admitted) { excluded.push({ vendorId: d.id, vendorName: v.name, reason: "нет действующего «Партнёр +»" }); continue; }
    if (busyOn(d.id, r.eventDate)) { excluded.push({ vendorId: d.id, vendorName: v.name, reason: "дата занята в календаре" }); continue; }
    const cities = String(v.cities || "").split(/[,;]/).map(s => s.trim().toLowerCase()).filter(Boolean);
    const cityOk = !cities.length || cities.includes(String(r.city || "").toLowerCase());
    if (!anyCity && !cityOk) { excluded.push({ vendorId: d.id, vendorName: v.name, reason: "другой город (в следующей волне)" }); continue; }
    const av = availabilityOf(d.id); out.push({ vendorId: d.id, vendorName: v.name, reasons: [CATS[v.cat] || v.cat, cityOk ? "работает в г. " + r.city : "соседний город", av && av.dates && av.dates[r.eventDate] === "free" ? "дата свободна в календаре" : av ? "доступность уточняется" : "календарь не ведётся"] }); }
  return { out: out.slice(0, 15), excluded }; }
function sosWave(coupleUid, reqId, by) {
  const doc = getDoc("requests/" + coupleUid); if (!doc) return; const items = itemsOf(doc); const i = items.findIndex(x => x.id === reqId); if (i < 0) return;
  const r = items[i]; const wave = (r.waves || 0) + 1; const already = new Set((r.invited || []).map(x => x.vendorId));
  const { out, excluded } = sosCandidates(r, already, wave > 1);
  const inv = out.map(x => ({ ...x, sentAt: nowIso(), wave, delivery: "cabinet" }));
  items[i] = { ...r, invited: [...(r.invited || []), ...inv], waves: wave, lastWaveAt: nowIso(), history: [...(r.history || []), { at: nowIso(), actor: by || "system", type: "sos_wave", meta: { wave, count: inv.length } }] };
  setDoc("requests/" + coupleUid, { ...doc, items }, by || "system");
  const meta = getDoc("sosmeta/" + reqId) || { requestId: reqId, waves: [] }; meta.waves.push({ wave, at: nowIso(), invited: inv.map(x => x.vendorName), excluded }); setDoc("sosmeta/" + reqId, meta, "system");
  audit(by || "system", "sos_wave", reqId, { wave, count: inv.length });
}
function sosAutoPublish(coupleUid, reqId) {
  const doc = getDoc("requests/" + coupleUid); const items = itemsOf(doc); const i = items.findIndex(x => x.id === reqId); if (i < 0) return;
  const r = items[i]; const s = settings();
  const recentReject = items.some(x => x.status === "rejected" && x.updatedAt && Date.now() - Date.parse(x.updatedAt) < 30 * 864e5);
  if (!s.sosAutoPublish || recentReject) { audit("system", "sos_manual_review", reqId); return; }
  items[i] = { ...r, status: "open", publishedAt: nowIso(), deadlineAt: r.deadlineAt || new Date(Date.parse(r.eventDate + "T20:59:00Z")).toISOString(), history: [...(r.history || []), { at: nowIso(), actor: "system", type: "approved", meta: { auto: "sos" } }] };
  setDoc("requests/" + coupleUid, { ...doc, items }, "system"); sosWave(coupleUid, reqId, "system");
}
function sosTick() { try { resetCaches(); const s = settings(); if (!feat("sos")) return;
  for (const d of listCol("requests")) for (const r of itemsOf(d.data)) {
    if (r.mode !== "sos" || reqStatus(r) !== "open" || r.sosStopped) continue;
    const live = allOffersFlat().some(o => o.requestId === r.id && o.status !== "withdrawn"); if (live) continue;
    if (!r.lastWaveAt || Date.now() - Date.parse(r.lastWaveAt) < s.sosWaveMinutes * 6e4) continue;
    if ((r.waves || 0) < s.sosMaxWaves - 1) sosWave(d.id, r.id, "system");
    else if (!r.sosEscalated) { const doc = getDoc("requests/" + d.id); const items = itemsOf(doc).map(x => x.id === r.id ? { ...x, sosEscalated: true, escalatedAt: nowIso(), history: [...(x.history || []), { at: nowIso(), actor: "system", type: "sos_escalated" }] } : x);
      setDoc("requests/" + d.id, { ...doc, items }, "system"); audit("system", "sos_escalated", r.id); } } } catch (e) { console.error("sosTick", e); } }
setInterval(sosTick, 6e4).unref();

/* ---------- HTTP ---------- */
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8", ".woff2": "font/woff2", ".xml": "application/xml; charset=utf-8" };
function send(res, code, body, headers = {}) { const isObj = typeof body === "object" && !Buffer.isBuffer(body);
  res.writeHead(code, { "Content-Type": isObj ? "application/json; charset=utf-8" : "text/plain; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(isObj ? JSON.stringify(body) : body); }
const err = (res, code, c, msg) => send(res, code, { code: c, error: msg || c }, { "X-Robots-Tag": "noindex" });
function readBody(req, max) { return new Promise((ok, bad) => { const chunks = []; let n = 0;
  req.on("data", c => { n += c.length; if (n > max) { bad(new Error("too_large")); req.destroy(); } else chunks.push(c); });
  req.on("end", () => ok(Buffer.concat(chunks))); req.on("error", bad); }); }
async function readJson(req) { const b = await readBody(req, 600 * 1024); try { return JSON.parse(b.toString("utf8") || "{}"); } catch { return null; } }
const SEC_HEADERS = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "X-Frame-Options": "SAMEORIGIN", "Permissions-Policy": "camera=(), microphone=(), geolocation=()" };

let appHtml = null, appMtime = 0;
function appTemplate() { const f = path.join(PUB, "index.html"); const st = fs.statSync(f); if (!appHtml || st.mtimeMs !== appMtime) { appHtml = fs.readFileSync(f, "utf8"); appMtime = st.mtimeMs; } return appHtml; }
const seoDeps = () => ({ CATS, catSlug, listVendors: () => listCol("vendors").filter(d => d.data.name && d.data.visible !== false && isApproved(d.data)).map(d => vendorView(d.id, d.data, ctxFor(null))).filter(Boolean),
  vendorBySlug: slug => { const all = listCol("vendors"); const hit = all.find(d => d.data.slug === slug); if (hit) return { v: vendorView(hit.id, hit.data, ctxFor(null)), id: hit.id };
    const old = all.find(d => (d.data.slugHistory || []).includes(slug)); return old ? { moved: old.data.slug } : null; },
  publicUrl: PUBLIC_URL, seoOn: feat("seo"), settings: settings() });
function serveApp(req, res, urlPath) {
  resetCaches(); const r = seoRoute(urlPath, seoDeps());
  if (r.redirect) { res.writeHead(301, { Location: r.redirect, ...SEC_HEADERS }); return res.end(); }
  const html = injectSeo(appTemplate(), r, seoDeps());
  res.writeHead(r.status || 200, { "Content-Type": MIME[".html"], "Cache-Control": "no-cache", ...(r.noindex ? { "X-Robots-Tag": "noindex" } : {}), ...SEC_HEADERS });
  res.end(req.method === "HEAD" ? undefined : html); }
function serveStatic(req, res, urlPath) {
  let p; try { p = decodeURIComponent(urlPath); } catch { return err(res, 400, "bad_path"); }
  if (p === "/sitemap.xml") { resetCaches(); res.writeHead(200, { "Content-Type": MIME[".xml"], "Cache-Control": "public, max-age=3600" }); return res.end(sitemapXml(seoDeps())); }
  if (p === "/robots.txt") { res.writeHead(200, { "Content-Type": MIME[".txt"], "Cache-Control": "public, max-age=3600" }); return res.end(robotsTxt(PUBLIC_URL)); }
  if (p === "/" || p === "/index.html" || !path.extname(p)) return serveApp(req, res, p === "/index.html" ? "/" : p);
  const file = path.resolve(PUB, "." + p); if (!file.startsWith(PUB)) return err(res, 403, "forbidden");
  fs.stat(file, (e, st) => { if (e || !st.isFile()) return err(res, 404, "not_found");
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
const CONFLICT = new Set(["exists", "slot_conflict", "already_reviewed", "already_replied", "order_exists"]);
const errCode = e => CONFLICT.has(String(e).split(":")[0]) ? 409 : e === "auth" ? 401 : ["forbidden", "plus_required", "use_api", "role_vendor_only", "role_couple_only"].includes(e) ? 403 : 400;

/* ---------- статистика: события показов и кликов ---------- */
const EV_KINDS = ["view", "click", "page", "contact", "pin_view", "pin_click"];
function recordEvent(b, ip) {
  const kind = String(b.kind || ""); if (!EV_KINDS.includes(kind)) return "bad_kind";
  const sidRaw = String(b.sid || "").slice(0, 64); if (!/^[a-z0-9]{8,64}$/i.test(sidRaw)) return "bad_sid";
  const slot = SLOT_CODES.includes(b.slot) ? b.slot : "", campaign = typeof b.campaignId === "string" && SEG.test(b.campaignId) ? b.campaignId : "", vendor = typeof b.vendorId === "string" && SEG.test(b.vendorId) ? b.vendorId : "";
  if (campaign) { const c = getDoc("campaigns/" + campaign); if (!c || !campaignLive(c)) return "campaign_off"; }
  if (vendor && !getDoc("vendors/" + vendor)) return "vendor_not_found";
  const sid = crypto.createHash("sha256").update(EVENT_SALT + sidRaw).digest("hex").slice(0, 16); // без IP и персональных данных
  const page = String(b.page || "").replace(/[^a-z0-9\-/#~_]/gi, "").slice(0, 80);
  db.prepare("INSERT OR IGNORE INTO events(day,at,kind,slot,campaign,vendor,sid,page) VALUES(?,?,?,?,?,?,?,?)").run(today(), nowIso(), kind, slot, campaign, vendor, sid, page);
  return null; }
setInterval(() => db.prepare("DELETE FROM events WHERE day < ?").run(new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10)), 864e5).unref();
function statRows(where, args) { return db.prepare(`SELECT kind, slot, campaign, vendor, COUNT(*) n FROM events WHERE ${where} GROUP BY kind, slot, campaign, vendor`).all(...args); }

/* ---------- заявки на подключение ---------- */
const APP_ACTIVE = ["new", "in_work", "need_info"];
const APP_ST = ["new", "in_work", "need_info", "approved", "rejected", "closed", "cancelled_by_applicant"];
function nextAppNum() { const n = listCol("applications").length + 1; return "П-" + String(n).padStart(4, "0"); }

async function api(req, res, url) {
  resetCaches();
  const user = currentUser(req); const ctx = ctxFor(user); const m = req.method; const route = url.pathname;
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  if (m !== "GET" && req.headers["x-sd"] !== "1") return err(res, 403, "csrf", "Обновите страницу и повторите");
  if (m !== "GET" && route !== "/api/ev" && limited("w:" + (user ? user.id : ip), 120, 6e4)) return err(res, 429, "resource_exhausted", "Слишком много действий подряд. Подождите минуту.");

  if (route === "/api/me" && m === "GET") return send(res, 200, { user: user ? { id: user.id, email: user.email, isAdmin: user.isAdmin, role: user.role } : null });
  if (route === "/api/me/role" && m === "POST") { if (!user) return err(res, 401, "auth");
    const b = await readJson(req); const role = String(b && b.role || "");
    if (!ROLES.includes(role)) return err(res, 400, "invalid_argument", "Выберите роль");
    if (user.role) return err(res, 409, "exists", "Роль уже выбрана. Сменить её может организатор.");
    db.prepare("UPDATE users SET role=? WHERE id=?").run(role, user.id); audit(user.id, "role_set", role); return send(res, 200, { ok: true, role }); }
  if (route === "/api/auth/register" && m === "POST") {
    if (limited("reg:" + ip, 10, 36e5)) return err(res, 429, "resource_exhausted", "Слишком много регистраций с этого адреса. Попробуйте позже.");
    const b = await readJson(req); const email = String(b && b.email || "").trim().toLowerCase(); const pass = String(b && b.password || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) return err(res, 400, "invalid_argument", "Проверьте email");
    if (pass.length < 8 || pass.length > 200) return err(res, 400, "invalid_argument", "Пароль должен быть не короче 8 символов");
    if (!b.consent) return err(res, 400, "invalid_argument", "Нужно согласие на обработку персональных данных");
    const role = String(b.role || ""); if (!ROLES.includes(role)) return err(res, 400, "invalid_argument", "Выберите, кто вы: пара или подрядчик");
    if (db.prepare("SELECT 1 FROM users WHERE email=?").get(email)) return err(res, 409, "exists", "Такой email уже зарегистрирован. Войдите или попросите организатора сбросить пароль.");
    const id = uidNew(); db.prepare("INSERT INTO users(id,email,pass,created,consent,role) VALUES(?,?,?,?,?,?)").run(id, email, hashPass(pass), nowIso(), nowIso(), role);
    audit(id, "register", email, { role }); const t = newSession(id);
    return send(res, 200, { user: pubUser({ id, email, role }) }, { "Set-Cookie": cookieHeader(t, SESSION_DAYS * 86400) }); }
  if (route === "/api/auth/login" && m === "POST") {
    const b = await readJson(req); const email = String(b && b.email || "").trim().toLowerCase();
    if (limited("login:" + ip, 20, 9e5) || limited("login:" + email, 8, 9e5)) return err(res, 429, "resource_exhausted", "Слишком много попыток входа. Подождите 15 минут.");
    const u = db.prepare("SELECT * FROM users WHERE email=?").get(email);
    if (!u || u.disabled || !checkPass(String(b.password || ""), u.pass)) return err(res, 401, "auth", "Неверный email или пароль");
    const t = newSession(u.id); audit(u.id, "login", email);
    return send(res, 200, { user: pubUser({ ...u, role: u.role || inferRole(u.id) }) }, { "Set-Cookie": cookieHeader(t, SESSION_DAYS * 86400) }); }
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
    db.prepare("DELETE FROM docs WHERE path LIKE ? OR path=? OR path=? OR path=?").run("data/users/" + user.id + "/%", "cards/" + user.id, "complaints/" + user.id, "favorites/" + user.id);
    const reqs = getDoc("requests/" + user.id); if (reqs) setDoc("requests/" + user.id, { ...reqs, items: itemsOf(reqs).filter(r => r.status !== "draft").map(r => ({ ...r, status: ["open", "pending_review"].includes(r.status) ? "cancelled" : r.status, deletedAccount: true })) }, user.id);
    db.prepare("DELETE FROM sessions WHERE uid=?").run(user.id); db.prepare("UPDATE users SET disabled=1, email=?, pass='' WHERE id=?").run("deleted-" + user.id + "@deleted", user.id);
    audit(user.id, "account_deleted"); return send(res, 200, { ok: true }, { "Set-Cookie": cookieHeader("", 0) }); }

  if (route === "/api/doc") { const segs = parsePath(url.searchParams.get("path")); if (!segs || segs.length % 2) return err(res, 400, "invalid_argument", "Неверный путь");
    const p = segs.join("/"); const prev = getDoc(p);
    if (m === "GET") { if (segs[0] === "blocks" && ctx.uid && !ctx.isAdmin) return send(res, 200, { data: prev ? { num: prev.num } : null });
      return send(res, 200, { data: prev ? readFilter(segs, prev, ctx) : null }); }
    if (m === "PUT" || m === "DELETE") { const b = m === "PUT" ? await readJson(req) : { data: null }; if (!b) return err(res, 400, "invalid_argument");
      const data = m === "PUT" ? b.data : null;
      const e = tx(() => { const e = validateWrite(segs, data, getDoc(p), ctx); if (e) return e;
        if (data === null) delDoc(p); else setDoc(p, data, ctx.uid);
        afterWrite(segs, data, prev, ctx); return null; });
      if (e) return err(res, errCode(e), "invalid_argument", e);
      if (ctx.isAdmin && !(p.startsWith("data/users/" + ctx.uid))) audit(ctx.uid, m === "PUT" ? "admin_write" : "admin_delete", p);
      return send(res, 200, { ok: true }); }
    return err(res, 405, "method"); }
  if (route === "/api/col" && m === "GET") { const segs = parsePath(url.searchParams.get("path")); if (!segs || segs.length % 2 === 0) return err(res, 400, "invalid_argument", "Неверный путь");
    const col = segs.join("/");
    if (segs[0] === "cards" && !ctx.isAdmin) { // проверка карты по номеру: только участникам дисконтной программы
      let where = []; try { where = JSON.parse(url.searchParams.get("where") || "[]"); } catch {}
      const w = where.find(x => x[0] === "num" && (x[1] === "==" || x[1] === "eq")); if (!w || !ctx.uid) return send(res, 200, { docs: [] });
      if (![...ctx.plusIds].some(id => planOf(id).discountOk)) return err(res, 403, "invalid_argument", ctx.vendorIds.size ? "Проверка карт доступна участникам программы «Партнёр +» с утверждёнными условиями скидки" : ctx.ownVendorIds.size ? "Проверять карты можно после того, как организатор одобрит вашу карточку" : "Проверять карты могут партнёры с карточкой в каталоге");
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

  /* --- события показов и кликов (публично, без персональных данных) --- */
  if (route === "/api/ev" && m === "POST") {
    if (limited("ev:" + crypto.createHash("sha256").update(ip).digest("hex").slice(0, 12), 600, 6e5)) return send(res, 200, { ok: false });
    const b = await readJson(req) || {}; const e = recordEvent(b, ip); return send(res, 200, { ok: !e }); }

  const b = m === "GET" ? {} : (await readJson(req) || {});

  /* --- заявка на подключение к дисконтной системе (ТЗ 2.5) --- */
  if (route === "/api/apply" && m === "POST") { if (!user) return err(res, 401, "auth", "Войдите, чтобы отправить заявку");
    if (user.role !== "vendor" && !ctx.isAdmin) return err(res, 403, "role_vendor_only", "Подключение доступно подрядчикам");
    if (limited("apply:" + user.id, 5, 864e5)) return err(res, 429, "resource_exhausted", "Слишком много обращений за сутки");
    const mine = listCol("applications").map(d => d.data).filter(a => a.applicantUid === user.id);
    const kind = b.requestedPlan === "AD" ? "AD" : "PLUS";
    const active = mine.find(a => APP_ACTIVE.includes(a.status) && (a.requestedPlan || "PLUS") === kind);
    if (active) return send(res, 409, { code: "exists", error: "Заявка уже на рассмотрении", application: active });
    const email = String(b.contactEmail || "").trim().toLowerCase(), phone = String(b.contactPhone || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err(res, 400, "invalid_argument", "Проверьте email для связи");
    if (phone.replace(/\D/g, "").length < 10) return err(res, 400, "invalid_argument", "Укажите телефон для связи");
    if (!String(b.org || "").trim()) return err(res, 400, "invalid_argument", "Укажите название или контактное лицо");
    if (!b.consent) return err(res, 400, "invalid_argument", "Нужно согласие на обработку персональных данных");
    if (b.category && !CATS[b.category]) return err(res, 400, "invalid_argument", "Неизвестный раздел");
    const vendorId = [...ctx.ownVendorIds][0] || "";
    const a = { id: genId("app"), num: nextAppNum(), vendorId, applicantUid: user.id, org: String(b.org).trim().slice(0, 120), contactName: String(b.contactName || "").trim().slice(0, 120), category: b.category || "",
      contactEmail: email, contactPhone: phone.slice(0, 40), festivalStatus: ["yes", "planning", "no"].includes(b.festivalStatus) ? b.festivalStatus : "no", comment: String(b.comment || "").slice(0, 1000),
      requestedPlan: kind, sourcePlacement: String(b.sourcePlacement || "unknown").replace(/[^a-z0-9_\-]/gi, "").slice(0, 40), status: "new", submittedAt: nowIso(), reviewedBy: "", reviewedAt: "", noticeStatus: "cabinet",
      history: [{ at: nowIso(), by: user.id, status: "new" }] };
    setDoc("applications/" + a.id, a, user.id); audit(user.id, "application_new", a.id, { source: a.sourcePlacement, plan: kind }); return send(res, 200, { ok: true, application: a }); }
  if (route === "/api/apply/cancel" && m === "POST") { if (!user) return err(res, 401, "auth");
    const a = getDoc("applications/" + b.id); if (!a || a.applicantUid !== user.id) return err(res, 404, "not_found");
    if (!APP_ACTIVE.includes(a.status)) return err(res, 400, "invalid_argument", "Заявка уже рассмотрена");
    setDoc("applications/" + a.id, { ...a, status: "cancelled_by_applicant", history: [...a.history, { at: nowIso(), by: user.id, status: "cancelled_by_applicant" }] }, user.id); return send(res, 200, { ok: true }); }

  /* --- статистика подрядчика --- */
  if (route === "/api/my/stats" && m === "GET") { if (!user || !ctx.ownVendorIds.size) return err(res, 403, "forbidden");
    const vid = [...ctx.ownVendorIds][0]; const ps = planOf(vid); const d30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const cnt = (kind, since) => db.prepare(`SELECT COUNT(*) n FROM events WHERE vendor=? AND kind=?${since ? " AND day>=?" : ""}`).get(...[vid, kind, ...(since ? [since] : [])]).n;
    const out = { plan: ps.admitted ? "PLUS" : "FREE", pageViews30: cnt("page", d30), pageViewsAll: cnt("page") };
    if (ps.admitted) { out.contacts30 = cnt("contact", d30); out.pinViews30 = cnt("pin_view", d30); out.pinClicks30 = cnt("pin_click", d30);
      out.byMonth = db.prepare("SELECT substr(day,1,7) m, kind, COUNT(*) n FROM events WHERE vendor=? GROUP BY m, kind ORDER BY m DESC LIMIT 60").all(vid);
      out.campaigns = listCol("campaigns").filter(d => d.data.vendorId === vid).map(d => ({ id: d.id, title: d.data.title, slot: d.data.slot, status: d.data.status, startAt: d.data.startAt, endAt: d.data.endAt,
        views: db.prepare("SELECT COUNT(*) n FROM events WHERE campaign=? AND kind='view'").get(d.id).n, clicks: db.prepare("SELECT COUNT(*) n FROM events WHERE campaign=? AND kind='click'").get(d.id).n })); }
    return send(res, 200, out); }

  /* --- заказы и подтверждение выполнения (ТЗ 6.1) --- */
  if (route === "/api/orders/new" && m === "POST") { if (!user || user.role !== "couple") return err(res, 403, "role_couple_only");
    if (!feat("reviews")) return err(res, 400, "feature_off");
    const v = getDoc("vendors/" + b.vendorId); if (!v || !isApproved(v) || v.visible === false) return err(res, 404, "not_found", "Подрядчик не найден");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.eventDate || ""))) return err(res, 400, "invalid_argument", "Укажите дату оказания услуги");
    if (limited("ordnew:" + user.id, 10, 864e5)) return err(res, 429, "resource_exhausted", "Слишком много запросов за сутки");
    const ex = listCol("orders").find(d => d.data.coupleUid === user.id && d.data.vendorId === b.vendorId && !["cancelled", "declined"].includes(d.data.status));
    if (ex) return err(res, 409, "order_exists", "Заказ у этого подрядчика уже есть");
    const o = { id: genId("ord"), kind: "direct_deal", coupleUid: user.id, vendorId: b.vendorId, vendorName: v.name, cat: v.cat, eventDate: b.eventDate, note: String(b.note || "").slice(0, 400), status: "requested", confirm: {}, createdAt: nowIso(), history: [{ at: nowIso(), by: user.id, type: "requested" }] };
    setDoc("orders/" + o.id, o, user.id); audit(user.id, "order_request", o.id); return send(res, 200, { ok: true, order: o }); }
  if (route === "/api/orders/act" && m === "POST") { if (!user) return err(res, 401, "auth");
    const r = tx(() => { const o = getDoc("orders/" + b.id); if (!o) return ["not_found", 404];
      const side = o.coupleUid === user.id ? "couple" : ctx.ownVendorIds.has(o.vendorId) ? "vendor" : null; if (!side) return ["forbidden", 403];
      const act = b.action; const h = { at: nowIso(), by: user.id, side, type: act, note: String(b.note || "").slice(0, 400) };
      if (act === "accept" || act === "decline") { if (side !== "vendor" || o.status !== "requested") return ["bad_transition", 400]; o.status = act === "accept" ? "confirmed" : "declined"; }
      else if (act === "done") { if (!["selected", "confirmed"].includes(o.status)) return ["bad_transition", 400]; if (o.eventDate > today()) return ["too_early", 400];
        if (o.confirm[side]) return ["exists", 409]; o.confirm[side] = nowIso(); if (o.confirm.couple && o.confirm.vendor) { o.status = "completed_verified"; o.completedAt = nowIso(); } }
      else if (act === "dispute") { if (!["selected", "confirmed"].includes(o.status)) return ["bad_transition", 400]; o.status = "disputed"; }
      else if (act === "cancel") { if (side !== "couple" || !["requested"].includes(o.status)) return ["bad_transition", 400]; o.status = "cancelled"; }
      else return ["bad_action", 400];
      o.history = [...(o.history || []), h]; setDoc("orders/" + o.id, o, user.id); audit(user.id, "order_" + act, o.id); return [null, 200, o]; });
    if (r[0]) return err(res, r[1], r[0], { too_early: "Подтвердить выполнение можно после даты оказания услуги", bad_transition: "Действие недоступно для этого заказа", exists: "Вы уже подтвердили выполнение" }[r[0]]);
    return send(res, 200, { ok: true, order: r[2] }); }

  /* --- отзывы только по подтверждённым заказам (ТЗ 6) --- */
  if (route === "/api/reviews" && m === "POST") { if (!user || user.role !== "couple") return err(res, 403, "role_couple_only"); if (!feat("reviews")) return err(res, 400, "feature_off");
    const s = settings(); const o = getDoc("orders/" + b.orderId);
    if (!o || o.coupleUid !== user.id) return err(res, 404, "not_found", "Заказ не найден");
    if (o.status !== "completed_verified") return err(res, 400, "order_not_verified", "Отзыв можно оставить после того, как обе стороны подтвердят выполнение заказа");
    const rating = +b.rating; if (!Number.isInteger(rating) || rating < 1 || rating > 5) return err(res, 400, "invalid_argument", "Поставьте оценку от 1 до 5");
    const text = String(b.text || "").trim(); if (text.length < s.reviewMin || text.length > s.reviewMax) return err(res, 400, "invalid_argument", `Текст отзыва — от ${s.reviewMin} до ${s.reviewMax} символов`);
    if (BAD_TEXT.test(text)) return err(res, 400, "contacts_in_text", "Уберите из отзыва телефоны и ссылки");
    const photos = Array.isArray(b.photos) ? b.photos.filter(x => /^[a-f0-9]{32}$/.test(x)).slice(0, 3) : [];
    const ex = getDoc("reviews/" + o.id);
    if (ex && ex.status === "published" && !b.edit) return err(res, 409, "already_reviewed", "Отзыв по этому заказу уже есть");
    const rv = { id: o.id, orderId: o.id, coupleUid: user.id, vendorId: o.vendorId, vendorName: o.vendorName, cat: o.cat, eventMonth: String(o.eventDate).slice(0, 7), rating, text, photos, status: "pending",
      createdAt: ex ? ex.createdAt : nowIso(), updatedAt: nowIso(), reply: ex ? ex.reply : null, history: [...((ex && ex.history) || []), { at: nowIso(), by: user.id, type: ex ? "edited" : "created", rating }] };
    setDoc("reviews/" + o.id, rv, user.id); audit(user.id, ex ? "review_edit" : "review_new", o.id); return send(res, 200, { ok: true, review: rv }); }
  if (route === "/api/reviews/reply" && m === "POST") { const rv = getDoc("reviews/" + b.id); if (!rv || !ctx.ownVendorIds.has(rv.vendorId) || rv.status !== "published") return err(res, 404, "not_found");
    if (rv.reply) return err(res, 409, "already_replied", "Вы уже ответили на этот отзыв"); const text = String(b.text || "").trim(); if (text.length < 2 || text.length > 1000) return err(res, 400, "invalid_argument", "Ответ — до 1000 символов");
    setDoc("reviews/" + rv.id, { ...rv, reply: { text, at: nowIso() }, history: [...rv.history, { at: nowIso(), by: user.id, type: "reply" }] }, user.id); return send(res, 200, { ok: true }); }
  if (route === "/api/reviews/complain" && m === "POST") { const rv = getDoc("reviews/" + b.id); if (!rv || !ctx.ownVendorIds.has(rv.vendorId)) return err(res, 404, "not_found");
    setDoc("reviews/" + rv.id, { ...rv, complaint: { text: String(b.text || "").slice(0, 600), at: nowIso(), status: "open" }, history: [...rv.history, { at: nowIso(), by: user.id, type: "complaint" }] }, user.id); audit(user.id, "review_complaint", rv.id); return send(res, 200, { ok: true }); }

  /* --- SOS: ответы подрядчика --- */
  if (route === "/api/sos/respond" && m === "POST") { if (!user || user.role !== "vendor") return err(res, 403, "role_vendor_only");
    const r = findRequest(b.requestId); const vid = [...ctx.plusIds][0];
    if (!vid) return err(res, 403, "plus_required", "Срочные заявки доступны участникам «Партнёр +»");
    if (!r || r.mode !== "sos" || !(r.invited || []).some(i => i.vendorId === vid)) return err(res, 404, "not_found");
    const kind = b.kind; if (!["help", "clarify", "busy", "not_profile"].includes(kind)) return err(res, 400, "invalid_argument");
    const doc = getDoc("sosresp/" + user.id) || { items: [] }; doc.items = [...doc.items.filter(x => x.requestId !== r.id), { requestId: r.id, vendorId: vid, kind, at: nowIso() }].slice(-200); setDoc("sosresp/" + user.id, doc, user.id);
    if (kind === "busy" && feat("calendar")) { const a = getDoc("availability/" + vid) || { enabled: false, dates: {} }; a.dates = { ...(a.dates || {}), [r.eventDate]: "busy" }; a.updatedAt = nowIso(); a.version = (a.version || 0) + 1; setDoc("availability/" + vid, a, user.id); }
    audit(user.id, "sos_" + kind, r.id); return send(res, 200, { ok: true }); }

  /* --- организатор --- */
  if (route.startsWith("/api/admin/")) { if (!ctx.isAdmin) return err(res, 403, "forbidden");
    if (route === "/api/admin/users" && m === "GET") return send(res, 200, { users: db.prepare("SELECT id,email,created,disabled,role FROM users ORDER BY created DESC LIMIT 500").all().map(u => ({ ...u, role: u.role || (u.disabled ? null : inferRole(u.id)) })) });
    if (route === "/api/admin/cards" && m === "GET") { // реестр дисконтных карт
      const blocked = new Set(listCol("blocks").map(b => b.id));
      const uses = new Map(); for (const d of listCol("redemptions")) for (const x of itemsOf(d.data)) { const u = uses.get(x.card) || { n: 0, sum: 0, last: "", vendors: new Set() }; u.n++; u.sum += +x.amount || 0; if (String(x.at) > u.last) u.last = x.at; u.vendors.add(x.vendorName || x.vendorId); uses.set(x.card, u); }
      const cards = listCol("cards").map(d => { const p = getDoc("data/users/" + d.id + "/profile") || {}; const u = db.prepare("SELECT email,disabled FROM users WHERE id=?").get(d.id) || {}; const us = uses.get(d.data.num) || { n: 0, sum: 0, last: "", vendors: new Set() };
        return { uid: d.id, num: d.data.num, names: d.data.names || p.names || "", date: d.data.date || p.date || "", createdAt: d.data.createdAt || "", phone: p.phone || "", city: p.city || "", email: u.disabled ? "" : (u.email || ""), deleted: !!u.disabled,
          blocked: blocked.has(d.data.num), uses: us.n, sum: us.sum, lastUse: us.last, vendors: [...us.vendors] }; })
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      audit(ctx.uid, "cards_registry_view"); return send(res, 200, { cards }); }
    if (route === "/api/admin/stats" && m === "GET") { const from = url.searchParams.get("from") || "0000", to = url.searchParams.get("to") || "9999";
      const rows = statRows("day>=? AND day<=?", [from, to]);
      const camp = {}; const slots = {}; const vend = {};
      for (const r of rows) { if (r.campaign) { const c = camp[r.campaign] ||= { views: 0, clicks: 0 }; if (r.kind === "view") c.views += r.n; if (r.kind === "click") c.clicks += r.n; }
        if (r.slot) { const s = slots[r.slot] ||= { views: 0, clicks: 0 }; if (["view", "pin_view"].includes(r.kind)) s.views += r.n; if (["click", "pin_click"].includes(r.kind)) s.clicks += r.n; }
        if (r.vendor) { const v = vend[r.vendor] ||= { page: 0, contact: 0, pin_view: 0, pin_click: 0 }; if (v[r.kind] != null) v[r.kind] += r.n; } }
      const campaigns = listCol("campaigns").map(d => ({ id: d.id, title: d.data.title, slot: d.data.slot, status: d.data.status, advertiser: d.data.advertiser || "", ...(camp[d.id] || { views: 0, clicks: 0 }) }));
      const vendors = Object.entries(vend).map(([id, x]) => ({ id, name: (getDoc("vendors/" + id) || {}).name || id, ...x })).sort((a, b) => b.page - a.page).slice(0, 100);
      const apps = listCol("applications").map(d => d.data); const bySrc = {}; for (const a of apps) bySrc[a.sourcePlacement] = (bySrc[a.sourcePlacement] || 0) + 1;
      return send(res, 200, { from, to, campaigns, slots, vendors, applicationsBySource: bySrc }); }
    if (route === "/api/admin/journal" && m === "GET") { const lim = Math.min(1000, +url.searchParams.get("limit") || 300);
      const rows = db.prepare("SELECT a.at, a.uid, a.action, a.target, a.meta, u.email FROM audit a LEFT JOIN users u ON u.id=a.uid WHERE a.action NOT IN ('login','cards_registry_view') ORDER BY a.at DESC LIMIT ?").all(lim);
      return send(res, 200, { rows }); }
    if (route === "/api/admin/reset-password" && m === "POST") { const u = db.prepare("SELECT id FROM users WHERE email=?").get(String(b.email || "").trim().toLowerCase());
      if (!u) return err(res, 404, "not_found", "Пользователь с таким email не найден");
      const tmp = crypto.randomBytes(6).toString("base64url"); db.prepare("UPDATE users SET pass=? WHERE id=?").run(hashPass(tmp), u.id); db.prepare("DELETE FROM sessions WHERE uid=?").run(u.id);
      audit(ctx.uid, "reset_password", u.id); return send(res, 200, { password: tmp }); }
    if (route === "/api/admin/set-role" && m === "POST") { const u = db.prepare("SELECT id FROM users WHERE email=?").get(String(b.email || "").trim().toLowerCase());
      if (!u) return err(res, 404, "not_found", "Пользователь с таким email не найден");
      if (!ROLES.includes(b.role)) return err(res, 400, "invalid_argument", "Неизвестная роль");
      db.prepare("UPDATE users SET role=? WHERE id=?").run(b.role, u.id); audit(ctx.uid, "set_role", u.id, { role: b.role }); return send(res, 200, { ok: true }); }
    if (route === "/api/admin/assign-vendor" && m === "POST") { const u = db.prepare("SELECT id FROM users WHERE email=?").get(String(b.email || "").trim().toLowerCase());
      if (!u) return err(res, 404, "not_found", "Пользователь с таким email не найден");
      const v = getDoc("vendors/" + b.vendorId); if (!v) return err(res, 404, "not_found", "Карточка не найдена");
      if (getDoc("vendors/" + u.id) && b.vendorId !== u.id) return err(res, 409, "exists", "У этого пользователя уже есть своя карточка");
      const nv = { ...v, owner: u.id, updatedAt: nowIso() }; delete nv.demo;
      tx(() => { if (b.vendorId !== u.id) { setDoc("vendors/" + u.id, nv, ctx.uid); delDoc("vendors/" + b.vendorId);
        // ссылки на старый id в заявках, откликах, отметках, подписках, календаре и отзывах
        for (const col of ["requests", "offers", "messages", "redemptions", "freedates", "orders", "reviews", "campaigns", "applications", "favorites"]) for (const d of listCol(col)) { const s = JSON.stringify(d.data); if (s.includes(b.vendorId)) setDoc(col + "/" + d.id, JSON.parse(s.split('"' + b.vendorId).join('"' + u.id)), ctx.uid); }
        for (const col of ["subs", "availability"]) { const d = getDoc(col + "/" + b.vendorId); if (d) { setDoc(col + "/" + u.id, d, ctx.uid); delDoc(col + "/" + b.vendorId); } } }
      else setDoc("vendors/" + u.id, nv, ctx.uid);
      db.prepare("UPDATE users SET role='vendor' WHERE id=?").run(u.id); });
      audit(ctx.uid, "assign_vendor", b.vendorId, { to: u.id }); return send(res, 200, { ok: true, vendorId: u.id }); }
    if (route === "/api/admin/application" && m === "POST") { // смена статуса заявки на подключение
      const a = getDoc("applications/" + b.id); if (!a) return err(res, 404, "not_found");
      if (!APP_ST.includes(b.status)) return err(res, 400, "invalid_argument", "Неизвестный статус");
      if (["rejected", "need_info"].includes(b.status) && !String(b.comment || "").trim()) return err(res, 400, "invalid_argument", "Укажите комментарий для заявителя");
      const na = { ...a, status: b.status, reviewedBy: ctx.uid, reviewedAt: nowIso(), adminComment: String(b.comment || "").slice(0, 600),
        history: [...(a.history || []), { at: nowIso(), by: ctx.uid, status: b.status, comment: String(b.comment || "").slice(0, 600) }] };
      setDoc("applications/" + a.id, na, ctx.uid); audit(ctx.uid, "application_status", a.id, { status: b.status }); return send(res, 200, { ok: true, application: na }); }
    if (route === "/api/admin/plus" && m === "POST") { // выдать, продлить, приостановить, отозвать «Партнёр +» (только явным действием организатора)
      const v = getDoc("vendors/" + b.vendorId); if (!v) return err(res, 404, "not_found", "Карточка не найдена");
      const r = tx(() => { const prev = getDoc("subs/" + b.vendorId); const act = b.action; const by = ctx.uid; let s = prev ? { ...prev } : { vendorId: b.vendorId, planCode: "PLUS", changeHistory: [] };
        if (act === "grant" || act === "update") {
          if (!b.startAt || !b.endAt || b.endAt < b.startAt) return "Укажите начало и окончание срока";
          Object.assign(s, { planCode: "PLUS", status: "active", startAt: new Date(b.startAt + "T00:00:00+03:00").toISOString(), endAt: new Date(b.endAt + "T23:59:59+03:00").toISOString(),
            source: String(b.source || "manual").slice(0, 40), grantedBy: by, approvalId: b.applicationId || s.approvalId || "", participationVerified: !!b.participationVerified, note: String(b.note || "").slice(0, 400) });
          if (b.discountApproved) { s.discountApproved = true; s.terms = normTerms(v); s.termsApprovedAt = nowIso(); s.termsApprovedBy = by; s.termsNote = ""; }
          else if (b.discountApproved === false) s.discountApproved = false; }
        else if (act === "suspend") { if (!prev) return "Подписки нет"; s.status = "suspended"; }
        else if (act === "resume") { if (!prev) return "Подписки нет"; s.status = "active"; }
        else if (act === "revoke") { if (!prev) return "Подписки нет"; s.status = "revoked"; }
        else return "Неизвестное действие";
        s.changeHistory = [...(s.changeHistory || []), { at: nowIso(), by, action: act, startAt: s.startAt, endAt: s.endAt, participationVerified: s.participationVerified, discountApproved: !!s.discountApproved, note: String(b.note || "").slice(0, 400), applicationId: b.applicationId || "" }];
        s.updatedAt = nowIso(); setDoc("subs/" + b.vendorId, s, by);
        if (b.applicationId) { const a = getDoc("applications/" + b.applicationId); if (a && APP_ACTIVE.concat(["approved"]).includes(a.status)) setDoc("applications/" + a.id, { ...a, status: "approved", reviewedBy: by, reviewedAt: nowIso(), history: [...(a.history || []), { at: nowIso(), by, status: "approved", comment: "Активирован «Партнёр +»" }] }, by); }
        audit(by, "plus_" + act, b.vendorId, { startAt: s.startAt, endAt: s.endAt, participationVerified: s.participationVerified, discountApproved: !!s.discountApproved, applicationId: b.applicationId || "" }); return null; });
      if (r) return err(res, 400, "invalid_argument", r); return send(res, 200, { ok: true }); }
    if (route === "/api/admin/terms" && m === "POST") { // утверждение условий скидки и спецпредложения
      const v = getDoc("vendors/" + b.vendorId); const s = getDoc("subs/" + b.vendorId); if (!v || !s) return err(res, 404, "not_found", "Нет подписки «Партнёр +»");
      if (b.action === "approve") { setDoc("subs/" + b.vendorId, { ...s, discountApproved: true, terms: normTerms(v), termsApprovedAt: nowIso(), termsApprovedBy: ctx.uid, termsNote: "", changeHistory: [...(s.changeHistory || []), { at: nowIso(), by: ctx.uid, action: "terms_approved", terms: normTerms(v) }] }, ctx.uid); }
      else if (b.action === "reject") { if (!String(b.note || "").trim()) return err(res, 400, "invalid_argument", "Укажите, что исправить");
        setDoc("subs/" + b.vendorId, { ...s, termsNote: String(b.note).slice(0, 400), changeHistory: [...(s.changeHistory || []), { at: nowIso(), by: ctx.uid, action: "terms_rejected", note: String(b.note).slice(0, 400) }] }, ctx.uid); }
      else return err(res, 400, "invalid_argument");
      audit(ctx.uid, "terms_" + b.action, b.vendorId); return send(res, 200, { ok: true }); }
    if (route === "/api/admin/order" && m === "POST") { const o = getDoc("orders/" + b.id); if (!o) return err(res, 404, "not_found");
      if (!["completed_verified", "cancelled", "confirmed", "selected"].includes(b.status)) return err(res, 400, "invalid_argument");
      setDoc("orders/" + o.id, { ...o, status: b.status, completedAt: b.status === "completed_verified" ? nowIso() : o.completedAt, history: [...(o.history || []), { at: nowIso(), by: ctx.uid, side: "admin", type: "admin_" + b.status, note: String(b.note || "").slice(0, 400) }] }, ctx.uid);
      audit(ctx.uid, "order_admin", o.id, { status: b.status }); return send(res, 200, { ok: true }); }
    if (route === "/api/admin/review" && m === "POST") { const rv = getDoc("reviews/" + b.id); if (!rv) return err(res, 404, "not_found");
      const st = { publish: "published", hide: "hidden", reject: "rejected" }[b.action]; if (!st) return err(res, 400, "invalid_argument");
      if (st !== "published" && !String(b.reason || "").trim()) return err(res, 400, "invalid_argument", "Укажите причину");
      const nrv = { ...rv, status: st, moderation: { at: nowIso(), by: ctx.uid, reason: String(b.reason || "").slice(0, 400) }, publishedAt: st === "published" ? (rv.publishedAt || nowIso()) : rv.publishedAt,
        complaint: rv.complaint && b.closeComplaint ? { ...rv.complaint, status: "closed" } : rv.complaint, history: [...(rv.history || []), { at: nowIso(), by: ctx.uid, type: "admin_" + st, reason: String(b.reason || "") }] };
      setDoc("reviews/" + rv.id, nrv, ctx.uid); audit(ctx.uid, "review_" + st, rv.id); return send(res, 200, { ok: true }); }
    if (route === "/api/admin/sos" && m === "POST") { const r = findRequest(b.requestId); if (!r || r.mode !== "sos") return err(res, 404, "not_found");
      const doc = getDoc("requests/" + r.coupleUid); const upd = patch => setDoc("requests/" + r.coupleUid, { ...doc, items: itemsOf(doc).map(x => x.id === r.id ? { ...x, ...patch, history: [...(x.history || []), { at: nowIso(), actor: ctx.uid, type: "sos_" + b.action }] } : x) }, ctx.uid);
      if (b.action === "stop") upd({ sosStopped: true });
      else if (b.action === "resume") upd({ sosStopped: false });
      else if (b.action === "wave") sosWave(r.coupleUid, r.id, ctx.uid);
      else if (b.action === "invite") { const v = getDoc("vendors/" + b.vendorId); if (!v) return err(res, 404, "not_found");
        if (!planOf(b.vendorId).admitted) return err(res, 400, "invalid_argument", "К SOS допускаются только одобренные участники «Партнёр +»");
        if ((r.invited || []).some(i => i.vendorId === b.vendorId)) return err(res, 409, "exists", "Подрядчик уже приглашён");
        upd({ invited: [...(r.invited || []), { vendorId: b.vendorId, vendorName: v.name, sentAt: nowIso(), reasons: ["приглашён организатором"], wave: 0, delivery: "cabinet" }] }); }
      else return err(res, 400, "invalid_argument");
      audit(ctx.uid, "sos_admin_" + b.action, r.id); return send(res, 200, { ok: true }); }
    if (route === "/api/admin/sosmeta" && m === "GET") return send(res, 200, { meta: getDoc("sosmeta/" + url.searchParams.get("id")) });
    return err(res, 404, "not_found"); }
  return err(res, 404, "not_found");
}

/* ---------- первичное наполнение и миграции ---------- */
function seed() { const f = path.resolve(HERE, "..", "seed", "seed.json"); if (!fs.existsSync(f)) return;
  if (db.prepare("SELECT COUNT(*) n FROM docs WHERE col='vendors'").get().n) return;
  const s = JSON.parse(fs.readFileSync(f, "utf8"));
  for (const [p, data] of Object.entries(s.docs || {})) setDoc(p, data, "seed");
  for (const up of s.uploads || []) { const src = path.resolve(HERE, "..", "seed", up.file); if (fs.existsSync(src)) { fs.copyFileSync(src, path.join(UPL, up.id)); db.prepare("INSERT OR IGNORE INTO uploads VALUES(?,?,?,?,?)").run(up.id, "seed", up.type, fs.statSync(src).size, nowIso()); } }
  console.log("seeded", Object.keys(s.docs || {}).length, "docs"); }
const SLOT_DEFAULTS = {
  HOME_HERO: { name: "Широкий баннер после первого экрана", maxCards: 1, devices: ["desktop", "mobile"] },
  HOME_FEATURED: { name: "Подборка партнёров на главной", maxCards: 3, devices: ["desktop", "mobile"] },
  CAT_BANNER: { name: "Баннер категории", maxCards: 1, devices: ["desktop", "mobile"] },
  CAT_PINNED: { name: "«В центре внимания» в категории", maxCards: 3, devices: ["desktop", "mobile"] },
  GLOBAL_STRIP: { name: "Компактный сквозной промоблок", maxCards: 1, devices: ["desktop", "mobile"] },
  WEEKLY_OFFER: { name: "Предложение недели", maxCards: 1, devices: ["desktop", "mobile"] } };
const MIGRATIONS = [
  ["2026-10-29-plus-ads-v2", () => {
    if (!getDoc("settings/main")) setDoc("settings/main", { ...DEFAULT_SETTINGS }, "migration");
    if (!getDoc("plans/FREE")) setDoc("plans/FREE", { code: "FREE", name: "Бесплатное размещение", priceRub: 0, billingPeriod: "", isPublic: true, enabled: true, createdAt: nowIso(), updatedAt: nowIso(),
      features: ["Карточка в каталоге и поиске", "Фото, описание, контакты", "Отзывы по подтверждённым заказам", "Базовая статистика просмотров"] }, "migration");
    if (!getDoc("plans/PLUS")) setDoc("plans/PLUS", { code: "PLUS", name: "Партнёр +", priceRub: null, billingPeriod: "", isPublic: true, enabled: true, createdAt: nowIso(), updatedAt: nowIso(),
      features: ["Скидка и спецпредложение по карте #СказалаДа! после утверждения", "Тендеры, свадебный брокер и отклики", "Адресные запросы из карточки", "Свадебный SOS по вашему разделу", "Календарь свободных и занятых дат", "Свободные даты со специальной ценой", "Участие в блоке «В центре внимания» по правилам ротации", "Расширенная статистика"] }, "migration");
    for (const [code, d] of Object.entries(SLOT_DEFAULTS)) if (!getDoc("adslots/" + code)) setDoc("adslots/" + code, { code, ...d, categories: [], enabled: true, createdAt: nowIso() }, "migration");
    // текущим одобренным партнёрам — пробный «Партнёр +» до конца фестиваля (решение владельца портала 29.10.2026)
    const end = new Date(DEFAULT_SETTINGS.trialEnd + "T23:59:59+03:00").toISOString();
    for (const d of listCol("vendors")) { const v = d.data; if (!isApproved(v) || getDoc("subs/" + d.id)) continue;
      setDoc("subs/" + d.id, { vendorId: d.id, planCode: "PLUS", status: "active", startAt: nowIso(), endAt: end, source: "trial_migration", grantedBy: "system", approvalId: "", participationVerified: true, discountApproved: true,
        terms: normTerms(v), termsApprovedAt: nowIso(), termsApprovedBy: "system", note: "Пробный период для действующих партнёров до окончания фестиваля 2027", updatedAt: nowIso(),
        changeHistory: [{ at: nowIso(), by: "system", action: "grant", note: "Миграция v2: пробный «Партнёр +»" }] }, "migration"); }
    for (const d of listCol("vendors")) { const v = { ...d.data }; if (v.slug) continue; prepVendorWrite(v, null, d.id); setDoc("vendors/" + d.id, v, "migration"); }
  }],
];
function migrate() {
  const done = new Set(db.prepare("SELECT id FROM migrations").all().map(r => r.id)); const todo = MIGRATIONS.filter(([id]) => !done.has(id)); if (!todo.length) return;
  const dir = path.join(DATA, "backups"); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "portal-before-" + todo[0][0] + "-" + Date.now() + ".db");
  if (db.prepare("SELECT COUNT(*) n FROM docs").get().n) db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`); // резервная копия перед изменением схемы данных
  for (const [id, fn] of todo) { tx(() => { resetCaches(); fn(); db.prepare("INSERT INTO migrations VALUES(?,?,?)").run(id, nowIso(), fs.existsSync(file) ? path.basename(file) : ""); }); console.log("migration", id, "done"); }
  resetCaches(); }
seed(); migrate();
setInterval(() => db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now()), 36e5).unref();

http.createServer(async (req, res) => {
  try { const url = new URL(req.url, "http://x");
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    if (url.pathname.startsWith("/_blob/")) return serveUpload(res, url.pathname.slice(7));
    if (req.method !== "GET" && req.method !== "HEAD") return err(res, 405, "method");
    return serveStatic(req, res, url.pathname);
  } catch (e) { console.error(e); if (!res.headersSent) err(res, 500, "unavailable", "Ошибка сервера. Повторите позже."); }
}).listen(PORT, HOST, () => console.log(`#СказалаДа! portal on http://${HOST}:${PORT}`));
