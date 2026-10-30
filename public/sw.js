/* #СказалаДа! — сервис-воркер приложения: быстрый запуск, офлайн-страница и карта с QR без интернета.
   Личные данные (/api/) не кэшируются. */
const V = "sd-v1";
const CORE = ["/offline.html", "/assets/icon-192.png", "/assets/logo-600.png", "/assets/qrcode.js", "/manifest.webmanifest"];
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const r = e.request; if (r.method !== "GET") return;
  const u = new URL(r.url); if (u.origin !== location.origin) return;
  if (u.pathname.startsWith("/api/")) return;                       // данные — только из сети
  if (r.mode === "navigate") {                                       // страницы: сеть, при её отсутствии — кэш или офлайн-страница
    e.respondWith(fetch(r).then(res => { if (res.ok) { const c = res.clone(); caches.open(V).then(x => x.put(r, c)); } return res; })
      .catch(() => caches.match(r).then(m => m || caches.match("/offline.html")))); return; }
  if (u.pathname.startsWith("/_blob/") || u.pathname.startsWith("/assets/")) { // фото и оформление: кэш, обновляем в фоне
    e.respondWith(caches.open(V).then(c => c.match(r).then(m => { const net = fetch(r).then(res => { if (res.ok) c.put(r, res.clone()); return res; }).catch(() => m);
      return m || net; }))); }
});
