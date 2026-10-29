// SEO-страницы портала (ТЗ v2.1, раздел 10): человекочитаемые адреса, серверный заголовок и контент,
// canonical, Open Graph, JSON-LD, sitemap.xml и robots.txt. Приватные разделы закрыты от индексации.
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const cut = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s; };
const SITE = "#СказалаДа!";
const OG_DEFAULT = "/assets/festival-2027-poster.png";

const STATIC = {
  "/": { sd: "catalog", title: "Свадебный портал #СказалаДа! — подрядчики со скидкой по карте", desc: "Каталог свадебных специалистов: площадки, фотографы, ведущие, декор и ещё 14 разделов. Скидки по карте #СказалаДа!, свадебный брокер и тендеры, Свадебный фестиваль 21 февраля 2027." },
  "/broker/": { sd: "broker", title: "Свадебный брокер и тендеры — #СказалаДа!", desc: "Опишите задачу — подрядчики пришлют предложения сами. Бесплатно для пар: тендер, адресный подбор, сравнение предложений и переписка." },
  "/festival/": { sd: "festival", title: "Свадебный фестиваль #СказалаДа!2027 — 21 февраля, ресторан «Ренессанс»", desc: "Свадебный фестиваль #СказалаДа! 21 февраля 2027 года в 14:30, ресторан «Ренессанс». Подрядчики, мастер-классы и подарки для пар." },
  "/free-dates/": { sd: "free-dates", title: "Свободные даты подрядчиков со специальной ценой — #СказалаДа!", desc: "Подрядчики портала предлагают освободившиеся даты со специальной ценой. Укажите дату свадьбы в кабинете — и мы покажем предложения на ваш день." },
  "/cooperation/": { sd: "cooperation", title: "Сотрудничество: станьте партнёром #СказалаДа!", desc: "Разместите карточку бесплатно или подключитесь к дисконтной системе #СказалаДа!: заявки пар, тендеры, свадебный SOS, календарь занятости и продвижение в каталоге." },
  "/card/": { sd: "card", title: "Карта свадебных скидок #СказалаДа!", desc: "Бесплатная виртуальная карта для пар: скидки и спецпредложения у партнёров портала по QR-коду." },
  "/notebook/": { sd: "notebook", title: "Блокнот невесты #СказалаДа!", desc: "Блокнот невесты — планер подготовки к свадьбе от бренда «Эксперт Блокнот»." },
  "/privacy/": { sd: "privacy", title: "Политика конфиденциальности — #СказалаДа!", desc: "Как портал #СказалаДа! обрабатывает и хранит персональные данные." },
};
const PRIVATE = { "/cabinet/": "cabinet" };

