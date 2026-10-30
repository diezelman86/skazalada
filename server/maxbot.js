// Бот #СказалаДа! в мессенджере MAX: выпуск карты свадебных скидок, привязка к аккаунту сайта,
// каталог по разделам, уведомления. Общая база с сайтом. Токен хранится на сервере (таблица secrets), в репозиторий не попадает.
import crypto from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const qrcode = require("../public/assets/qrcode.js");

export function initMaxBot(d) {
  const { db, getDoc, setDoc, listCol, nowIso, audit, PUBLIC_URL, CATS, catSlug } = d;
  db.exec(`CREATE TABLE IF NOT EXISTS secrets(k TEXT PRIMARY KEY, v TEXT NOT NULL, updated TEXT);
  CREATE TABLE IF NOT EXISTS max_links(max_user TEXT PRIMARY KEY, uid TEXT, chat_id TEXT, name TEXT, notify INTEGER DEFAULT 1, state TEXT, created TEXT, updated TEXT);
  CREATE INDEX IF NOT EXISTS max_links_uid ON max_links(uid);
  CREATE TABLE IF NOT EXISTS max_codes(code TEXT PRIMARY KEY, uid TEXT NOT NULL, expires INTEGER NOT NULL);`);
  const API = (process.env.MAX_API || "https://platform-api.max.ru").replace(/\/$/, "");
  const sec = k => (db.prepare("SELECT v FROM secrets WHERE k=?").get(k) || {}).v || "";
  const setSec = (k, v) => v ? db.prepare("INSERT INTO secrets VALUES(?,?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated=excluded.updated").run(k, v, nowIso()) : db.prepare("DELETE FROM secrets WHERE k=?").run(k);
  const token = () => process.env.MAX_BOT_TOKEN || sec("max_token");
  const site = PUBLIC_URL;
  const esc = s => String(s ?? "");

  async function call(method, path, body, query) {
    const t = token(); if (!t) throw new Error("no_token");
    const q = query ? "?" + new URLSearchParams(query).toString() : "";
    const r = await fetch(API + path + q, { method, headers: { Authorization: t, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
    const j = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error(j.message || j.code || ("http_" + r.status)); e.status = r.status; e.body = j; throw e; } return j; }
  const kb = rows => ({ type: "inline_keyboard", payload: { buttons: rows } });
  const cb = (text, payload) => ({ type: "callback", text, payload });
  const link = (text, url) => ({ type: "link", text, url });
  const MENU = () => kb([[cb("💳 Оформить карту", "card")], [cb("🪪 Моя карта", "mycard")], [cb("📂 Подрядчики по разделам", "cats")], [link("🌐 Открыть портал", site + "/?source=max")], [cb("🔗 Привязать аккаунт сайта", "link"), cb("🔔 Уведомления", "notify")]]);
  async function send(userId, text, attachments) {
    for (let i = 0; i < 4; i++) { try { return await call("POST", "/messages", { text, attachments: attachments || [] }, { user_id: userId }); }
      catch (e) { if (String(e.message).includes("not.ready") || (e.body && String(e.body.code).includes("not.ready"))) { await new Promise(r => setTimeout(r, 700 * (i + 1))); continue; } throw e; } } }
  async function answer(callbackId, notification) { try { await call("POST", "/answers", notification ? { notification } : {}, { callback_id: callbackId }); } catch (_) {} }
  async function uploadImage(buf, mime) {
    const u = await call("POST", "/uploads", null, { type: "image" });
    const fd = new FormData(); fd.append("data", new Blob([buf], { type: mime }), "card.gif");
    const r = await fetch(u.url, { method: "POST", headers: { Authorization: token() }, body: fd, signal: AbortSignal.timeout(30000) }); const j = await r.json().catch(() => ({}));
    if (j.token) return { token: j.token }; if (j.photos) return { photos: j.photos }; if (u.token) return { token: u.token }; return j; }

  /* --- пользователи --- */
  const linkOf = mu => db.prepare("SELECT * FROM max_links WHERE max_user=?").get(String(mu));
  const saveLink = (mu, patch) => { const cur = linkOf(mu) || { max_user: String(mu), notify: 1, created: nowIso() }; const n = { ...cur, ...patch, updated: nowIso() };
    db.prepare("INSERT INTO max_links(max_user,uid,chat_id,name,notify,state,created,updated) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(max_user) DO UPDATE SET uid=excluded.uid, chat_id=excluded.chat_id, name=excluded.name, notify=excluded.notify, state=excluded.state, updated=excluded.updated")
      .run(n.max_user, n.uid || null, n.chat_id || null, n.name || null, n.notify ? 1 : 0, n.state || null, n.created, n.updated); return n; };
  const stateOf = l => { try { return JSON.parse(l && l.state || "{}"); } catch { return {}; } };
  const profileOf = uid => getDoc("data/users/" + uid + "/profile") || {};
  function newCardNum() { const taken = new Set(listCol("cards").map(x => x.data.num)); let n; do { const r = () => String(crypto.randomInt(1000, 10000)); n = "SD-" + r() + "-" + r(); } while (taken.has(n)); return n; }
  function botAccount(mu, name) { // аккаунт пары, созданный через MAX (без пароля; вход на сайт — после привязки к аккаунту с email)
    const email = "max-" + mu + "@max.bot"; const ex = db.prepare("SELECT id FROM users WHERE email=?").get(email); if (ex) return ex.id;
    const id = "u_" + crypto.randomBytes(12).toString("base64url").replace(/[^A-Za-z0-9]/g, "x");
    db.prepare("INSERT INTO users(id,email,pass,created,consent,role) VALUES(?,?,?,?,?,?)").run(id, email, "", nowIso(), nowIso(), "couple"); audit(id, "register_max", email, { name }); return id; }
  const checkUrl = num => site + "/#check-" + num;
  function qrGif(num) { const q = qrcode(0, "M"); q.addData(checkUrl(num)); q.make(); const u = q.createDataURL(10, 4); return Buffer.from(u.split(",")[1], "base64"); }
  async function sendCard(mu, uid) {
    const p = profileOf(uid); if (!p.card) return send(mu, "Карта ещё не оформлена.", [kb([[cb("💳 Оформить карту", "card")]])]);
    const blocked = !!getDoc("blocks/" + p.card);
    const text = `Карта свадебных скидок #СказалаДа!\n\n№ ${p.card}\n${p.names || ""}${p.date ? " · свадьба " + new Date(p.date).toLocaleDateString("ru-RU") : ""}${blocked ? "\n\n⚠️ Карта заблокирована организатором." : ""}\n\nПокажите QR-код подрядчику или назовите номер карты. Скидки партнёров — в каталоге.`;
    let att = []; try { const img = await uploadImage(qrGif(p.card), "image/gif"); att.push({ type: "image", payload: img }); } catch (e) { console.error("max upload", e.message); }
    att.push(kb([[link("Каталог со скидками", site + "/?source=max")], [cb("В меню", "menu")]]));
    return send(mu, text, att); }

  /* --- диалог --- */
  const parseDate = s => { const m = String(s).trim().match(/^(\d{1,2})[.\-/ ](\d{1,2})[.\-/ ](\d{2,4})$/); if (!m) return null; let y = +m[3]; if (y < 100) y += 2000;
    const d = new Date(Date.UTC(y, +m[2] - 1, +m[1])); if (d.getUTCDate() !== +m[1]) return null; return d.toISOString().slice(0, 10); };
  async function onText(mu, text, user, attachments) {
    const l = linkOf(mu) || saveLink(mu, { name: user && (user.first_name || user.name) }); const st = stateOf(l); const t = String(text || "").trim();
    const contact = (attachments || []).find(a => a.type === "contact"); if (contact && st.step === "phone") { const vcf = (contact.payload && contact.payload.vcf_info) || ""; const m = vcf.match(/TEL[^:]*:([+\d\s\-()]+)/i); return onPhone(mu, l, st, m ? m[1].trim() : ""); }
    if (/^\/?(start|старт|начать|меню|menu)$/i.test(t)) return greet(mu, user);
    if (st.step === "names") { if (t.length < 2 || t.length > 80) return send(mu, "Напишите имена пары, например: Анна и Илья");
      saveLink(mu, { state: JSON.stringify({ step: "date", names: t }) }); return send(mu, "Дата свадьбы? Напишите в формате ДД.ММ.ГГГГ, например 12.06.2027.", [kb([[cb("Ещё не знаем", "skipdate")]])]); }
    if (st.step === "date") { const d = parseDate(t); if (!d) return send(mu, "Не понял дату. Напишите так: 12.06.2027", [kb([[cb("Ещё не знаем", "skipdate")]])]);
      if (d < new Date().toISOString().slice(0, 10)) return send(mu, "Эта дата уже прошла. Проверьте год.");
      return askPhone(mu, { ...st, date: d }); }
    if (st.step === "phone") return onPhone(mu, l, st, t);
    if (st.step === "code") { const c = t.replace(/\D/g, ""); return linkByCode(mu, c, user); }
    return send(mu, "Выберите, что сделать:", [MENU()]); }
  async function askPhone(mu, st) { saveLink(mu, { state: JSON.stringify({ ...st, step: "phone" }) });
    return send(mu, "Телефон для связи (необязательно, не публикуется). Нажмите кнопку или напишите номер.", [kb([[{ type: "request_contact", text: "📱 Отправить мой номер" }], [cb("Пропустить", "skipphone")]])]); }
  async function onPhone(mu, l, st, phone) { if (phone && phone.replace(/\D/g, "").length < 10) return send(mu, "Номер выглядит неполным. Напишите его целиком или нажмите «Пропустить».", [kb([[cb("Пропустить", "skipphone")]])]);
    saveLink(mu, { state: JSON.stringify({ ...st, step: "consent", phone: phone || "" }) });
    return send(mu, `Проверьте данные:\n${st.names}${st.date ? "\nСвадьба: " + new Date(st.date).toLocaleDateString("ru-RU") : ""}${phone ? "\nТелефон: " + phone : ""}\n\nНажимая «Согласен, оформить», вы соглашаетесь на обработку персональных данных по политике конфиденциальности портала.`,
      [kb([[cb("✅ Согласен, оформить", "consent")], [link("Политика конфиденциальности", site + "/privacy/")], [cb("Начать заново", "card_new")]])]); }
  async function createCard(mu, user) { const l = linkOf(mu); const st = stateOf(l); if (st.step !== "consent" || !st.names) return send(mu, "Начнём заново.", [kb([[cb("💳 Оформить карту", "card_new")]])]);
    let uid = l.uid; if (!uid) uid = botAccount(mu, st.names);
    const p = profileOf(uid); if (p.card) { saveLink(mu, { uid, state: null }); return sendCard(mu, uid); }
    const num = newCardNum(), at = nowIso();
    setDoc("data/users/" + uid + "/profile", { ...p, role: "couple", names: st.names, date: st.date || "", phone: st.phone || p.phone || "", card: num, cardAt: at, source: p.source || "max" }, uid);
    setDoc("cards/" + uid, { num, names: st.names, date: st.date || "", createdAt: at, source: "max" }, uid);
    saveLink(mu, { uid, state: null, chat_id: l.chat_id }); audit(uid, "card_max", num);
    await send(mu, "Готово! Карта оформлена 🎉"); return sendCard(mu, uid); }
  function mergeInto(fromUid, toUid) { // карта из аккаунта MAX переносится в аккаунт сайта, если там карты нет
    if (!fromUid || fromUid === toUid) return; const from = db.prepare("SELECT email FROM users WHERE id=?").get(fromUid); if (!from || !String(from.email).endsWith("@max.bot")) return;
    const fp = profileOf(fromUid), tp = profileOf(toUid); const fc = getDoc("cards/" + fromUid);
    if (fp.card && !tp.card) { setDoc("data/users/" + toUid + "/profile", { ...tp, names: tp.names || fp.names, date: tp.date || fp.date, phone: tp.phone || fp.phone, card: fp.card, cardAt: fp.cardAt }, toUid); if (fc) setDoc("cards/" + toUid, fc, toUid); }
    db.prepare("DELETE FROM docs WHERE path=? OR path=?").run("cards/" + fromUid, "data/users/" + fromUid + "/profile");
    db.prepare("UPDATE users SET disabled=1 WHERE id=?").run(fromUid); audit(toUid, "max_merge", fromUid); }
  async function linkByCode(mu, code, user) { const row = db.prepare("SELECT * FROM max_codes WHERE code=?").get(code);
    if (!row || row.expires < Date.now()) { saveLink(mu, { state: JSON.stringify({ step: "code" }) }); return send(mu, "Код не подошёл или устарел. Получите новый в личном кабинете на сайте: «Моя свадьба» → «Подключить MAX».", [kb([[link("Открыть кабинет", site + "/#cabinet")], [cb("В меню", "menu")]])]); }
    db.prepare("DELETE FROM max_codes WHERE code=?").run(code); const l = linkOf(mu) || {}; mergeInto(l.uid, row.uid);
    const other = db.prepare("SELECT max_user FROM max_links WHERE uid=? AND max_user<>?").get(row.uid, String(mu)); if (other) db.prepare("UPDATE max_links SET uid=NULL WHERE max_user=?").run(other.max_user);
    saveLink(mu, { uid: row.uid, state: null, name: user && user.first_name }); audit(row.uid, "max_linked", String(mu));
    const p = profileOf(row.uid); await send(mu, "Аккаунт сайта привязан ✅ Уведомления портала будут приходить сюда.");
    return p.card ? sendCard(mu, row.uid) : send(mu, "Карта в аккаунте пока не оформлена.", [MENU()]); }
  async function greet(mu, user) { saveLink(mu, { name: user && user.first_name, state: null });
    return send(mu, `Здравствуйте${user && user.first_name ? ", " + user.first_name : ""}! Я бот портала #СказалаДа! 💍\n\nПомогу оформить карту свадебных скидок и покажу подрядчиков со скидками по ней. Свадебный фестиваль #СказалаДа!2027 — 21 февраля, ресторан «Ренессанс».`, [MENU()]); }
  async function onCallback(mu, payload, user, callbackId) {
    await answer(callbackId); const l = linkOf(mu) || saveLink(mu, { name: user && user.first_name });
    if (payload === "menu") return send(mu, "Выберите, что сделать:", [MENU()]);
    if (payload === "card" || payload === "mycard") { if (l.uid && profileOf(l.uid).card) return sendCard(mu, l.uid);
      if (payload === "mycard") return send(mu, "Карта ещё не оформлена. Оформить сейчас?", [kb([[cb("💳 Оформить карту", "card_new")], [cb("🔗 У меня есть аккаунт на сайте", "link")]])]);
      return startCard(mu); }
    if (payload === "card_new") return startCard(mu);
    if (payload === "skipdate") return askPhone(mu, { ...stateOf(l), date: "" });
    if (payload === "skipphone") return onPhone(mu, l, stateOf(l), "");
    if (payload === "consent") return createCard(mu, user);
    if (payload === "link") { saveLink(mu, { state: JSON.stringify({ step: "code" }) }); return send(mu, "Чтобы привязать аккаунт сайта, откройте личный кабинет → «Моя свадьба» → «Подключить MAX» и пришлите сюда 6-значный код. Или нажмите там кнопку «Открыть в MAX» — привяжется сам.", [kb([[link("Открыть кабинет", site + "/#cabinet")], [cb("В меню", "menu")]])]); }
    if (payload === "notify") { const on = !l.notify; saveLink(mu, { notify: on ? 1 : 0 }); return send(mu, on ? "🔔 Уведомления включены: предложения подрядчиков, свободные даты в день свадьбы, новости портала." : "🔕 Уведомления выключены.", [MENU()]); }
    if (payload === "cats") { const rows = []; const ids = Object.keys(CATS); for (let i = 0; i < ids.length; i += 2) rows.push(ids.slice(i, i + 2).map(id => cb(CATS[id], "cat:" + id))); rows.push([cb("В меню", "menu")]);
      return send(mu, "Выберите раздел:", [kb(rows)]); }
    if (payload.startsWith("cat:")) { const id = payload.slice(4); const vs = d.publicVendors().filter(v => v.cat === id).sort((a, b) => (b.discount.pct || 0) - (a.discount.pct || 0)).slice(0, 8);
      if (!vs.length) return send(mu, `В разделе «${CATS[id] || id}» пока нет партнёров.`, [kb([[cb("Другие разделы", "cats")]])]);
      return send(mu, `${CATS[id]}:\n\n` + vs.map(v => `• ${v.name}${v.discount.pct ? ` — −${v.discount.pct}% по карте` : ""}${v.offer && v.offer.title ? `\n   ✦ ${v.offer.title}` : ""}`).join("\n"),
        [kb([...vs.slice(0, 5).map(v => [link(v.name.slice(0, 40), site + "/partners/" + v.slug + "/")]), [link("Весь раздел на сайте", site + "/catalog/" + catSlug(id) + "/")], [cb("Другие разделы", "cats")]])]); }
    return send(mu, "Выберите, что сделать:", [MENU()]); }
  async function startCard(mu) { const l = linkOf(mu); if (l && l.uid && profileOf(l.uid).card) return sendCard(mu, l.uid);
    saveLink(mu, { state: JSON.stringify({ step: "names" }) }); return send(mu, "Оформим карту — это бесплатно и займёт минуту.\n\nКак зовут пару? Например: Анна и Илья"); }

  const queues = new Map(); // события одного пользователя обрабатываем строго по очереди
  function onUpdate(u) { const who = String((u.user && u.user.user_id) || (u.message && u.message.sender && u.message.sender.user_id) || (u.callback && u.callback.user && u.callback.user.user_id) || "?");
    const prev = queues.get(who) || Promise.resolve(); const next = prev.then(() => handleUpdate(u)).catch(() => {}); queues.set(who, next);
    next.then(() => { if (queues.get(who) === next) queues.delete(who); }); return next; }
  async function handleUpdate(u) {
    try {
      if (u.update_type === "bot_started") { const mu = u.user && u.user.user_id; if (!mu) return; saveLink(mu, { chat_id: u.chat_id, name: u.user.first_name });
        if (u.payload && /^link_\d{6}$/.test(u.payload)) return linkByCode(mu, u.payload.slice(5), u.user); return greet(mu, u.user); }
      if (u.update_type === "message_created") { const m = u.message || {}; const s = m.sender || {}; if (!s.user_id || s.is_bot) return; if (m.recipient && m.recipient.chat_type && m.recipient.chat_type !== "dialog") return;
        if (m.recipient && m.recipient.chat_id) saveLink(s.user_id, { chat_id: m.recipient.chat_id });
        return onText(s.user_id, m.body && m.body.text, s, m.body && m.body.attachments); }
      if (u.update_type === "message_callback") { const c = u.callback || u; const usr = c.user || u.user || {}; if (!usr.user_id) return; return onCallback(usr.user_id, String(c.payload || ""), usr, c.callback_id); }
    } catch (e) { console.error("max update", e.message); }
  }

  /* --- уведомления из портала --- */
  const sentRecent = new Map();
  async function notify(uid, text, url) { try { if (!token() || !uid) return; const rows = db.prepare("SELECT max_user FROM max_links WHERE uid=? AND notify=1").all(uid);
    for (const r of rows) { const k = r.max_user + "|" + text; if (sentRecent.has(k) && Date.now() - sentRecent.get(k) < 6e5) continue; sentRecent.set(k, Date.now());
      await send(r.max_user, text, [kb([[link("Открыть", url || site + "/#cabinet")]])]).catch(e => console.error("max notify", e.message)); } } catch (e) { console.error("max notify", e.message); } }
  setInterval(() => { const now = Date.now(); for (const [k, t] of sentRecent) if (now - t > 6e5) sentRecent.delete(k); db.prepare("DELETE FROM max_codes WHERE expires<?").run(now); }, 6e5).unref();

  /* --- подключение: вебхук на боевом сервере, опрос — при разработке --- */
  let polling = false, marker = null;
  async function poll() { if (polling) return; polling = true;
    while (polling && token()) { try { const j = await call("GET", "/updates", null, { timeout: 25, limit: 50, ...(marker ? { marker } : {}) }); if (j.marker) marker = j.marker; for (const u of j.updates || []) await onUpdate(u); }
      catch (e) { if (String(e.message) === "no_token") break; await new Promise(r => setTimeout(r, 3000)); } } polling = false; }
  const useWebhook = () => /^https:\/\//.test(site) && !/127\.0\.0\.1|localhost/.test(site) && process.env.MAX_POLLING !== "1";
  async function connect() { if (!token()) return { ok: false };
    const me = await call("GET", "/me");
    if (useWebhook()) { let s = sec("max_secret"); if (!s) { s = crypto.randomBytes(24).toString("hex"); setSec("max_secret", s); }
      const subs = await call("GET", "/subscriptions"); for (const x of subs.subscriptions || []) if (x.url !== site + "/api/max/webhook") await call("DELETE", "/subscriptions", null, { url: x.url }).catch(() => {});
      await call("POST", "/subscriptions", { url: site + "/api/max/webhook", update_types: ["message_created", "message_callback", "bot_started"], secret: s }); }
    else poll();
    return { ok: true, me }; }
  async function status() { const t = token(); if (!t) return { connected: false };
    try { const me = await call("GET", "/me"); const subs = await call("GET", "/subscriptions").catch(() => ({})); const n = db.prepare("SELECT COUNT(*) n FROM max_links").get().n, linked = db.prepare("SELECT COUNT(*) n FROM max_links WHERE uid IS NOT NULL").get().n;
      return { connected: true, username: me.username, name: me.first_name, link: "https://max.ru/" + me.username, mode: useWebhook() ? "webhook" : "polling", webhook: (subs.subscriptions || []).map(x => x.url), users: n, linked, tokenTail: t.slice(-4), fromEnv: !!process.env.MAX_BOT_TOKEN }; }
    catch (e) { return { connected: false, error: e.message, tokenTail: t.slice(-4) }; } }
  async function setToken(t) { const old = sec("max_token"); setSec("max_token", t);
    try { const r = await connect(); audit("system", "max_token_set", r.me && r.me.username); return r; } catch (e) { setSec("max_token", old); throw e; } }
  async function disconnect() { try { const subs = await call("GET", "/subscriptions"); for (const x of subs.subscriptions || []) await call("DELETE", "/subscriptions", null, { url: x.url }); } catch (_) {} polling = false; setSec("max_token", ""); setSec("max_secret", ""); }
  function linkCode(uid) { db.prepare("DELETE FROM max_codes WHERE uid=?").run(uid); let c; do { c = String(crypto.randomInt(100000, 1000000)); } while (db.prepare("SELECT 1 FROM max_codes WHERE code=?").get(c));
    db.prepare("INSERT INTO max_codes VALUES(?,?,?)").run(c, uid, Date.now() + 15 * 6e4); return c; }
  async function myStatus(uid) { const rows = db.prepare("SELECT max_user, name, notify, updated FROM max_links WHERE uid=?").all(uid); let username = sec("max_username");
    if (!username && token()) { try { username = (await call("GET", "/me")).username; setSec("max_username", username); } catch (_) {} }
    return { available: !!token(), linked: rows.length > 0, notify: rows.some(r => r.notify), bot: username ? "https://max.ru/" + username : "" }; }
  function unlink(uid) { db.prepare("UPDATE max_links SET uid=NULL WHERE uid=?").run(uid); }
  function checkSecret(req) { const s = sec("max_secret"); const h = String(req.headers["x-max-bot-api-secret"] || ""); return !!s && h.length === s.length && crypto.timingSafeEqual(Buffer.from(h), Buffer.from(s)); }
  if (token()) setTimeout(() => connect().catch(e => console.error("max connect", e.message)), 1500);
  return { onUpdate, notify, status, setToken, disconnect, linkCode, myStatus, unlink, checkSecret };
}