export function seoRoute(p, deps) {
  p = p.replace(/\/{2,}/g, "/");
  if (!p.endsWith("/") && !/\.[a-z0-9]+$/i.test(p)) return { redirect: p + "/" };
  if (p === "/catalog/") return { redirect: "/" };
  if (p === "/partners/") return { redirect: "/cooperation/" };
  if (PRIVATE[p]) return { sd: PRIVATE[p], title: "Личный кабинет — " + SITE, desc: "", noindex: true, canonical: p };
  const vs = deps.listVendors();
  if (STATIC[p]) { const s = STATIC[p]; const r = { ...s, canonical: p, jsonld: [] };
    if (p === "/") { r.ssr = `<h1>Свадебный портал ${SITE}</h1><p>${esc(s.desc)}</p><h2>Разделы каталога</h2><ul>${Object.keys(deps.CATS).filter(c => vs.some(v => v.cat === c)).map(c => `<li><a href="/catalog/${deps.catSlug(c)}/">${esc(deps.CATS[c])}</a></li>`).join("")}</ul>`
        + `<h2>Партнёры</h2><ul>${vs.slice(0, 50).map(v => `<li><a href="/partners/${esc(v.slug)}/">${esc(v.name)}</a> — ${esc(deps.CATS[v.cat] || "")}</li>`).join("")}</ul>`;
      r.jsonld.push({ "@context": "https://schema.org", "@type": "Organization", name: SITE, url: deps.publicUrl + "/", logo: deps.publicUrl + "/assets/logo-1200.png", sameAs: ["https://vk.ru/club109353383"] }); }
    else if (p === "/cooperation/") { const st = deps.settings; const faq = [
        ["Чем бесплатное размещение отличается от «Партнёр +»?", "Бесплатная карточка доступна в каталоге и поиске. «Партнёр +» открывает скидку и спецпредложение по карте после утверждения, тендеры и брокер, адресные запросы, свадебный SOS, календарь занятости и продвижение по правилам тарифа."],
        ["Как подать заявку?", "Нажмите «Подключиться к дисконтной системе #СказалаДа!», заполните короткую форму. Организатор свяжется с вами после рассмотрения. Отправка заявки — это обращение, а не оплата."],
        ["Сколько стоит «Партнёр +»?", st.plusPriceText || "Условия уточняет организатор."],
        ["Как проверяются скидки?", "Пара показывает QR-код карты, вы проверяете его в кабинете и отмечаете применённую скидку. Условия скидки утверждает организатор."],
        ["Можно ли отменить участие?", "Да. По окончании срока доступ становится бесплатным, карточка и история сделок сохраняются."]];
      r.ssr = `<h1>Станьте партнёром ${SITE}</h1><p>${esc(s.desc)}</p>${faq.map(([q, a]) => `<h2>${esc(q)}</h2><p>${esc(a)}</p>`).join("")}`;
      r.jsonld.push({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) }); }
    else r.ssr = `<h1>${esc(s.title)}</h1><p>${esc(s.desc)}</p>`;
    return r; }
  let m = p.match(/^\/catalog\/([a-z0-9-]+)\/$/);
  if (m) { const id = Object.keys(deps.CATS).find(c => deps.catSlug(c) === m[1]); if (!id) return { status: 404, sd: "catalog", noindex: true, title: "Раздел не найден — " + SITE, desc: "" };
    const name = deps.CATS[id], list = vs.filter(v => v.cat === id);
    return { sd: "cat-" + id, canonical: p, noindex: !list.length, title: `${name} на свадьбу — каталог ${SITE}`, desc: cut(`${name}: ${list.length ? list.length + " партнёров портала" : "партнёры скоро появятся"}, скидки по карте #СказалаДа! и спецпредложения. Сравните предложения и разместите заявку бесплатно.`, 200),
      ssr: `<nav><a href="/">Каталог</a> / ${esc(name)}</nav><h1>${esc(name)}</h1><ul>${list.map(v => `<li><a href="/partners/${esc(v.slug)}/">${esc(v.name)}</a>${v.short ? " — " + esc(v.short) : ""}</li>`).join("")}</ul>`,
      jsonld: [{ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Каталог", item: deps.publicUrl + "/" }, { "@type": "ListItem", position: 2, name, item: deps.publicUrl + p }] }] }; }
  m = p.match(/^\/partners\/([a-z0-9-]+)\/$/);
  if (m) { const hit = deps.vendorBySlug(m[1]);
    if (hit && hit.moved) return { redirect: "/partners/" + hit.moved + "/" };
    if (!hit || !hit.v) return { status: 404, sd: "catalog", noindex: true, title: "Карточка недоступна — " + SITE, desc: "", ssr: "<h1>Карточка недоступна</h1><p>Партнёр скрыт или удалён. <a href=\"/\">Перейти в каталог</a></p>" };
    const v = hit.v, cat = deps.CATS[v.cat] || "", c = v.contacts || {};
    const img = v.avatar || (v.photos || [])[0]; const imgUrl = img ? (String(img).startsWith("assets/") ? "/" + img : "/_blob/" + img) : OG_DEFAULT;
    const ld = { "@context": "https://schema.org", "@type": "LocalBusiness", name: v.name, description: cut(v.about || v.short, 300), url: deps.publicUrl + p, image: deps.publicUrl + imgUrl };
    if (c.addr) ld.address = c.addr; if (c.phone) ld.telephone = c.phone;
    if (v.ratingCount > 0) ld.aggregateRating = { "@type": "AggregateRating", ratingValue: v.rating, reviewCount: v.ratingCount, bestRating: 5, worstRating: 1 }; // только при проверенных отзывах
    return { sd: "p-" + hit.id, canonical: p, title: `${v.name} — ${cat} | ${SITE}`, desc: cut(v.short || v.about || `${cat}: партнёр портала ${SITE}.`, 180) + (v.discount && v.discount.pct ? ` Скидка −${v.discount.pct}% по карте.` : ""), ogImage: imgUrl,
      ssr: `<nav><a href="/">Каталог</a> / <a href="/catalog/${deps.catSlug(v.cat)}/">${esc(cat)}</a></nav><h1>${esc(v.name)}</h1>${v.short ? `<p>${esc(v.short)}</p>` : ""}${v.about ? `<p>${esc(v.about)}</p>` : ""}${v.price ? `<p>${esc(v.price)}</p>` : ""}${v.discount && v.discount.pct ? `<p>Скидка по карте #СказалаДа!: −${v.discount.pct}% ${esc(v.discount.cond)}</p>` : ""}${v.ratingCount ? `<p>Рейтинг ${v.rating} из 5 по ${v.ratingCount} подтверждённым отзывам</p>` : ""}`,
      jsonld: [ld, { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Каталог", item: deps.publicUrl + "/" }, { "@type": "ListItem", position: 2, name: cat, item: deps.publicUrl + "/catalog/" + deps.catSlug(v.cat) + "/" }, { "@type": "ListItem", position: 3, name: v.name, item: deps.publicUrl + p }] }] }; }
  return { status: 404, sd: "catalog", noindex: true, title: "Страница не найдена — " + SITE, desc: "", ssr: "<h1>Страница не найдена</h1><p><a href=\"/\">Перейти в каталог</a></p>" };
}

export function injectSeo(html, r, deps) {
  const url = deps.publicUrl + (r.canonical || "/");
  const og = deps.publicUrl + (r.ogImage || OG_DEFAULT);
  const head = `<title>${esc(r.title || "Портал " + SITE)}</title>
<meta name="description" content="${esc(r.desc || "")}">
${r.noindex || !deps.seoOn ? '<meta name="robots" content="noindex,nofollow">' : `<link rel="canonical" href="${esc(url)}">`}
<meta property="og:type" content="website"><meta property="og:site_name" content="${esc(SITE)}"><meta property="og:title" content="${esc(r.title || SITE)}"><meta property="og:description" content="${esc(r.desc || "")}"><meta property="og:url" content="${esc(url)}"><meta property="og:image" content="${esc(og)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(r.title || SITE)}"><meta name="twitter:description" content="${esc(r.desc || "")}"><meta name="twitter:image" content="${esc(og)}">
${(r.jsonld || []).map(j => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, "\\u003c")}</script>`).join("\n")}
<script>window.SD_ROUTE=${JSON.stringify(r.sd || "")};window.SD_STATUS=${r.status || 200};document.documentElement.classList.add("js")</script><style>.js #ssr{display:none!important}</style>`;
  let out = html.replace(/<title>[^<]*<\/title>/g, "").replace("</head>", head + "\n</head>");
  const ssr = `<div id="ssr" class="wrap sec">${r.ssr || `<h1>${esc(r.title || SITE)}</h1><p>${esc(r.desc || "")}</p>`}</div>`;
  out = out.replace("<body>", "<body>\n" + ssr);
  return out;
}

export function sitemapXml(deps) {
  const vs = deps.listVendors(); const u = deps.publicUrl;
  const urls = ["/", "/cooperation/", "/broker/", "/festival/", "/free-dates/", "/card/", "/notebook/"].map(p => ({ loc: u + p }));
  for (const c of Object.keys(deps.CATS)) if (vs.some(v => v.cat === c)) urls.push({ loc: u + "/catalog/" + deps.catSlug(c) + "/" });
  for (const v of vs) if (v.slug) urls.push({ loc: u + "/partners/" + v.slug + "/", lastmod: (v.updatedAt || "").slice(0, 10) });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(x => `<url><loc>${esc(x.loc)}</loc>${x.lastmod ? `<lastmod>${x.lastmod}</lastmod>` : ""}</url>`).join("\n")}\n</urlset>\n`;
}
export function robotsTxt(publicUrl) {
  return `User-agent: *\nDisallow: /api/\nDisallow: /cabinet/\nAllow: /\n\nSitemap: ${publicUrl}/sitemap.xml\n`;
}
