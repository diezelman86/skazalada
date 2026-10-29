/* =====================================================================================
   #СказалаДа! v2 (ТЗ «Реклама, Партнёр + и Сотрудничество» v2.1):
   FREE / «Партнёр +», замки, страница «Сотрудничество», заявки на подключение, реклама и
   «В центре внимания», избранное, адресный запрос, календарь занятости, SOS, заказы и отзывы,
   панель организатора, человекочитаемые адреса. Права проверяет сервер; здесь — интерфейс.
   ===================================================================================== */
var PLUS_READY=false;
var PX={settings:{features:{},pinnedMobile:2,pinnedDesktop:3,firstPage:12,excludePinnedFromOrganic:true,plusRotation:false,adMarker:"Реклама",viewMinPct:50,viewMinMs:1000,calendarMonths:18},
  plans:{},slots:{},camps:{},subs:{},apps:{},favs:[],favsLoaded:false,avail:{},orders:{},reviews:{},sosresp:{},stats:null,statsAt:0,adm:{}};
const PXF=n=>!PX.settings.features||PX.settings.features[n]!==false;
const papi=(url,body)=>apiFetch(url,body===undefined?{}:{method:"POST",body:JSON.stringify(body)});
const isMobile=()=>matchMedia("(max-width:600px)").matches;
const APP_ST_L={new:"Новая",in_work:"В работе",need_info:"Требуется уточнение",approved:"Одобрена",rejected:"Отклонена",closed:"Закрыта",cancelled_by_applicant:"Отозвана"};
const APP_TONE={new:"warn",in_work:"warn",need_info:"warn",approved:"ok",rejected:"bad",closed:"muted",cancelled_by_applicant:"muted"};
const ORD_ST_L={requested:"Ждёт подтверждения подрядчика",confirmed:"Заказ подтверждён",selected:"Исполнитель выбран",completed_verified:"Выполнение подтверждено",disputed:"Разногласия — проверяет организатор",cancelled:"Отменён",declined:"Подрядчик отклонил"};
const ORD_TONE={requested:"warn",confirmed:"ok",selected:"ok",completed_verified:"ok",disputed:"bad",cancelled:"muted",declined:"muted"};
const RV_ST_L={pending:"На модерации",published:"Опубликован",hidden:"Скрыт модератором",rejected:"Отклонён"};
const CAMP_ST=["draft","pending","scheduled","active","paused","completed","rejected","cancelled"];
const CAMP_ST_L={draft:"Черновик",pending:"На согласовании",scheduled:"Запланирована",active:"Активна",paused:"Пауза",completed:"Завершена",rejected:"Отклонена",cancelled:"Отменена"};
const SLOT_L={HOME_HERO:"Баннер после первого экрана",HOME_FEATURED:"Подборка на главной",CAT_BANNER:"Баннер категории",CAT_PINNED:"«В центре внимания»",GLOBAL_STRIP:"Сквозной промоблок",WEEKLY_OFFER:"Предложение недели"};
const URG_L={today:"Сегодня",days:"1–3 дня",week:"В течение недели"};
const FEST_L={yes:"Участвую в фестивале",planning:"Планирую участвовать",no:"Не участвовал"};
const SRC_L={coop_hero:"«Сотрудничество», первый экран",coop_bottom:"«Сотрудничество», внизу",plan_tab:"Кабинет, «Тариф»",free_card:"Кабинет, бесплатная карточка",vendor_form:"Кабинет, форма скидки",tab_leads:"Замок «Заявки»",tab_sos:"Замок «SOS»",tab_free:"Замок «Календарь»",tab_clients:"Замок «Проверка карт»",own_page:"Своя страница в каталоге",ad_request:"Запрос рекламы",unknown:"Не указан"};
const dstr=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const daysTo=iso=>Math.ceil((Date.parse(iso)-Date.now())/864e5);
const plural=(n,a,b,c)=>n%10===1&&n%100!==11?a:[2,3,4].includes(n%10)&&![12,13,14].includes(n%100)?b:c;

/* ---------- стили новых блоков (в духе «Медь и лёд», светлая и тёмная темы) ---------- */
document.head.insertAdjacentHTML("beforeend",`<style id="plus-css">
.tabs{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:thin;-webkit-overflow-scrolling:touch}.tabs button{flex:none;white-space:nowrap}
.lock-i{font-size:12px;margin-left:4px;opacity:.75}
.vc{position:relative;display:flex;min-width:0}.vc>.v{flex:1;min-width:0}
.fav{position:absolute;top:10px;right:10px;z-index:2;width:40px;height:40px;border-radius:50%;border:1px solid var(--line);background:var(--surface);color:var(--berry);font-size:20px;line-height:1;cursor:pointer;display:grid;place-items:center;box-shadow:0 2px 8px #0001}
.fav.on{background:var(--berry);color:#fff;border-color:var(--berry)}.fav:focus-visible{outline:2px solid var(--berry);outline-offset:2px}
.vp-head .fav{position:static;margin-left:auto}.vp-id{position:relative}
.plus-b{color:var(--berry);font-weight:800;white-space:nowrap}.stars{white-space:nowrap;color:var(--ink);font-weight:700}.stars small{color:var(--muted);font-weight:500}
.tag-ad{background:var(--berry-soft)!important;color:var(--berry)!important}
.pinned{border:1px solid var(--copper-line,var(--line));border-radius:16px;padding:16px;background:var(--berry-soft);margin:0 0 22px}
.pinned-head{display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:12px}.pinned-head h3{margin:0;font-size:17px}
.pinned .grid{grid-template-columns:repeat(3,minmax(0,1fr))}@media(max-width:600px){.pinned .grid{grid-template-columns:1fr}.pinned .vc:nth-child(n+3){display:none}}
.all-head{display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap}.all-head h3{margin:0 0 12px;font-size:18px}.all-head h3[hidden]{display:none}
.more-wrap{justify-content:center;margin-top:22px}
.ad-slot{margin-block:14px}.ad-banner{position:relative;border:1px solid var(--copper-line,var(--line));border-radius:16px;overflow:hidden;background:var(--berry-soft)}
.ad-banner a.ad-link{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);text-decoration:none;color:inherit;min-height:120px}
.ad-banner.noimg a.ad-link{grid-template-columns:1fr}.ad-banner img{width:100%;height:100%;object-fit:cover;display:block;aspect-ratio:4/1}
.ad-copy{display:grid;gap:6px;align-content:center;padding:18px 20px}.ad-copy b{font-size:18px}.ad-copy span{color:var(--muted);font-size:15px}.ad-copy .btn{justify-self:start;color:#fff}
.ad-mark{position:absolute;top:8px;left:8px;background:var(--surface);color:var(--muted);font-size:11px;padding:2px 8px;border-radius:6px;letter-spacing:.02em}
.ad-strip{display:flex;gap:12px;align-items:center;justify-content:space-between;border:1px solid var(--line);border-radius:12px;padding:10px 14px;background:var(--surface);text-decoration:none;color:inherit;font-size:15px}
.ad-strip .ad-mark{position:static}
.ad-feat-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.ad-feat-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px}.ad-feat-head h3{margin:0;font-size:17px}
@media(max-width:600px){.ad-banner a.ad-link{grid-template-columns:1fr}.ad-banner img{aspect-ratio:3/2}.ad-feat-grid{grid-template-columns:1fr}}
.ad-weekly{display:flex;gap:14px;align-items:center;border:1px dashed var(--copper-line,var(--line));border-radius:14px;padding:12px 16px;margin-bottom:14px;text-decoration:none;color:inherit;background:var(--surface)}
.ad-weekly .kicker{color:var(--berry)}
.lock-screen{display:grid;gap:14px;justify-items:start;border:1px solid var(--copper-line,var(--line));background:linear-gradient(135deg,var(--surface),var(--berry-soft))}
.lock-screen .lk{font-size:28px}.lock-screen ul{margin:0;padding-left:20px;display:grid;gap:6px}.lock-screen h3{margin:0}
.terms-st{border-radius:10px;padding:12px 14px;font-size:15px;line-height:1.55;background:var(--sage-soft)}.terms-st.wait{background:var(--berry-soft)}.terms-st.bad{background:#fbe9e7;color:#8a2a1c}
fieldset.locked{position:relative;opacity:.75}fieldset.locked input,fieldset.locked textarea{pointer-events:none}
.lock-note{display:grid;gap:8px;border:1px dashed var(--berry);border-radius:10px;padding:12px 14px;background:var(--berry-soft)}
.coop-hero{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:32px;align-items:start;margin-bottom:28px}.coop-hero h1{font-size:clamp(28px,4vw,44px);font-weight:500;line-height:1.2;margin:14px 0}
.coop-steps ol{margin:0;padding-left:20px;display:grid;gap:10px}.coop-cta{gap:12px}.coop h2{margin:36px 0 14px;font-size:24px;font-weight:600}
.coop-benefits{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.coop-benefits h3{margin:6px 0}.coop-benefits p{margin:0;color:var(--muted)}
.coop-terms ul{margin:0;padding-left:20px;display:grid;gap:8px}.faq details{border-bottom:1px solid var(--line);padding:12px 0}.faq summary{cursor:pointer;font-weight:700}.faq p{color:var(--muted)}
.coop-final{margin-top:32px;text-align:left}.chip{display:inline-block;font-size:12px;padding:2px 8px;border-radius:999px;background:var(--line);color:var(--ink);margin-left:6px;white-space:nowrap}.chip.ok{background:var(--sage-soft);color:var(--sage)}.chip.plus{background:var(--berry-soft);color:var(--berry)}
@media(max-width:860px){.coop-hero{grid-template-columns:1fr}.coop-benefits{grid-template-columns:1fr}}
dialog.dlg{max-width:640px;width:calc(100vw - 24px);border:1px solid var(--line);border-radius:18px;padding:0;background:var(--surface);color:var(--ink)}dialog.dlg::backdrop{background:#0006}
.dlg-in{padding:24px;display:grid;gap:14px;max-height:88vh;overflow:auto}.dlg-head{display:flex;justify-content:space-between;align-items:start;gap:12px}.dlg-head h3{margin:0}
.radios{display:flex;gap:8px;flex-wrap:wrap}.radios label{display:flex!important;gap:6px;align-items:center;border:1px solid var(--line);border-radius:10px;padding:8px 12px;font-weight:500!important}
.radios input{width:18px!important;height:18px!important;min-height:0!important;accent-color:var(--berry)}
.cal{display:grid;gap:12px}.cal-head{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}.cal-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}
.cal-grid .dw{font-size:12px;color:var(--muted);text-align:center}.cal-d{min-height:42px;border:1px solid var(--line);border-radius:8px;background:var(--surface);cursor:pointer;font-weight:700;color:var(--ink);font-size:15px}
.cal-d[disabled]{opacity:.35;cursor:default}.cal-d.free{background:#e3f1e8;border-color:#7bb592;color:#245b3b}.cal-d.busy{background:#f6dcd2;border-color:#c07052;color:#7a2d14}.cal-d.maybe{background:#f8edd0;border-color:#d0a548;color:#6a4e10}
:root[data-theme="dark"] .cal-d.free{background:#1d3a29;color:#bfe6cc}:root[data-theme="dark"] .cal-d.busy{background:#4a2418;color:#f3c7b6}:root[data-theme="dark"] .cal-d.maybe{background:#43360f;color:#f0dca0}
.cal-d.sel{outline:3px solid var(--berry);outline-offset:-3px}.cal-d.today{text-decoration:underline}.cal-legend{display:flex;gap:12px;flex-wrap:wrap;font-size:14px;color:var(--muted)}.cal-legend i{display:inline-block;width:14px;height:14px;border-radius:4px;vertical-align:-2px;margin-right:4px;border:1px solid var(--line)}
.cal-legend .free{background:#e3f1e8}.cal-legend .busy{background:#f6dcd2}.cal-legend .maybe{background:#f8edd0}
.cal-mini{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.cal-mini .cal-d{min-height:30px;font-size:12px;cursor:default}.cal-mini h4{margin:0 0 6px;font-size:14px}
@media(max-width:600px){.cal-mini{grid-template-columns:1fr}}
.rv{display:grid;gap:6px;border-bottom:1px solid var(--line);padding:12px 0}.rv:last-child{border-bottom:0}.rv .ver{color:var(--sage);font-weight:700;font-size:13px}.rv .reply{border-left:3px solid var(--line);padding-left:10px;color:var(--muted)}
.rating-big{display:flex;gap:10px;align-items:baseline}.rating-big b{font-size:30px}
.stars-in{display:flex;gap:4px;flex-direction:row-reverse;justify-content:flex-end}.stars-in input{position:absolute;opacity:0;width:1px;height:1px}.stars-in label{font-size:30px;cursor:pointer;color:var(--line)}
.stars-in input:checked~label,.stars-in label:hover,.stars-in label:hover~label{color:#d39b2a}.stars-in input:focus-visible+label{outline:2px solid var(--berry)}
.ordr{display:grid;gap:8px;border:1px solid var(--line);border-radius:12px;padding:12px 14px}.ordr .row{gap:8px}
.adm-nav{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:18px}.adm-nav button{border:1px solid var(--line);background:var(--surface);border-radius:999px;padding:8px 14px;font-weight:700;cursor:pointer;color:var(--ink)}
.adm-nav button[aria-pressed="true"]{background:var(--ink);color:var(--bg);border-color:var(--ink)}.adm-sec{display:grid;gap:18px}
.flt{display:flex;gap:8px;flex-wrap:wrap;align-items:end}.flt select,.flt input{min-height:40px;border:1px solid var(--line);border-radius:8px;background:var(--bg);padding:6px 10px;color:var(--ink);font:inherit;font-size:15px}
.app-row{border:1px solid var(--line);border-radius:12px;padding:12px 14px;background:var(--surface)}.app-row summary{cursor:pointer;display:flex;gap:10px;flex-wrap:wrap;align-items:baseline;justify-content:space-between}
.app-row .unseen{color:var(--berry);font-weight:800}.app-acts{display:grid;gap:8px;margin-top:10px}
.kv{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:4px 14px;margin:8px 0;font-size:15px}.kv dt{color:var(--muted)}.kv dd{margin:0;overflow-wrap:anywhere}
.mini-form{display:grid;gap:10px;border:1px solid var(--line);border-radius:12px;padding:14px;background:var(--bg)}
.mini-form label{display:grid;gap:4px;font-size:15px;font-weight:600}.mini-form input,.mini-form select,.mini-form textarea{min-height:40px;border:1px solid var(--line);border-radius:8px;background:var(--surface);padding:6px 10px;font:inherit;color:var(--ink)}
.mini-form label.chk{display:flex;font-weight:500}.mini-form .g2{display:grid;grid-template-columns:1fr 1fr;gap:10px}@media(max-width:600px){.mini-form .g2{grid-template-columns:1fr}}
.plan-card{display:grid;gap:10px;border:1px solid var(--copper-line,var(--line));border-radius:16px;padding:20px;background:linear-gradient(135deg,var(--surface),var(--berry-soft))}.plan-card .big{font-size:26px;font-weight:800}
.checks{display:grid;gap:6px;margin:0;padding:0;list-style:none}.checks li:before{content:"○ ";color:var(--muted)}.checks li.ok:before{content:"✓ ";color:var(--sage);font-weight:800}
.statg{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.statg div{border:1px solid var(--line);border-radius:12px;padding:12px}.statg b{display:block;font-size:24px}.statg span{color:var(--muted);font-size:14px}
@media(max-width:600px){.statg{grid-template-columns:1fr 1fr}}
.direct-to{display:flex;gap:12px;align-items:center;border:1px solid var(--berry);border-radius:12px;padding:12px 14px;background:var(--berry-soft);flex-wrap:wrap}.direct-to>div{display:grid}.direct-to small{color:var(--muted)}
.direct-warn{border:1px solid #c07052;border-radius:12px;padding:12px 14px;background:#fbe9e7;color:#7a2d14;display:grid;gap:8px}
.sos-btn{border-color:#c07052!important;color:#9b3b1c!important}:root[data-theme="dark"] .sos-btn{color:#f3c7b6!important}
.sos-acts{display:flex;gap:8px;flex-wrap:wrap}.urg{font-weight:800;color:#9b3b1c}
.prev-ad{max-width:720px}
@media(max-width:600px){.coop-cmp table,.coop-cmp tbody,.coop-cmp tr,.coop-cmp td{display:block;width:100%}.coop-cmp thead{display:none}.coop-cmp tr{border-bottom:1px solid var(--line);padding:10px 0}.coop-cmp td{border:0!important;padding:3px 0!important;white-space:normal!important}.coop-cmp td[data-l]:not(:first-child):before{content:attr(data-l) ": ";color:var(--muted);font-weight:600}}
</style>`);

/* ---------- события показов и кликов (без персональных данных) ---------- */
function evSid(){let s=lsGet("sd-sid","");if(!/^[a-z0-9]{16,64}$/.test(s)){s=Array.from((crypto&&crypto.getRandomValues)?crypto.getRandomValues(new Uint8Array(12)):[...Array(12)].map(()=>Math.random()*256|0),b=>(b&255).toString(16).padStart(2,"0")).join("");lsSet("sd-sid",s)}return s}
function track(kind,o){if(!window.SD_SERVER)return;try{fetch("/api/ev",{method:"POST",credentials:"same-origin",keepalive:true,headers:{"Content-Type":"application/json","X-SD":"1"},body:JSON.stringify({kind,sid:evSid(),page:String(curRoute()||"catalog").slice(0,60),...o})}).catch(()=>{})}catch(_){}}
const evSeen=new Set();function trackOnce(key,kind,o){if(evSeen.has(key))return;evSeen.add(key);track(kind,o)}
const visObs=("IntersectionObserver" in window)?new IntersectionObserver(es=>es.forEach(e=>{const el=e.target,need=(+PX.settings.viewMinPct||50)/100;
  if(e.isIntersecting&&e.intersectionRatio>=need){if(!el._t)el._t=setTimeout(()=>{visObs.unobserve(el);const d=el.dataset;trackOnce("v:"+d.evKind+":"+(d.evCamp||"")+":"+(d.evVendor||"")+":"+(d.evSlot||""),d.evKind,{slot:d.evSlot||undefined,campaignId:d.evCamp||undefined,vendorId:d.evVendor||undefined})},+PX.settings.viewMinMs||1000)}
  else if(el._t){clearTimeout(el._t);el._t=null}}),{threshold:[0,.25,.5,.75,1]}):null;
function observeAll(root){if(!visObs||!root)return;root.querySelectorAll("[data-ev-kind]").forEach(el=>{if(!el.dataset.obs){el.dataset.obs="1";visObs.observe(el)}})}

/* ---------- человекочитаемые адреса (ТЗ 10) ---------- */
const TRL={а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"e",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"h",ц:"ts",ч:"ch",ш:"sh",щ:"sch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya"};
const translitC=s=>String(s||"").toLowerCase().split("").map(c=>TRL[c]??c).join("").replace(/&/g,"-i-").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,60);
const CAT_SLUG={};CATS.forEach(c=>CAT_SLUG[c.id]=translitC(c.n));
const PRETTY={broker:"/broker/",festival:"/festival/","free-dates":"/free-dates/",cooperation:"/cooperation/",card:"/card/",notebook:"/notebook/",privacy:"/privacy/"};
function routeToPath(r){if(!window.SD_SERVER)return null;if(r===""||r==="catalog")return"/";if(PRETTY[r])return PRETTY[r];if(r==="partners")return"/cooperation/";
  if(r.startsWith("cat-")){const sl=CAT_SLUG[r.slice(4)];return sl?"/catalog/"+sl+"/":null}
  if(r.startsWith("p-")){const v=findV(r.slice(2));return v&&v.slug?"/partners/"+v.slug+"/":null}return null}
function pathToRoute(p){if(!p||p==="/")return"";for(const k in PRETTY)if(PRETTY[k]===p)return k;
  let m=p.match(/^\/catalog\/([a-z0-9-]+)\/$/);if(m){const id=Object.keys(CAT_SLUG).find(k=>CAT_SLUG[k]===m[1]);return id?"cat-"+id:""}
  m=p.match(/^\/partners\/([a-z0-9-]+)\/$/);if(m){const v=liveVendors.find(x=>x.slug===m[1]);if(v)return"p-"+v.id;if(window.SD_ROUTE&&window.SD_ROUTE.startsWith("p-"))return window.SD_ROUTE;return"p-~"+m[1]}
  if(p==="/cabinet/")return"cabinet";return""}
function curRoute(){if(!PLUS_READY)return location.hash.slice(1);if(location.hash.length>1)return decodeURIComponent(location.hash.slice(1));if(!window.SD_SERVER)return"";return pathToRoute(location.pathname)}
function navigate(r){const p=routeToPath(r);if(p){if(location.pathname!==p||location.hash)history.pushState({},"",p);route()}else if(location.hash!=="#"+r)location.hash=r;else route()}
function syncCatUrl(){if(!PLUS_READY)return;if(!window.SD_SERVER)return;const p=state.cat==="all"?"/":"/catalog/"+CAT_SLUG[state.cat]+"/";if(location.pathname!==p||location.hash)history.pushState({},"",p);setTitle()}
if(window.SD_SERVER){
  document.addEventListener("click",e=>{if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
    const a=e.target.closest("a[href]");if(!a||a.target==="_blank"||a.hasAttribute("download"))return;const href=a.getAttribute("href");
    if(href.startsWith("#")){let r=decodeURIComponent(href.slice(1));if(a.dataset.cat&&a.dataset.cat!=="all")r="cat-"+a.dataset.cat;
      const el=r&&!/^[a-z]+-/.test(r)&&document.getElementById(r);if(el&&!el.classList.contains("view")){e.preventDefault();el.scrollIntoView({behavior:"smooth",block:"start"});return}
      e.preventDefault();navigate(r);return}
    if(/^\/(catalog|partners|broker|festival|free-dates|cooperation|card|notebook|privacy)(\/|$)|^\/$/.test(href)){e.preventDefault();if(location.pathname!==href||location.hash)history.pushState({},"",href);route()}},true);
  addEventListener("popstate",()=>route());
  openV=function(id){lastBack=location.pathname+location.hash;navigate("p-"+id)};
}
const TITLES={catalog:"Свадебный портал #СказалаДа! — подрядчики со скидкой по карте",broker:"Свадебный брокер и тендеры — #СказалаДа!",festival:"Свадебный фестиваль #СказалаДа!2027 — 21 февраля",cooperation:"Сотрудничество: станьте партнёром #СказалаДа!","free-dates":"Свободные даты подрядчиков — #СказалаДа!",card:"Карта свадебных скидок #СказалаДа!",notebook:"Блокнот невесты #СказалаДа!",privacy:"Политика конфиденциальности — #СказалаДа!",cabinet:"Личный кабинет — #СказалаДа!"};
function setTitle(v){v=v||((curRoute()||"catalog").split("-")[0]);if(v==="catalog"||v==="cat"||v===""){document.title=state.cat!=="all"?catName(state.cat)+" на свадьбу — каталог #СказалаДа!":TITLES.catalog;return}if(TITLES[v])document.title=TITLES[v]}
function afterRoute(v){if(!PLUS_READY)return;setTitle(v==="catalog"?"catalog":v);renderAds();if(v==="cooperation")renderCoop();
  const strip=$("#ad-strip");if(strip&&!["catalog","festival","cooperation","card","notebook","free-dates","broker"].includes(v))strip.hidden=true}

/* ---------- данные ---------- */
const myVendor=()=>ROLE==="vendor"?actingVendor():(IS_OWNER?actingVendor():null);
const myPlan=()=>((myVendor()||{})._plan)||{};
const myApps=()=>Object.values(PX.apps).filter(a=>a.applicantUid===UID).sort((a,b)=>String(b.submittedAt).localeCompare(String(a.submittedAt)));
const activeApp=kind=>myApps().find(a=>["new","in_work","need_info"].includes(a.status)&&(a.requestedPlan||"PLUS")===(kind||"PLUS"));
const vendorLocked=()=>window.SD_SERVER&&ROLE==="vendor"&&!IS_OWNER&&!myPlan().admitted;
function canEditTerms(id){if(!window.SD_SERVER||IS_OWNER)return true;const v=liveVendors.find(x=>x.id===id);return!!(v&&v._plan&&v._plan.admitted)}
let plusStarted=false;
async function plusStart(){if(plusStarted)return;plusStarted=true;
  const on=(col,cb,after)=>DB.collection(col).onSnapshot(s=>{cb(s.docs);(after||renderPlus)()},()=>{});
  const map=docs=>{const o={};docs.forEach(d=>o[d.id]=d.data());return o};
  on("settings",d=>{const m=d.find(x=>x.id==="main");if(m)PX.settings=Object.assign({},PX.settings,m.data())},()=>{render();renderPlus()});
  on("plans",d=>PX.plans=map(d));on("adslots",d=>PX.slots=map(d),()=>{render();renderPlus()});
  on("campaigns",d=>PX.camps=map(d),()=>{render();renderPlus()});on("availability",d=>PX.avail=map(d));on("reviews",d=>PX.reviews=map(d));
  if(UID){on("orders",d=>PX.orders=map(d));on("applications",d=>PX.apps=map(d));
    if(ROLE==="couple"||IS_OWNER)on("favorites",d=>{const m=d.find(x=>x.id===UID);PX.favs=m?(m.data().vendorIds||[]):[];PX.favsLoaded=true},()=>{refreshHearts();renderPlus()});
    if(ROLE==="vendor"||IS_OWNER){on("subs",d=>PX.subs=map(d));on("sosresp",d=>PX.sosresp=map(d))}}
  // нормализуем старые адреса с #раздел и вставляем постоянные кнопки
  if(window.SD_SERVER){const h=location.hash.slice(1);const p=h&&!h.startsWith("p-")?routeToPath(h):null;if(p){history.replaceState({},"",p);route()}}
  const brk=document.querySelector('#v-broker .brk-hero .row');if(brk&&!brk.querySelector(".sos-btn"))brk.insertAdjacentHTML("beforeend",'<a class="btn ghost sos-btn" href="#sos-new" style="text-decoration:none">Нужна срочная замена</a>');
  // отложенное действие после входа: заявка на подключение или избранное
  if(UID){const pend=sessGet("sd-after-login");if(pend){sessSet("sd-after-login","");try{const a=JSON.parse(pend);setTimeout(()=>{if(a.a==="apply")openApply(a.source||"unknown");if(a.a==="fav"&&a.id)toggleFav(a.id,true)},900)}catch(_){}}}
  const ft=document.querySelector(".site-footer .wrap > span");if(ft)ft.innerHTML='© 2026 #СказалаДа!<br><a href="#privacy">Политика конфиденциальности</a> · <a href="#cooperation">Сотрудничество</a>';
  renderPlus();
}
if(typeof startServer==="function"){const _ss=startServer;startServer=async function(){await _ss();try{await plusStart()}catch(e){console.error(e)}}}

let pathFixed=false;
function beforeRenderAll(){if(!PLUS_READY)return;/* старые ссылки вида #p-id переводим на /partners/slug/ */
  if(!window.SD_SERVER||pathFixed||!liveLoaded)return;const h=location.hash.slice(1);
  if(h.startsWith("p-")){const v=findV(h.slice(2));if(v&&v.slug){pathFixed=true;history.replaceState({},"","/partners/"+v.slug+"/")}}}
function renderPlus(){if(!PLUS_READY)return;if(!window.SD_SERVER)return;
  const r=curRoute();if(r.startsWith("p-")&&!$("#v-vendor").hidden&&!brFormBusyPlus()){const v=findV(r.startsWith("p-~")?"":r.slice(2))||liveVendors.find(x=>x.slug===r.slice(3));if(vpSigOf(v)!==vpSig)renderVendorPage(v,false)}
  if(!$("#v-cooperation").hidden)renderCoop();
  if(UID&&!$("#v-cabinet").hidden){const t=curTab;afterSetTab(t,true)}
  try{tabBadges();renderNotif()}catch(_){}
}
function brFormBusyPlus(){const a=document.activeElement;return!!(a&&a.closest&&a.closest("#vp")&&/INPUT|TEXTAREA|SELECT/.test(a.tagName))}

/* ---------- «В центре внимания» и рекламные места (ТЗ 2.2, 3) ---------- */
function hashStr(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function rng(seed){let x=seed||1;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return((x>>>0)%1e6)/1e6}}
function weightedOrder(arr,seed,w){const r=rng(seed);return arr.map(x=>({x,k:Math.pow(r(),1/Math.max(.01,w(x)))})).sort((a,b)=>b.k-a.k).map(o=>o.x)}
const rotSeed=key=>hashStr(evSid()+"|"+new Date().toISOString().slice(0,13)+"|"+key);
const liveCamps=slot=>Object.values(PX.camps).filter(c=>c.slot===slot&&(!c.devices||!c.devices.length||c.devices.includes(isMobile()?"mobile":"desktop")));
const adInfo=c=>[c.marker||PX.settings.adMarker||"Реклама",c.advertiser,c.erid?"erid: "+c.erid:""].filter(Boolean).join(" · ");
function pinnedFor(cat,list){if(!PLUS_READY)return[];if(!window.SD_SERVER||!PXF("ads"))return[];const slot=PX.slots.CAT_PINNED;if(slot&&slot.enabled===false)return[];
  const n=isMobile()?(+PX.settings.pinnedMobile||2):(+PX.settings.pinnedDesktop||3);const inList=new Map(list.map(v=>[v.id,v]));const seed=rotSeed("pin:"+cat);
  const camps=liveCamps("CAT_PINNED").filter(c=>c.vendorId&&inList.has(c.vendorId)&&(!c.categories.length||cat==="all"||c.categories.includes(cat)));
  const out=[],used=new Set();const add=(v,c)=>{if(out.length<n&&v&&!used.has(v.id)){used.add(v.id);out.push(c?{v,campaignId:c.id,label:c.marker||PX.settings.adMarker||"Реклама",info:adInfo(c),paid:true}:{v,campaignId:"",label:"Партнёр",info:"Партнёр портала. Показ по правилам ротации."})}};
  camps.filter(c=>c.exclusive).sort((a,b)=>(b.priority||0)-(a.priority||0)).forEach(c=>add(inList.get(c.vendorId),c));
  weightedOrder(camps.filter(c=>!c.exclusive),seed,c=>(c.weight||1)*(1+(c.priority||0))).forEach(c=>add(inList.get(c.vendorId),c));
  if(PX.settings.plusRotation===true)weightedOrder(list.filter(v=>v.plan==="PLUS"),seed+7,()=>1).forEach(v=>add(v,null));
  return out}
function pinnedShown(pin){const note=$("#pinned-note");if(note)note.textContent=pin.some(x=>x.paid)?(PX.settings.adMarker||"Реклама")+" и партнёры портала":"Партнёры портала, показ по ротации";
  const g=$("#pinned-grid");g.querySelectorAll(".vc").forEach((el,i)=>{const x=pin[i];if(!x)return;el.dataset.evKind=x.campaignId?"view":"pin_view";el.dataset.evSlot="CAT_PINNED";if(x.campaignId)el.dataset.evCamp=x.campaignId;el.dataset.evVendor=x.v.id});observeAll(g)}
function pinnedClick(vid,camp){trackOnce("c:"+(camp||vid),camp?"click":"pin_click",{slot:"CAT_PINNED",campaignId:camp||undefined,vendorId:vid})}
function pickCamp(slot,cat){const l=liveCamps(slot).filter(c=>!c.categories.length||(cat&&c.categories.includes(cat)));if(!l.length)return null;
  const ex=l.filter(c=>c.exclusive).sort((a,b)=>(b.priority||0)-(a.priority||0));if(ex.length)return ex[0];return weightedOrder(l,rotSeed(slot+cat),c=>(c.weight||1)*(1+(c.priority||0)))[0]}
const adHref=c=>{const l=c.link||(c.vendorId?"#p-"+c.vendorId:"");return l};
const isExt=l=>/^https:\/\//i.test(l);
function bannerHtml(c,slot){const l=adHref(c),ext=isExt(l);const img=c.image?blob(c.image):"",imgM=c.imageMobile?blob(c.imageMobile):"";
  return`<aside class="ad-banner ${img?"":"noimg"}" data-ev-kind="view" data-ev-slot="${slot}" data-ev-camp="${esc(c.id)}"><a class="ad-link" href="${esc(l||"#catalog")}" data-ad-click="${esc(c.id)}" data-ad-slot="${slot}" ${ext?'target="_blank" rel="sponsored noopener"':""}>
    ${img?`<picture>${imgM?`<source media="(max-width:600px)" srcset="${esc(imgM)}">`:""}<img src="${esc(img)}" alt="${esc(c.alt||c.title||"")}" loading="lazy"></picture>`:""}
    <div class="ad-copy">${c.title?`<b>${esc(c.title)}</b>`:""}${c.text?`<span>${esc(c.text)}</span>`:""}${c.button?`<span class="btn small">${esc(c.button)}</span>`:""}</div></a><span class="ad-mark" title="${esc(adInfo(c))}">${esc(adInfo(c))}</span></aside>`}
function renderAds(){if(!PLUS_READY)return;if(!window.SD_SERVER)return;const ads=PXF("ads");const r=curRoute();const view=r.startsWith("cat-")||r===""||r==="catalog"?"catalog":r.split("-")[0];const q=($("#q")&&$("#q").value.trim())||"";
  const put=(id,html)=>{const el=$(id);if(!el)return;const show=!!html&&ads;el.hidden=!show;if(show&&el.dataset.html!==html){el.innerHTML=html;el.dataset.html=html;observeAll(el)}else if(!show){el.innerHTML="";el.dataset.html=""}};
  const slotOn=s=>!PX.slots[s]||PX.slots[s].enabled!==false;
  const home=view==="catalog"&&state.cat==="all"&&!q;
  const hero=home&&slotOn("HOME_HERO")?pickCamp("HOME_HERO",""):null;put("#ad-home-hero",hero?bannerHtml(hero,"HOME_HERO"):"");
  const catB=view==="catalog"&&state.cat!=="all"&&slotOn("CAT_BANNER")?pickCamp("CAT_BANNER",state.cat):null;put("#ad-cat-banner",catB?bannerHtml(catB,"CAT_BANNER"):"");
  let feat="";if(home&&slotOn("HOME_FEATURED")){const max=(PX.slots.HOME_FEATURED&&+PX.slots.HOME_FEATURED.maxCards)||3;
    const l=weightedOrder(liveCamps("HOME_FEATURED").filter(c=>c.vendorId&&findV(c.vendorId)),rotSeed("feat"),c=>(c.weight||1)*(1+(c.priority||0))).slice(0,max);
    if(l.length)feat=`<div class="ad-feat-head"><h3>Подборка партнёров</h3><span class="note">${esc(PX.settings.adMarker||"Реклама")}</span></div><div class="ad-feat-grid">${l.map(c=>`<div data-ev-kind="view" data-ev-slot="HOME_FEATURED" data-ev-camp="${esc(c.id)}" data-ad-wrap="${esc(c.id)}">${vcard(findV(c.vendorId),true,{pin:{label:c.marker||PX.settings.adMarker||"Реклама",info:adInfo(c),campaignId:c.id}})}</div>`).join("")}</div>`}
  put("#ad-featured",feat);
  const wk=home&&slotOn("WEEKLY_OFFER")?pickCamp("WEEKLY_OFFER",""):null;const wv=wk&&wk.vendorId?findV(wk.vendorId):null;
  put("#ad-weekly",wk?`<a class="ad-weekly" href="${esc(adHref(wk)||"#catalog")}" data-ad-click="${esc(wk.id)}" data-ad-slot="WEEKLY_OFFER" data-ev-kind="view" data-ev-slot="WEEKLY_OFFER" data-ev-camp="${esc(wk.id)}" ${isExt(adHref(wk))?'target="_blank" rel="sponsored noopener"':""}>${wv?avHtml(wv):""}<span><span class="kicker">Предложение недели${wk.endAt?" · до "+fmtDate(wk.endAt):""}</span><br><b>${esc(wk.title||(wv&&wv.name)||"")}</b> ${esc(wk.text||"")}</span><span class="ad-mark" style="position:static;margin-left:auto">${esc(adInfo(wk))}</span></a>`:"");
  const stripOk=["catalog","festival","cooperation","card","notebook","free","broker"].includes(view)&&$("#v-cabinet").hidden;
  const st=stripOk&&slotOn("GLOBAL_STRIP")?pickCamp("GLOBAL_STRIP",view==="catalog"&&state.cat!=="all"?state.cat:""):null;
  put("#ad-strip",st?`<a class="ad-strip" href="${esc(adHref(st)||"#catalog")}" data-ad-click="${esc(st.id)}" data-ad-slot="GLOBAL_STRIP" data-ev-kind="view" data-ev-slot="GLOBAL_STRIP" data-ev-camp="${esc(st.id)}" ${isExt(adHref(st))?'target="_blank" rel="sponsored noopener"':""}><span><b>${esc(st.title||"")}</b> ${esc(st.text||"")}</span><span class="ad-mark">${esc(adInfo(st))}</span></a>`:"");
}
document.addEventListener("click",e=>{const a=e.target.closest("[data-ad-click]");if(a)trackOnce("c:"+a.dataset.adClick,"click",{slot:a.dataset.adSlot,campaignId:a.dataset.adClick});
  const w=e.target.closest("[data-ad-wrap]");if(w&&!e.target.closest(".fav")){trackOnce("c:"+w.dataset.adWrap,"click",{slot:"HOME_FEATURED",campaignId:w.dataset.adWrap});const b=e.target.closest(".v");if(b){e.preventDefault();openV(b.dataset.id)}}},true);

/* ---------- избранное пары (ТЗ 5) ---------- */
function favBtn(id){if(!PLUS_READY)return"";if(!window.SD_SERVER||!PXF("favorites")||ROLE==="vendor")return"";const on=PX.favs.includes(id);
  return`<button class="fav ${on?"on":""}" type="button" data-fav-v="${esc(id)}" aria-pressed="${on}" aria-label="${on?"Убрать из избранного":"Добавить в избранное"}" title="${on?"В избранном":"В избранное"}">${on?"♥":"♡"}</button>`}
function refreshHearts(){document.querySelectorAll("[data-fav-v]").forEach(b=>{const on=PX.favs.includes(b.dataset.favV);b.classList.toggle("on",on);b.setAttribute("aria-pressed",on);b.textContent=on?"♥":"♡";b.setAttribute("aria-label",on?"Убрать из избранного":"Добавить в избранное")})}
async function toggleFav(id,forceOn){
  if(!UID){sessSet("sd-after-login",JSON.stringify({a:"fav",id}));try{sessionStorage.setItem("sd-role-pref","couple")}catch(_){}navigate("cabinet");toast("Войдите или зарегистрируйтесь, чтобы сохранять избранное");return}
  if(ROLE!=="couple"){toast("Избранное доступно парам");return}
  const set=new Set(PX.favs);if(set.has(id)&&!forceOn)set.delete(id);else set.add(id);const prev=PX.favs;PX.favs=[...set];refreshHearts();renderFavPanel();
  try{await DB.doc("favorites/"+UID).set({vendorIds:PX.favs});if(forceOn)toast("Добавлено в избранное")}catch(e){PX.favs=prev;refreshHearts();renderFavPanel();toast(errText(e))}}
document.addEventListener("click",e=>{const b=e.target.closest("[data-fav-v]");if(!b)return;e.preventDefault();e.stopPropagation();toggleFav(b.dataset.favV)},true);
let favCat="";
function renderFavPanel(){const box=$("#fav-panel");if(!box)return;if(!window.SD_SERVER||ROLE!=="couple"||!PXF("favorites")){box.hidden=true;return}box.hidden=false;
  const ids=PX.favs;const items=ids.map(id=>({id,v:liveVendors.find(x=>x.id===id&&x.visible!==false&&approved(x))}));const cats=[...new Set(items.filter(x=>x.v).map(x=>x.v.cat))];
  const l=items.filter(x=>!favCat||(x.v&&x.v.cat===favCat));const groups={};l.forEach(x=>{const k=x.v?x.v.cat:"_gone";(groups[k]=groups[k]||[]).push(x)});
  box.innerHTML=`<div class="row" style="justify-content:space-between"><h3>Избранные специалисты${ids.length?` <span class="cnt">${ids.length}</span>`:""}</h3>${cats.length>1?`<select id="fav-cat" aria-label="Раздел"><option value="">Все разделы</option>${cats.map(c=>`<option value="${c}" ${c===favCat?"selected":""}>${esc(catName(c))}</option>`).join("")}</select>`:""}</div>
   ${ids.length?Object.entries(groups).map(([c,xs])=>`<div><span class="kicker">${c==="_gone"?"Недоступны":esc(catName(c))}</span><div class="list">${xs.map(x=>x.v?`<div class="li"><div class="th" style="${x.v.avatar?`background:url('${blob(x.v.avatar)}') center/cover`:bgFor(x.v)}">${x.v.avatar||(x.v.photos||[]).length?"":esc(initials(x.v.name))}</div><div style="min-width:0"><b>${esc(x.v.name)}</b><span>${pct(x.v)?"−"+pct(x.v)+"% по карте":"Без скидки по карте"}</span></div><div class="row"><a class="btn ghost small" href="#p-${esc(x.id)}" style="text-decoration:none">Открыть</a>${x.v.plan==="PLUS"?`<a class="btn small" href="#direct-${esc(x.id)}" style="text-decoration:none">Получить предложение</a>`:""}<button class="btn ghost small" type="button" data-fav-v="${esc(x.id)}" aria-pressed="true">Убрать</button></div></div>`
     :`<div class="li"><div class="th"></div><div><b>Карточка недоступна</b><span>Партнёр скрыт или удалён</span></div><button class="btn ghost small" type="button" data-fav-v="${esc(x.id)}" aria-pressed="true">Убрать</button></div>`).join("")}</div></div>`).join(""):`<p class="note" style="margin:0">Нажмите ♡ на карточке в каталоге, чтобы сохранить специалиста. Избранное синхронизируется между устройствами.</p>`}`;
  const fc=$("#fav-cat");if(fc)fc.onchange=e=>{favCat=e.target.value;renderFavPanel()}}

/* ---------- страница подрядчика: избранное, «Получить предложение», календарь, отзывы ---------- */
let vpSig="";const vpSigOf=v=>JSON.stringify([v||null,v&&PX.avail[v.id],v&&Object.values(PX.reviews).filter(x=>x.vendorId===v.id),v&&PX.favs.includes(v.id),PX.settings.features,UID,ROLE]);
if(typeof renderVendorPage==="function"){const _rvp=renderVendorPage;renderVendorPage=function(v,isPreview){_rvp(v,isPreview);vpSig=isPreview?"":vpSigOf(v);if(!v||isPreview||!window.SD_SERVER)return;try{vendorExtras(v)}catch(e){console.error(e)}}}
function vendorExtras(v){const box=$("#vp");document.title=v.name+" — "+catName(v.cat)+" | #СказалаДа!";
  const head=box.querySelector(".vp-head .vp-id");if(head&&!head.querySelector(".fav"))head.insertAdjacentHTML("beforeend",favBtn(v.id));
  const hero=$("#vp-hero");if(hero&&pct(v)){const t=hero.querySelector(".tag");if(t){t.textContent="Скидка по карте"+(v.demo?" · демо":"");t.classList.add("tag-ad")}else hero.insertAdjacentHTML("afterbegin",'<span class="tag tag-ad">Скидка по карте</span>')}
  const own=ROLE==="vendor"&&(v.id===UID||v.owner===UID);
  // FREE: скидки по карте нет — не показываем пустой блок и недействительный промокод
  if(!pct(v)&&!hasSpec(v)){const d=box.querySelector(".disc-big");if(d)d.remove();const pc=$("#vp-code");if(pc){const pn=pc.closest(".panel");if(pn)pn.innerHTML=`<span class="kicker">Связаться</span><p class="note" style="margin:0">${v.plan==="PLUS"?"Скидка по карте пока не утверждена.":"Партнёр размещён бесплатно: скидки по карте нет, свяжитесь по контактам ниже."}</p>${inviteBtn(v)}`}}
  const side=box.querySelector(".vp-side");if(!side)return;
  let act="";
  if(v.plan==="PLUS"&&ROLE!=="vendor"&&PXF("direct"))act+=`<a class="btn" href="#direct-${esc(v.id)}" style="text-decoration:none;text-align:center">Получить предложение</a><p class="note" style="margin:0">Адресный запрос увидит только этот подрядчик. Бесплатно.</p>`;
  if(ROLE==="couple"&&PXF("reviews"))act+=`<details class="ord-req"><summary class="btn ghost small" style="list-style:none">Уже работали? Подтвердить заказ для отзыва</summary><form class="mini-form" id="ordreq-f" novalidate style="margin-top:8px"><label>Дата оказания услуги<input type="date" id="ordreq-d" value="${esc(profile.date||"")}"></label><label>Комментарий <span class="hint">необязательно</span><input id="ordreq-n" maxlength="300" placeholder="Например: съёмка свадьбы, полный день"></label><div class="row"><button class="btn small" type="submit">Отправить подрядчику</button><span class="msg err" id="ordreq-m"></span></div><p class="note" style="margin:0">Подрядчик подтвердит заказ, после даты обе стороны подтвердят выполнение — и можно будет оставить отзыв.</p></form></details>`;
  if(own&&v.plan!=="PLUS")act+=`<div class="lock-note"><b>Это ваша бесплатная карточка</b><span>Скидка по карте, заявки пар и календарь откроются после подключения.</span><button class="btn small" type="button" data-apply="own_page">Подключиться к дисконтной системе #СказалаДа!</button></div>`;
  if(act&&!side.querySelector(".vp-acts"))side.insertAdjacentHTML("afterbegin",`<div class="panel vp-acts" style="gap:10px">${act}</div>`);
  const of=$("#ordreq-f");if(of)of.onsubmit=async e=>{e.preventDefault();const m=$("#ordreq-m");m.textContent="";try{await papi("/api/orders/new",{vendorId:v.id,eventDate:$("#ordreq-d").value,note:$("#ordreq-n").value});toast("Запрос отправлен подрядчику. Статус — во вкладке «Заказы и отзывы»");of.closest("details").open=false}catch(err){m.textContent=err.message||errText(err)}};
  // календарь занятости (только общий статус, без имён и цен)
  const av=PX.avail[v.id];if(av&&av.enabled&&PXF("calendar")&&!box.querySelector(".vp-cal")){const main=box.querySelector(".vp-main");
    main.insertAdjacentHTML("beforeend",`<div class="panel vp-cal"><h2 style="font-size:21px;margin:0">Календарь занятости</h2><div class="cal-mini">${[0,1,2].map(i=>miniMonth(av.dates||{},i)).join("")}</div>
      <div class="cal-legend"><span><i class="free"></i>Свободно</span><span><i class="busy"></i>Занято</span><span><i class="maybe"></i>Под вопросом</span><span><i></i>Не указано</span></div>
      <form class="row" id="vp-chk" novalidate><label class="f" style="display:grid;gap:4px;font-weight:600">Проверить дату<input type="date" id="vp-chk-d" value="${esc(profile.date||"")}" min="${todayStr()}"></label><button class="btn ghost small" type="submit" style="align-self:end">Проверить</button><span class="note" id="vp-chk-r" aria-live="polite"></span></form></div>`);
    const f=$("#vp-chk");f.onsubmit=e=>{e.preventDefault();const d=$("#vp-chk-d").value;const st=(av.dates||{})[d];$("#vp-chk-r").textContent=!d?"Выберите дату":st==="free"?"Дата свободна — напишите подрядчику":st==="busy"?"Дата занята":st==="maybe"?"Под вопросом — уточните у подрядчика":"Статус не указан — уточните у подрядчика"};if($("#vp-chk-d").value)f.onsubmit(new Event("submit"))}
  // отзывы только по подтверждённым заказам
  if(PXF("reviews")&&!box.querySelector(".vp-rev")){const rs=Object.values(PX.reviews).filter(r=>r.vendorId===v.id&&r.status==="published").sort((a,b)=>String(b.publishedAt||b.createdAt).localeCompare(String(a.publishedAt||a.createdAt)));
    box.querySelector(".vp-main").insertAdjacentHTML("beforeend",`<div class="panel vp-rev"><h2 style="font-size:21px;margin:0">Отзывы</h2>${rs.length?`<div class="rating-big"><b>${v.rating||"—"}</b><span class="stars">${"★".repeat(Math.round(v.rating||0))}${"☆".repeat(5-Math.round(v.rating||0))}</span><span class="note">${v.ratingCount} ${plural(v.ratingCount,"подтверждённый отзыв","подтверждённых отзыва","подтверждённых отзывов")}</span></div>${rs.map(revHtml).join("")}`:`<p class="note" style="margin:0">Пока нет подтверждённых отзывов. Отзывы появляются только после подтверждённых заказов.</p>`}</div>`)}
  trackOnce("page:"+v.id,"page",{vendorId:v.id});
}
function revHtml(r){return`<article class="rv"><div class="row" style="justify-content:space-between"><span class="stars" aria-label="Оценка ${r.rating} из 5">${"★".repeat(r.rating)}${"☆".repeat(5-r.rating)}</span><span class="ver">✓ Заказ подтверждён</span></div>
  <p style="margin:0">${esc(r.text)}</p>${(r.photos||[]).length?`<div class="photos rq-refs">${r.photos.map(p=>`<a class="photo" href="${blob(p)}" target="_blank" rel="noopener" style="background-image:url('${blob(p)}')" aria-label="Фото к отзыву"></a>`).join("")}</div>`:""}
  <small class="note">${esc(catName(r.cat))} · свадьба ${r.eventMonth?new Date(r.eventMonth+"-15").toLocaleDateString("ru-RU",{month:"long",year:"numeric"}):""}</small>${r.reply?`<div class="reply"><b>Ответ подрядчика:</b> ${esc(r.reply.text)}</div>`:""}</article>`}
function miniMonth(dates,off){const d0=new Date();d0.setDate(1);d0.setMonth(d0.getMonth()+off);const y=d0.getFullYear(),m=d0.getMonth();const first=(new Date(y,m,1).getDay()+6)%7,days=new Date(y,m+1,0).getDate();const t=todayStr();
  let h=`<div><h4>${d0.toLocaleDateString("ru-RU",{month:"long",year:"numeric"})}</h4><div class="cal-grid">${["Пн","Вт","Ср","Чт","Пт","Сб","Вс"].map(x=>`<span class="dw">${x}</span>`).join("")}`;for(let i=0;i<first;i++)h+="<span></span>";
  for(let d=1;d<=days;d++){const ds=dstr(new Date(y,m,d)),st=dates[ds]||"";h+=`<span class="cal-d ${st} ${ds===t?"today":""}" title="${{free:"Свободно",busy:"Занято",maybe:"Под вопросом"}[st]||"Не указано"}" style="display:grid;place-items:center" ${ds<t?'aria-disabled="true"':""}>${d}</span>`}return h+"</div></div>"}
document.addEventListener("click",e=>{const a=e.target.closest("#vp .contacts a");if(!a)return;const r=curRoute();if(r.startsWith("p-"))trackOnce("contact:"+r,"contact",{vendorId:r.slice(2)})});
function directBusyCheck(dv,date){const box=$("#rf-busy");if(!box)return;const st=date&&PX.avail[dv.id]&&PX.avail[dv.id].dates?PX.avail[dv.id].dates[date]:"";
  if(st!=="busy"){box.hidden=true;box.innerHTML="";return}
  const alt=liveVendors.filter(x=>x.cat===dv.cat&&x.id!==dv.id&&x.plan==="PLUS"&&x.visible!==false&&approved(x)&&!(PX.avail[x.id]&&PX.avail[x.id].dates&&PX.avail[x.id].dates[date]==="busy")).slice(0,3);
  box.hidden=false;box.innerHTML=`<b>${fmtDate(date)} у «${esc(dv.name)}» отмечено «Занято».</b><span>Запрос всё равно можно отправить — возможно, планы изменились. Или посмотрите других специалистов раздела:</span>${alt.length?`<div class="row">${alt.map(x=>`<a class="btn ghost small" href="#direct-${esc(x.id)}" style="text-decoration:none">${esc(x.name)}</a>`).join("")}</div>`:""}<label class="chk" style="font-weight:600"><input type="checkbox" id="rf-busy-ok"> Всё равно отправить запрос этому подрядчику</label>`}

/* ---------- страница «Сотрудничество» (ТЗ 2.4) ---------- */
const COOP_ROWS=[["Карточка, фотографии, контакты","Да","Да"],["Основная скидка и спецпредложение по карте","Нет","Да, после допуска организатором"],["Тендеры, брокер, отклики","Нет — раздел виден с замком","Да"],["«Получить предложение» из карточки","Нет — видны контакты","Да, адресный запрос"],["«Свадебный SOS»","Нет — раздел виден с замком","Да, по категории"],["Календарь свободных и занятых дат","Нет — раздел виден с замком","Да, включаете сами"],["Свободные даты со специальной ценой","Нет","Да, до 3 в месяц"],["Отзывы подтверждённых заказов","Да, после проверки сделки","Да, после проверки сделки"],["Реклама в каталоге и на главной","По отдельному договору","По отдельному договору"],["Статистика","Базовая","Расширенная"],["Подача заявки на подключение","Да, бесплатно","Видны условия продления"]];
function renderCoop(){const t=$("#coop-cmp");if(!t)return;
  t.innerHTML=COOP_ROWS.map(([f,a,b])=>`<tr><td data-l="Возможность"><b>${esc(f)}</b></td><td data-l="Бесплатно">${esc(a)} ${/^Да/.test(a)?'<span class="chip ok">доступно</span>':""}</td><td data-l="«Партнёр +»">${esc(b)} <span class="chip plus">после подключения</span></td></tr>`).join("");
  const P=PX.plans.PLUS||{};$("#coop-price").textContent="Стоимость и срок «Партнёр +»: "+(P.priceRub?fmtRub(P.priceRub)+" ₽"+(P.billingPeriod?" / "+P.billingPeriod:""):(PX.settings.plusPriceText||"условия уточняет организатор"))+". Отправка заявки — это обращение, а не оплата и не автоматическое подключение.";
  const st=$("#coop-status");if(!st)return;if(!UID){st.textContent="Без входа: нажмите кнопку — после регистрации подрядчика форма откроется сама.";return}
  if(ROLE==="couple"){st.textContent="Вы вошли как пара. Подключение доступно аккаунтам подрядчиков.";return}
  const pl=myPlan(),a=activeApp();st.innerHTML=pl.admitted?`Ваш статус: <b>«Партнёр +» до ${fmtDate(pl.until)}</b>.`:a?`Ваша заявка ${esc(a.num)}: <b>${APP_ST_L[a.status]}</b>. Организатор свяжется с вами после рассмотрения.`:"Ваш статус: бесплатное размещение."}
document.addEventListener("click",e=>{const b=e.target.closest("[data-apply]");if(b){e.preventDefault();openApply(b.dataset.apply)}
  const s=e.target.closest("[data-vendor-start]");if(s&&window.SD_SERVER){e.preventDefault();if(!UID){try{sessionStorage.setItem("sd-role-pref","vendor")}catch(_){}navigate("cabinet");toast("Зарегистрируйтесь как подрядчик — карточка бесплатная");return}
    if(ROLE==="vendor"){navigate("cabinet");setTimeout(()=>setTab("vendor"),50)}else toast("Карточку размещают аккаунты подрядчиков")}});

/* ---------- единая заявка на подключение (ТЗ 2.5) ---------- */
function dlg(id){let d=document.getElementById(id);if(!d){document.body.insertAdjacentHTML("beforeend",`<dialog class="dlg" id="${id}"><div class="dlg-in"></div></dialog>`);d=document.getElementById(id);d.addEventListener("click",e=>{if(e.target===d)d.close()})}return d}
function openApply(source){source=source||"unknown";
  if(!window.SD_SERVER){toast("Заявка подаётся на сайте сказала-да.рф");return}
  if(!UID){sessSet("sd-after-login",JSON.stringify({a:"apply",source}));try{sessionStorage.setItem("sd-role-pref","vendor")}catch(_){}navigate("cabinet");toast("Войдите или зарегистрируйтесь как подрядчик — форма заявки откроется сразу после входа");return}
  if(ROLE==="couple"){toast("Подключение доступно аккаунтам подрядчиков");return}
  const kind=source==="ad_request"?"AD":"PLUS";const d=dlg("apply-dlg"),box=d.querySelector(".dlg-in");const a=activeApp(kind);
  if(a){box.innerHTML=`<div class="dlg-head"><h3>Заявка ${esc(a.num)} на рассмотрении</h3><button class="btn ghost small" type="button" data-close>Закрыть</button></div><p style="margin:0">Статус: <b>${APP_ST_L[a.status]}</b>. Отправлена ${fmtDate(a.submittedAt)}.</p>${a.adminComment?`<p class="note" style="margin:0">Комментарий организатора: ${esc(a.adminComment)}</p>`:""}<p class="note" style="margin:0">Организатор свяжется с вами после рассмотрения. Повторно отправлять не нужно.</p>`;
    box.querySelector("[data-close]").onclick=()=>d.close();d.showModal();return}
  const v=myVendor()||{};const c=v.contacts||{};
  box.innerHTML=`<div class="dlg-head"><h3>${kind==="AD"?"Запрос рекламного размещения":"Подключиться к дисконтной системе #СказалаДа!"}</h3><button class="btn ghost small" type="button" data-close aria-label="Закрыть">✕</button></div>
   <p class="note" style="margin:0">${kind==="AD"?"Организатор подберёт рекламное место и сроки и свяжется с вами.":"Это обращение, а не оплата и не автоматическое подключение. Организатор проверит участника и согласует условия скидки."}</p>
   <form class="f" id="ap-f" novalidate>
    <div class="g2"><label for="ap-org">Название карточки или организации *<input id="ap-org" maxlength="120" value="${esc(v.name||"")}"></label><label for="ap-name">Контактное лицо<input id="ap-name" maxlength="120"></label></div>
    <label for="ap-cat">Раздел каталога<select id="ap-cat"><option value="">Выберите раздел</option>${CATS.map(x=>`<option value="${x.id}" ${x.id===v.cat?"selected":""}>${esc(x.n)}</option>`).join("")}</select></label>
    <div class="g2"><label for="ap-email">Email для связи *<input id="ap-email" type="email" maxlength="120" value="${esc((typeof ME!=="undefined"&&ME&&ME.email)||"")}"></label><label for="ap-phone">Телефон для связи *<input id="ap-phone" type="tel" maxlength="40" value="${esc(c.phone||"")}"></label></div>
    <fieldset><legend>Участие в Свадебном фестивале #СказалаДа!</legend><div class="radios">${Object.entries(FEST_L).map(([k,l])=>`<label><input type="radio" name="ap-fest" value="${k}" ${k==="no"?"checked":""}> ${l}</label>`).join("")}</div></fieldset>
    <label for="ap-com">Пожелание или комментарий<textarea id="ap-com" rows="3" maxlength="1000"></textarea></label>
    <label class="chk" style="font-weight:500;color:var(--ink)"><input type="checkbox" id="ap-ok"> <span>Согласен на обработку персональных данных по <a href="#privacy">политике конфиденциальности</a></span></label>
    <div class="row"><button class="btn" type="submit" id="ap-send">Отправить заявку</button><span class="msg err" id="ap-msg"></span></div></form>`;
  box.querySelector("[data-close]").onclick=()=>d.close();
  $("#ap-f").onsubmit=async e=>{e.preventDefault();const m=$("#ap-msg"),btn=$("#ap-send");m.textContent="";if(btn.disabled)return;
    const body={org:$("#ap-org").value.trim(),contactName:$("#ap-name").value.trim(),category:$("#ap-cat").value,contactEmail:$("#ap-email").value.trim(),contactPhone:$("#ap-phone").value.trim(),festivalStatus:(document.querySelector('input[name="ap-fest"]:checked')||{}).value,comment:$("#ap-com").value.trim(),consent:$("#ap-ok").checked,sourcePlacement:source,requestedPlan:kind};
    if(!body.org){m.textContent="Укажите название";$("#ap-org").focus();return}if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.contactEmail)){m.textContent="Проверьте email";$("#ap-email").focus();return}
    if(body.contactPhone.replace(/\D/g,"").length<10){m.textContent="Укажите телефон";$("#ap-phone").focus();return}if(!body.consent){m.textContent="Отметьте согласие на обработку персональных данных";return}
    btn.disabled=true;btn.textContent="Отправляем…";
    try{const r=await papi("/api/apply",body);PX.apps[r.application.id]=r.application;
      box.innerHTML=`<div class="dlg-head"><h3>Заявка отправлена</h3><button class="btn ghost small" type="button" data-close>Закрыть</button></div><p style="margin:0">Номер заявки: <b>${esc(r.application.num)}</b>. Организатор свяжется с вами после рассмотрения. Статус виден в кабинете, во вкладке «Тариф».</p>
        ${myVendor()?"":`<div class="lock-note"><b>У вас пока нет карточки в каталоге</b><span>Создайте бесплатную карточку — заявка уже сохранена, заполненные данные не потеряются.</span><button class="btn small" type="button" id="ap-mk">Создать карточку бесплатно</button></div>`}`;
      box.querySelector("[data-close]").onclick=()=>d.close();const mk=$("#ap-mk");if(mk)mk.onclick=()=>{d.close();navigate("cabinet");setTimeout(()=>{setTab("vendor");if(!F("name").value)F("name").value=body.org;if(body.category&&!F("cat").value)F("cat").value=body.category;if(!F("phone").value)F("phone").value=body.contactPhone;renderPreview()},80)};renderPlus()}
    catch(err){if(err.status===409){toast("Заявка уже на рассмотрении");d.close();setTimeout(()=>openApply(source),50);return}m.textContent=err.message||errText(err);btn.disabled=false;btn.textContent="Отправить заявку"}};
  d.showModal();setTimeout(()=>$("#ap-org").focus(),30)}

/* ---------- замки для FREE (ТЗ 2.6) ---------- */
const LOCKS={leads:{t:"Тендеры, брокер и адресные запросы",b:["Заявки пар вашего раздела и персональные приглашения","Отклики, переписка и сравнение предложений","Адресные запросы из кнопки «Получить предложение»"]},
  sos:{t:"Свадебный SOS",b:["Срочные заявки пар, у которых сорвался подрядчик","Приглашения по вашему разделу и городу","Быстрые ответы: «Могу помочь», «Дата занята»"]},
  free:{t:"Календарь занятости и свободные даты",b:["Отмечайте свободные и занятые дни на 18 месяцев вперёд","Пары видят статус даты в вашей карточке","Свободные даты со специальной ценой — до 3 в месяц"]},
  clients:{t:"Скидка и спецпредложение по карте",b:["Ваша скидка по карте #СказалаДа! в каталоге после утверждения","Проверка карт пар по QR-коду","Учёт применённых скидок"]}};
function applyLocks(t){const panel=$("#t-"+t);if(!panel)return;let lk=panel.querySelector(":scope>.lock-screen");const L=LOCKS[t];const locked=L&&vendorLocked();
  if(locked){[...panel.children].forEach(c=>{if(c!==lk&&!c.hidden){c.hidden=true;c.dataset.lk="1"}});if(!lk){panel.insertAdjacentHTML("afterbegin",'<div class="lock-screen panel"></div>');lk=panel.firstElementChild}
    const a=activeApp();lk.hidden=false;lk.innerHTML=`<span class="lk" aria-hidden="true">🔒</span><h3>${esc(L.t)}</h3><ul>${L.b.map(x=>`<li>${esc(x)}</li>`).join("")}</ul><p style="margin:0"><b>Доступно участникам программы «Партнёр +».</b></p>${a?`<p class="note" style="margin:0">Ваша заявка ${esc(a.num)}: ${APP_ST_L[a.status]}. Организатор свяжется с вами.</p>`:`<button class="btn" type="button" data-apply="tab_${t}">Подключиться к дисконтной системе #СказалаДа!</button>`}`}
  else{if(lk)lk.hidden=true;[...panel.children].forEach(c=>{if(c.dataset.lk==="1"){c.hidden=false;delete c.dataset.lk}})}}
function lockIcons(){document.querySelectorAll(".tabs button[data-t]").forEach(b=>{const need=LOCKS[b.dataset.t]&&vendorLocked();const ic=b.querySelector(".lock-i");if(need&&!ic)b.insertAdjacentHTML("beforeend",'<span class="lock-i" aria-label="Доступно в «Партнёр +»">🔒</span>');if(!need&&ic)ic.remove()})}
function termsLock(v){if(!PLUS_READY)return;if(!window.SD_SERVER)return;const id=editingId;const can=canEditTerms(id);const fs=[document.querySelector("#vform fieldset.disc"),document.querySelector("#vform fieldset.spec-f")].filter(Boolean);
  fs.forEach(f=>{f.classList.toggle("locked",!can);f.querySelectorAll("input,textarea").forEach(i=>i.disabled=!can)});
  let st=$("#vf-terms");if(!st&&fs[0]){fs[0].insertAdjacentHTML("beforebegin",'<div id="vf-terms"></div>');st=$("#vf-terms")}if(!st)return;
  const pl=(v&&v._plan)||{};
  if(!can){st.className="lock-note";st.innerHTML=`<b>Скидка и спецпредложение по карте — в программе «Партнёр +»</b><span>Бесплатная карточка видна в каталоге с описанием, фото и контактами. Скидку по карте можно опубликовать после подключения и утверждения условий организатором.</span>${activeApp()?`<span class="note">Заявка ${esc(activeApp().num)}: ${APP_ST_L[activeApp().status]}</span>`:`<button class="btn small" type="button" data-apply="vendor_form">Подключиться к дисконтной системе #СказалаДа!</button>`}`;return}
  if(IS_OWNER&&v&&v._plan&&!v._plan.admitted){st.className="terms-st wait";st.textContent="У этого партнёра нет действующего «Партнёр +»: скидка не будет показана в каталоге.";return}
  st.className="terms-st "+(pl.termsStatus==="pending"?"wait":pl.termsNote?"bad":"");
  st.textContent=pl.termsStatus==="approved"?"Условия скидки утверждены организатором и показаны в каталоге.":pl.termsStatus==="pending"?"Изменённые условия скидки ждут утверждения организатором. До утверждения в каталоге показаны прежние утверждённые условия."+(pl.termsNote?" Замечание: «"+pl.termsNote+"».":""):"Укажите скидку и спецпредложение — после сохранения организатор утвердит условия."}

/* ---------- вкладка «Тариф и статистика» ---------- */
async function loadStats(force){if(!window.SD_SERVER||ROLE!=="vendor"||!myVendor())return;if(!force&&PX.stats&&Date.now()-PX.statsAt<6e4)return;PX.statsAt=Date.now();try{PX.stats=await apiFetch("/api/my/stats");renderPlanTab()}catch(_){}}
function renderPlanTab(){const box=$("#plan-box");if(!box)return;if(ROLE!=="vendor"&&!IS_OWNER){box.innerHTML="";return}
  const v=myVendor();if(!v){box.innerHTML=`<div class="panel empty">Сначала заполните карточку во вкладке «Моя карточка». Размещение бесплатное.</div>`;return}
  const pl=v._plan||{},a=activeApp(),last=myApps()[0],P=PX.plans.PLUS||{},s=PX.stats;
  const plusOn=pl.admitted;const st=pl.active?(pl.admitted?"«Партнёр +» до "+fmtDate(pl.until):"«Партнёр +» назначен, ждёт подтверждения допуска"):pl.expired?"Срок «Партнёр +» истёк "+fmtDate(pl.until):pl.status==="suspended"?"«Партнёр +» приостановлен":pl.status==="revoked"?"«Партнёр +» отозван":"Бесплатное размещение";
  box.innerHTML=`<div class="two-col"><div style="display:grid;gap:16px;align-content:start"><div class="plan-card"><span class="kicker">Ваш тариф</span><span class="big">${esc(st)}</span>
    <ul class="checks"><li class="${approved(v)?"ok":""}">Карточка прошла модерацию</li><li class="${pl.active?"ok":""}">Активный уровень «Партнёр +»</li><li class="${pl.participationVerified&&pl.active?"ok":""}">Допуск к дисконтной программе подтверждён</li><li class="${pl.termsStatus==="approved"&&plusOn?"ok":""}">Условия скидки утверждены${pl.termsStatus==="pending"?" — изменения на утверждении":""}</li></ul>
    ${pl.active&&pl.until&&daysTo(pl.until)<=14?`<p class="note" style="margin:0">До окончания осталось ${daysTo(pl.until)} ${plural(daysTo(pl.until),"день","дня","дней")}. Для продления подайте заявку — организатор свяжется с вами.</p>`:""}
    ${a?`<div class="lock-note"><b>Заявка ${esc(a.num)}: ${APP_ST_L[a.status]}</b><span>Отправлена ${fmtDate(a.submittedAt)}. Организатор свяжется с вами после рассмотрения.</span>${a.adminComment?`<span>Комментарий: ${esc(a.adminComment)}</span>`:""}<button class="btn ghost small" type="button" id="ap-cancel" data-id="${esc(a.id)}">Отозвать заявку</button></div>`
      :`<button class="btn" type="button" data-apply="plan_tab">${plusOn?"Продлить или изменить условия":"Подключиться к дисконтной системе #СказалаДа!"}</button>`}
    ${plusOn?`<button class="btn ghost small" type="button" data-apply="ad_request">Запросить рекламное размещение</button>`:""}
    <p class="note" style="margin:0">Стоимость и срок: ${P.priceRub?fmtRub(P.priceRub)+" ₽"+(P.billingPeriod?" / "+esc(P.billingPeriod):""):esc(PX.settings.plusPriceText||"условия уточняет организатор")}.</p></div>
    ${last?`<div class="panel"><h3>История обращений</h3><div class="list">${myApps().map(x=>`<div class="rl"><b>${esc(x.num)} · ${x.requestedPlan==="AD"?"реклама":"«Партнёр +»"}</b><span class="amt"><span class="st st-${APP_TONE[x.status]}">${APP_ST_L[x.status]}</span></span><span style="grid-column:1/-1">${fmtDate(x.submittedAt)}${x.adminComment?" · "+esc(x.adminComment):""}</span></div>`).join("")}</div></div>`:""}</div>
    <div style="display:grid;gap:16px;align-content:start"><div class="panel"><h3>Статистика</h3>${s?`<div class="statg"><div><b>${s.pageViews30}</b><span>просмотров карточки за 30 дней</span></div><div><b>${s.pageViewsAll}</b><span>просмотров всего</span></div>${s.plan==="PLUS"?`<div><b>${s.contacts30}</b><span>переходов к контактам за 30 дней</span></div><div><b>${s.pinViews30}</b><span>показов в «В центре внимания»</span></div>`:""}</div>
      ${s.plan==="PLUS"&&(s.byMonth||[]).length?`<div class="tbl"><table><thead><tr><th>Месяц</th><th class="n">Просмотры</th><th class="n">Контакты</th><th class="n">Показы в блоке</th><th class="n">Клики в блоке</th></tr></thead><tbody>${[...new Set(s.byMonth.map(x=>x.m))].map(mm=>{const g=k=>(s.byMonth.find(x=>x.m===mm&&x.kind===k)||{}).n||0;return`<tr><td>${mm}</td><td class="n">${g("page")}</td><td class="n">${g("contact")}</td><td class="n">${g("pin_view")}</td><td class="n">${g("pin_click")}</td></tr>`}).join("")}</tbody></table></div>`:""}
      ${s.plan==="PLUS"&&(s.campaigns||[]).length?`<h3 style="font-size:16px">Мои рекламные кампании</h3><div class="list">${s.campaigns.map(c=>`<div class="rl"><b>${esc(c.title||SLOT_L[c.slot])}</b><span class="amt">${CAMP_ST_L[c.status]||c.status}</span><span style="grid-column:1/-1">${SLOT_L[c.slot]||c.slot} · показы ${c.views} · клики ${c.clicks}${c.views?" · CTR "+(c.clicks/c.views*100).toFixed(1)+"%":""}</span></div>`).join("")}</div>`:""}
      ${s.plan!=="PLUS"?`<p class="note" style="margin:0">Расширенная статистика — переходы к контактам, показы в «В центре внимания», динамика по месяцам — доступна в «Партнёр +».</p>`:""}`:`<p class="note">Загружаем…</p>`}</div>
    <div class="panel"><h3>Бесплатно и «Партнёр +»</h3><div class="tbl"><table><tbody>${COOP_ROWS.map(([f,x,y])=>`<tr><td>${esc(f)}</td><td>${esc(x)}</td><td>${esc(y)}</td></tr>`).join("")}</tbody></table></div></div></div></div>`;
  const c=$("#ap-cancel");if(c)c.onclick=async()=>{if(c.dataset.armed!=="1"){c.dataset.armed="1";c.textContent="Точно отозвать?";return}try{await papi("/api/apply/cancel",{id:c.dataset.id});PX.apps[c.dataset.id]={...PX.apps[c.dataset.id],status:"cancelled_by_applicant"};toast("Заявка отозвана");renderPlanTab()}catch(e){toast(e.message||errText(e))}};
  if(!s)loadStats()}

/* ---------- вкладки кабинета ---------- */
const busyIn=el=>{if(!el)return false;const a=document.activeElement;return!!((a&&el.contains(a)&&/INPUT|TEXTAREA|SELECT/.test(a.tagName))||el.querySelector("[data-dirty]"))};
function afterSetTab(t,quiet){if(!PLUS_READY)return;if(!window.SD_SERVER)return;lockIcons();applyLocks(t);if(LOCKS[t]&&vendorLocked())return;
  if(t==="couple")renderFavPanel();
  if(t==="free"&&!busyIn($("#cal-panel")))renderCalPanel();
  if(t==="sos")renderSosList();
  if(t==="orders"&&!busyIn($("#t-orders")))renderOrders();
  if(t==="plan"&&!busyIn($("#plan-box"))){renderPlanTab();if(!quiet)loadStats(true)}
  if(t==="vendor"){const v=liveVendors.find(x=>x.id===editingId);termsLock(v)}
  if(t==="admin"&&!quiet)renderAdminPlus();else if(t==="admin")renderAdminPlus(true)}

/* ---------- календарь занятости (ТЗ 9) ---------- */
const CAL={vid:"",enabled:false,dates:{},month:"",sel:new Set(),anchor:"",range:false,dirty:false,loadedV:0};
function calLoad(){const v=myVendor();if(!v)return;const a=PX.avail[v.id]||{};if(CAL.vid!==v.id||(!CAL.dirty&&CAL.loadedV!==(a.version||0))){CAL.vid=v.id;CAL.enabled=!!a.enabled;CAL.dates={...(a.dates||{})};CAL.loadedV=a.version||0;CAL.sel=new Set();CAL.dirty=false}if(!CAL.month)CAL.month=todayStr().slice(0,7)}
function renderCalPanel(){const box=$("#cal-panel");if(!box)return;if(!PXF("calendar")){box.hidden=true;return}box.hidden=false;const v=myVendor();
  if(!v){box.innerHTML=`<p class="note">Сначала заполните карточку.</p>`;return}calLoad();
  const [y,m]=CAL.month.split("-").map(Number);const d0=new Date(y,m-1,1);const first=(d0.getDay()+6)%7,days=new Date(y,m,0).getDate();const t=todayStr();
  const minM=todayStr().slice(0,7);const maxD=new Date();maxD.setMonth(maxD.getMonth()+(+PX.settings.calendarMonths||18));const maxM=dstr(maxD).slice(0,7);
  const cnt=k=>Object.values(CAL.dates).filter(x=>x===k).length;
  let grid=["Пн","Вт","Ср","Чт","Пт","Сб","Вс"].map(x=>`<span class="dw">${x}</span>`).join("");for(let i=0;i<first;i++)grid+="<span></span>";
  for(let d=1;d<=days;d++){const ds=dstr(new Date(y,m-1,d)),st=CAL.dates[ds]||"";grid+=`<button type="button" class="cal-d ${st} ${CAL.sel.has(ds)?"sel":""} ${ds===t?"today":""}" data-day="${ds}" ${ds<t?"disabled":""} aria-pressed="${CAL.sel.has(ds)}" aria-label="${fmtDate(ds)}: ${{free:"свободно",busy:"занято",maybe:"под вопросом"}[st]||"не указано"}">${d}</button>`}
  box.innerHTML=`<div class="cal"><div class="cal-head"><h3 style="margin:0">Календарь занятости</h3><label class="chk" style="font-weight:600"><input type="checkbox" id="cal-on" ${CAL.enabled?"checked":""}> Показывать календарь в моей карточке</label></div>
   <p class="note" style="margin:0">Пары видят только статус дня — без имён заказчиков и цен. В карточке показываются ближайшие 3 месяца и проверка любой даты. Планирование — на ${+PX.settings.calendarMonths||18} месяцев вперёд, без лимита на количество дат.</p>
   <div class="cal-head"><div class="row"><button class="btn ghost small" type="button" id="cal-prev" ${CAL.month<=minM?"disabled":""} aria-label="Предыдущий месяц">‹</button><b style="min-width:150px;text-align:center">${d0.toLocaleDateString("ru-RU",{month:"long",year:"numeric"})}</b><button class="btn ghost small" type="button" id="cal-next" ${CAL.month>=maxM?"disabled":""} aria-label="Следующий месяц">›</button></div>
   <label class="chk"><input type="checkbox" id="cal-range" ${CAL.range?"checked":""}> Выделять диапазон</label></div>
   <div class="cal-grid" id="cal-grid">${grid}</div>
   <div class="cal-legend"><span><i class="free"></i>Свободно (${cnt("free")})</span><span><i class="busy"></i>Занято (${cnt("busy")})</span><span><i class="maybe"></i>Под вопросом (${cnt("maybe")})</span><span><i></i>Не указано</span></div>
   <div class="row"><span class="note">Выбрано: ${CAL.sel.size}</span><button class="btn ghost small" type="button" data-cal="free" ${CAL.sel.size?"":"disabled"}>Свободно</button><button class="btn ghost small" type="button" data-cal="busy" ${CAL.sel.size?"":"disabled"}>Занято</button><button class="btn ghost small" type="button" data-cal="maybe" ${CAL.sel.size?"":"disabled"}>Под вопросом</button><button class="btn ghost small" type="button" data-cal="" ${CAL.sel.size?"":"disabled"}>Не указано</button><button class="btn ghost small" type="button" id="cal-clear" ${CAL.sel.size?"":"disabled"}>Снять выделение</button></div>
   <div class="row"><button class="btn" type="button" id="cal-save" ${CAL.dirty?"":"disabled"}>Сохранить календарь</button><span class="msg" id="cal-msg">${CAL.dirty?"Есть несохранённые изменения":""}</span></div><div id="cal-conf"></div></div>`;
  if(CAL.dirty)box.dataset.dirty="1";else delete box.dataset.dirty;
  $("#cal-prev").onclick=()=>{const d=new Date(y,m-2,1);CAL.month=dstr(d).slice(0,7);renderCalPanel()};$("#cal-next").onclick=()=>{const d=new Date(y,m,1);CAL.month=dstr(d).slice(0,7);renderCalPanel()};
  $("#cal-range").onchange=e=>{CAL.range=e.target.checked;CAL.anchor=""};$("#cal-on").onchange=e=>{CAL.enabled=e.target.checked;CAL.dirty=true;renderCalPanel()};
  $("#cal-clear").onclick=()=>{CAL.sel=new Set();CAL.anchor="";renderCalPanel()};
  $("#cal-grid").onclick=e=>{const b=e.target.closest("[data-day]");if(!b||b.disabled)return;const ds=b.dataset.day;
    if((CAL.range||e.shiftKey)&&CAL.anchor){let a=CAL.anchor<ds?CAL.anchor:ds,z=CAL.anchor<ds?ds:CAL.anchor;for(let d=new Date(a+"T12:00:00");dstr(d)<=z;d.setDate(d.getDate()+1))CAL.sel.add(dstr(d));CAL.anchor=""}
    else{CAL.sel.has(ds)?CAL.sel.delete(ds):CAL.sel.add(ds);CAL.anchor=ds}renderCalPanel()};
  box.querySelectorAll("[data-cal]").forEach(b=>b.onclick=()=>{CAL.sel.forEach(d=>{if(b.dataset.cal)CAL.dates[d]=b.dataset.cal;else delete CAL.dates[d]});CAL.sel=new Set();CAL.dirty=true;renderCalPanel()});
  $("#cal-save").onclick=()=>calSave(false)}
async function calSave(confirmed){const v=myVendor();if(!v)return;const m=$("#cal-msg");
  const fd=((FD[UID]||{}).items||[]).filter(x=>x.status==="active"&&CAL.dates[x.date]==="busy");
  if(fd.length&&!confirmed){$("#cal-conf").innerHTML=`<div class="direct-warn"><b>На ${fd.map(x=>fmtDate(x.date)).join(", ")} опубликованы свободные даты со специальной ценой.</b><span>Если отметить эти дни «Занято», акции снимутся с показа парам. Решение за вами.</span><div class="row"><button class="btn small" type="button" id="cal-yes">Снять акции и сохранить</button><button class="btn ghost small" type="button" id="cal-no">Отмена</button></div></div>`;
    $("#cal-yes").onclick=()=>calSave(true);$("#cal-no").onclick=()=>{$("#cal-conf").innerHTML=""};return}
  try{if(fd.length){const ids=new Set(fd.map(x=>x.id));await DB.doc("freedates/"+UID).set({items:(FD[UID].items||[]).map(x=>ids.has(x.id)?{...x,status:"closed"}:x)})}
    await DB.doc("availability/"+v.id).set({enabled:CAL.enabled,dates:CAL.dates});CAL.dirty=false;CAL.loadedV=-1;toast("Календарь сохранён");renderCalPanel()}catch(e){if(m)m.textContent=errText(e)}}

/* ---------- SOS: список у подрядчика и форма пары (ТЗ 7) ---------- */
function mySosResp(rid){const d=PX.sosresp[UID];return((d&&d.items)||[]).find(x=>x.requestId===rid)}
const RESP_L={help:"Могу помочь",clarify:"Уточнить детали",busy:"Дата занята",not_profile:"Не по профилю"};
function sosButtons(r){const my=mySosResp(r.id);return`<div class="sos-acts" data-sosr="${esc(r.id)}">${["help","clarify","busy","not_profile"].map(k=>`<button class="btn ${k==="help"?"":"ghost"} small" type="button" data-sos="${k}" aria-pressed="${my&&my.kind===k}">${RESP_L[k]}${my&&my.kind===k?" ✓":""}</button>`).join("")}</div>${my?`<p class="note" style="margin:0">Ваш ответ: ${RESP_L[my.kind]}, ${new Date(my.at).toLocaleString("ru-RU",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</p>`:""}`}
function renderSosList(){const box=$("#sos-list");if(!box)return;const v=myVendor();if(!v){box.innerHTML=`<div class="empty" style="min-height:120px">Сначала заполните карточку.</div>`;return}
  const l=allReqs().filter(r=>r.mode==="sos"&&(r.invited||[]).some(i=>i.vendorId===v.id)).sort((a,b)=>String(b.publishedAt).localeCompare(String(a.publishedAt)));
  box.innerHTML=l.length?l.map(r=>{const st=reqStatus(r),mine=offersFor(r.id).find(o=>o.vendorId===v.id);return`<div class="ordr"><div class="row" style="justify-content:space-between"><b>${esc(catName(r.categoryId))}, ${fmtDate(r.eventDate)}${r.eventTime?" "+esc(r.eventTime):""}, ${esc(r.city||"")}</b><span class="st st-${REQ_TONE[st]}">${REQ_ST[st]}</span></div>
    <span><span class="urg">${esc(URG_L[r.urgency]||"Срочно")}</span> · ${esc(budgetText(r))}${r.venue?" · "+esc(r.venue):""}</span>${r.reason?`<span class="note">Причина: ${esc(r.reason)}</span>`:""}
    ${mine?`<span class="tag-k">Ваше предложение: ${OFF_ST[offerState(mine,r)]}</span>`:st==="open"?sosButtons(r):""}<a class="btn ghost small" href="#req-${esc(r.id)}" style="text-decoration:none;justify-self:start">Открыть заявку</a></div>`}).join("")
   :`<div class="empty" style="min-height:140px">Срочных заявок для вас пока нет. Они приходят, когда у пары в вашем разделе сорвался подрядчик. Отмечайте занятые даты в календаре — так вам не придут заявки на занятые дни.</div>`}
document.addEventListener("click",async e=>{const b=e.target.closest("[data-sos]");if(!b)return;const rid=b.closest("[data-sosr]").dataset.sosr;const k=b.dataset.sos;
  if(k==="busy"&&b.dataset.armed!=="1"){b.dataset.armed="1";b.textContent="Отметить дату занятой?";return}
  b.disabled=true;try{await papi("/api/sos/respond",{requestId:rid,kind:k});const d=PX.sosresp[UID]||{items:[]};d.items=[...(d.items||[]).filter(x=>x.requestId!==rid),{requestId:rid,kind:k,at:new Date().toISOString()}];PX.sosresp[UID]=d;
    toast(k==="help"?"Отправьте предложение в форме заявки":k==="clarify"?"Задайте вопрос паре в переписке":k==="busy"?"Отмечено: дата занята. Календарь обновлён":"Отмечено");
    if(k==="help"||k==="clarify"){if(curRoute()!=="req-"+rid)navigate("req-"+rid);else setTimeout(()=>{const t=k==="help"?$("#of-price"):$(".thr-f textarea");if(t){t.scrollIntoView({block:"center"});t.focus()}},100)}else{renderSosList();if(curRoute()==="req-"+rid)renderReq(rid,true)}}catch(err){toast(err.message||errText(err))}b.disabled=false});
if(typeof vendorOfferBlock==="function"){const _vob=vendorOfferBlock;vendorOfferBlock=function(r,st,v){const h=_vob(r,st,v);if(r.mode!=="sos"||st!=="open")return h;return`<div class="panel"><span class="kicker">Срочная заявка · ${esc(URG_L[r.urgency]||"срочно")}</span><p class="note" style="margin:0">Ответы зависят от доступности специалистов. Если не можете — отметьте, это поможет паре быстрее найти замену.</p>${sosButtons(r)}</div>`+h}}
if(typeof reqSummary==="function"){const _rs=reqSummary;reqSummary=function(r,fv){let h=_rs(r,fv);if(r.mode==="sos")h=`<dl class="ck-card rq-dl"><dt>Срочность</dt><dd>${esc(URG_L[r.urgency]||"—")}</dd><dt>Время</dt><dd>${esc(r.eventTime||"не указано")}</dd>${r.reason?`<dt>Что случилось</dt><dd>${esc(r.reason)}</dd>`:""}${r.requirements?`<dt>Требования</dt><dd>${esc(r.requirements)}</dd>`:""}</dl>`+h;return h}}
function openSosForm(){const w=$("#rf-wrap");
  if(!UID){w.innerHTML=`<div class="empty">Чтобы отправить срочную заявку, войдите в аккаунт пары. Это бесплатно.<a class="btn" href="#cabinet" style="text-decoration:none">Войти</a></div>`;try{sessionStorage.setItem("sd-role-pref","couple")}catch(_){}return}
  if(ROLE!=="couple"&&!IS_OWNER){w.innerHTML=`<div class="empty">Срочные заявки размещают пары.</div>`;return}
  if(!PXF("sos")){w.innerHTML=`<div class="empty">Свадебный SOS временно недоступен.</div>`;return}
  const p=profile||{};const catOpts=Object.keys(GROUPS).map(g=>`<optgroup label="${GROUPS[g]}">${CATS.filter(c=>c.g===g).map(c=>`<option value="${c.id}">${c.n}</option>`).join("")}</optgroup>`).join("");
  w.innerHTML=`<form class="f panel" id="sos-f" novalidate><span class="kicker">Свадебный SOS · бесплатно</span><h3>Нужна срочная замена</h3>
   <p class="note" style="margin:0">Заявка уйдёт одобренным специалистам раздела волнами: сначала в вашем городе, затем шире. Телефон не публикуется. Ответы зависят от доступности специалистов — замена не гарантирована.</p>
   <div class="g2"><label for="sos-cat">Кого ищете *<select id="sos-cat"><option value="">Выберите раздел</option>${catOpts}</select></label><label for="sos-date">Дата *<input id="sos-date" type="date" min="${todayStr()}" value="${esc(p.date&&p.date>=todayStr()?p.date:"")}"></label></div>
   <div class="g2"><label for="sos-time">Время<input id="sos-time" type="time"></label><label for="sos-city">Город *<input id="sos-city" list="rf-cities-s" value="${esc(p.city||"Нижний Новгород")}" maxlength="80"></label></div>
   <datalist id="rf-cities-s">${BR_CITIES.map(c=>`<option value="${c}">`).join("")}</datalist>
   <div class="g2"><label for="sos-venue">Место<input id="sos-venue" maxlength="120" value="${esc(p.venue||"")}"></label><label for="sos-budget">Бюджет, ₽ <span class="hint">необязательно</span><input id="sos-budget" type="number" min="0" step="1000"></label></div>
   <fieldset><legend>Срочность *</legend><div class="radios">${Object.entries(URG_L).map(([k,l])=>`<label><input type="radio" name="sos-urg" value="${k}"> ${l}</label>`).join("")}</div></fieldset>
   <label for="sos-reason">Что случилось <span class="hint">коротко и без имён: «подрядчик отменил заказ»</span><input id="sos-reason" maxlength="300"></label>
   <label for="sos-desc">Что нужно сделать *<textarea id="sos-desc" rows="4" maxlength="2000" placeholder="Например: фотограф на 6 часов, репортаж и прогулка"></textarea></label>
   <label for="sos-req">Требования<input id="sos-req" maxlength="600" placeholder="Например: своя техника, опыт свадеб"></label>
   <label class="chk" style="font-weight:500;color:var(--ink)"><input type="checkbox" id="sos-ok"> <span>Понимаю: заявка бесплатная, телефоны не публикуются, специалисты откликаются по возможности</span></label>
   <div class="row"><button class="btn" type="submit" id="sos-send">Отправить срочную заявку</button><span class="msg err" id="sos-msg"></span></div></form>`;
  $("#sos-f").onsubmit=async e=>{e.preventDefault();const m=$("#sos-msg"),er=(t,el)=>{m.textContent=t;if(el)el.focus()};m.textContent="";
    const d={categoryId:$("#sos-cat").value,eventDate:$("#sos-date").value,eventTime:$("#sos-time").value,city:$("#sos-city").value.trim(),venue:$("#sos-venue").value.trim(),budgetMax:parseInt($("#sos-budget").value)||0,urgency:(document.querySelector('input[name="sos-urg"]:checked')||{}).value||"",reason:$("#sos-reason").value.trim(),description:$("#sos-desc").value.trim(),requirements:$("#sos-req").value.trim()};
    if(!d.categoryId)return er("Выберите раздел",$("#sos-cat"));if(!d.eventDate||d.eventDate<todayStr())return er("Укажите дату не раньше сегодняшней",$("#sos-date"));if(!d.city)return er("Укажите город",$("#sos-city"));
    if(!d.urgency)return er("Выберите срочность");if(!d.description)return er("Опишите, что нужно",$("#sos-desc"));
    if(BAD_TEXT.test(d.description+" "+d.reason+" "+d.requirements))return er("Уберите телефоны, ссылки и никнеймы — контакты откроются после выбора исполнителя",$("#sos-desc"));if(!$("#sos-ok").checked)return er("Подтвердите согласие с правилами");
    const items=brItems("requests",UID);const r={id:genId("s"),mode:"sos",...d,budgetNegotiable:!d.budgetMax,guestCount:0,tags:[],refs:[],status:"pending_review",createdAt:nowIso(),submittedAt:nowIso(),updatedAt:nowIso(),deadlineAt:new Date(d.eventDate+"T20:59:00Z").toISOString(),invited:[],waves:0,history:[{at:nowIso(),actor:UID,type:"submitted"}]};
    $("#sos-send").disabled=true;try{items.push(r);await brWrite("requests",UID,items);toast("Срочная заявка отправлена. Специалисты получают её волнами");location.hash="req-"+r.id}catch(err){er(errText(err));$("#sos-send").disabled=false}}}
if(typeof adminControls==="function"){const _ac=adminControls;adminControls=function(r,st){let h=_ac(r,st);if(r.mode!=="sos")return h;
  const cands=liveVendors.filter(v=>v.cat===r.categoryId&&v.plan==="PLUS"&&!(r.invited||[]).some(i=>i.vendorId===v.id));
  return h+`<div class="panel adm" data-sosadm="${esc(r.id)}"><span class="kicker">SOS · управление</span><p style="margin:0">Волна ${r.waves||0}, приглашено ${(r.invited||[]).length}${r.sosStopped?" · рассылка остановлена":""}${r.sosEscalated?" · <b>эскалация организатору</b>":""}</p>
   <div class="row"><button class="btn ghost small" type="button" data-sa="wave">Следующая волна</button>${r.sosStopped?`<button class="btn ghost small" type="button" data-sa="resume">Возобновить рассылку</button>`:`<button class="btn ghost small" type="button" data-sa="stop">Остановить рассылку</button>`}</div>
   ${cands.length?`<div class="row"><select data-sa-v aria-label="Подрядчик">${cands.map(v=>`<option value="${esc(v.id)}">${esc(v.name)}</option>`).join("")}</select><button class="btn ghost small" type="button" data-sa="invite">Пригласить вручную</button></div>`:`<p class="note" style="margin:0">Других участников «Партнёр +» в разделе нет.</p>`}
   <details data-sa-meta><summary>Кто приглашён и кто исключён</summary><div class="note">Загружаем…</div></details></div>`}}
document.addEventListener("click",async e=>{const b=e.target.closest("[data-sa]");if(!b)return;const box=b.closest("[data-sosadm]");const sel=box.querySelector("[data-sa-v]");b.disabled=true;
  try{await papi("/api/admin/sos",{requestId:box.dataset.sosadm,action:b.dataset.sa,vendorId:sel?sel.value:undefined});toast("Готово");refreshSubs()}catch(err){toast(err.message||errText(err))}b.disabled=false});
document.addEventListener("toggle",async e=>{const d=e.target;if(!d.matches||!d.matches("[data-sa-meta]")||!d.open)return;const id=d.closest("[data-sosadm]").dataset.sosadm;
  try{const j=await apiFetch("/api/admin/sosmeta?id="+encodeURIComponent(id));const w=(j.meta&&j.meta.waves)||[];d.querySelector("div").innerHTML=w.length?w.map(x=>`<p style="margin:6px 0"><b>Волна ${x.wave}</b> (${fmtDate(x.at)}): ${x.invited.length?esc(x.invited.join(", ")):"никого"}${x.excluded.length?`<br><small>Исключены: ${x.excluded.map(z=>esc(z.vendorName)+" — "+esc(z.reason)).join("; ")}</small>`:""}</p>`).join(""):"Данных о волнах нет"}catch(_){}},true);

/* ---------- заказы и отзывы (ТЗ 6) ---------- */
function myOrders(){return Object.values(PX.orders).filter(o=>IS_OWNER&&ROLE!=="couple"&&ROLE!=="vendor"?true:ROLE==="couple"?o.coupleUid===UID:(myVendor()&&o.vendorId===myVendor().id)).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))}
function renderOrders(){const box=$("#ord-list");if(!box)return;const side=ROLE==="couple"?"couple":"vendor";const l=myOrders();const t=todayStr();
  let h=l.length?l.map(o=>{const rv=PX.reviews[o.id];const mine=(o.confirm||{})[side],other=(o.confirm||{})[side==="couple"?"vendor":"couple"];let acts="";
    if(side==="vendor"&&o.status==="requested")acts+=`<button class="btn small" type="button" data-oa="accept" data-o="${esc(o.id)}">Подтвердить заказ</button><button class="btn ghost small" type="button" data-oa="decline" data-o="${esc(o.id)}">Не работали</button>`;
    if(side==="couple"&&o.status==="requested")acts+=`<button class="btn ghost small" type="button" data-oa="cancel" data-o="${esc(o.id)}">Отменить запрос</button>`;
    if(["selected","confirmed"].includes(o.status)){if(o.eventDate>t)acts+=`<span class="note">Подтвердить выполнение можно после ${fmtDate(o.eventDate)}</span>`;else if(!mine)acts+=`<button class="btn small" type="button" data-oa="done" data-o="${esc(o.id)}">Подтвердить выполнение</button><button class="btn ghost small" type="button" data-oa="dispute" data-o="${esc(o.id)}">Есть разногласия</button>`;else acts+=`<span class="note">Вы подтвердили. ${other?"":"Ждём подтверждения второй стороны."}</span>`}
    if(side==="couple"&&o.status==="completed_verified")acts+=rv?`<span class="note">Ваш отзыв: ${RV_ST_L[rv.status]||rv.status}${rv.moderation&&rv.moderation.reason&&rv.status!=="published"?" — "+esc(rv.moderation.reason):""}</span><button class="btn ghost small" type="button" data-rvf="${esc(o.id)}">Изменить отзыв</button>`:`<button class="btn small" type="button" data-rvf="${esc(o.id)}">Оставить отзыв</button>`;
    return`<div class="ordr" id="ord-${esc(o.id)}"><div class="row" style="justify-content:space-between"><b>${side==="couple"?esc(o.vendorName):"Пара"} · ${esc(catName(o.cat))} · ${fmtDate(o.eventDate)}</b><span class="st st-${ORD_TONE[o.status]||"muted"}">${ORD_ST_L[o.status]||o.status}</span></div>
      <span class="note">${o.kind==="direct_deal"?"Заказ вне тендера":"По заявке № "+shortId(o.requestId)}${o.price?" · "+fmtRub(o.price)+" ₽":""}${o.note?" · "+esc(o.note):""}</span><div class="row">${acts}</div><div data-rvbox="${esc(o.id)}"></div></div>`}).join("")
    :`<div class="empty" style="min-height:120px">${side==="couple"?"Заказы появятся, когда вы выберете исполнителя по заявке или подтвердите заказ на странице подрядчика.":"Заказы появятся, когда пара выберет ваше предложение или попросит подтвердить заказ."}</div>`;
  box.innerHTML=h;renderReviewsList()}
document.addEventListener("click",async e=>{const b=e.target.closest("[data-oa]");if(!b)return;const a=b.dataset.oa;let note="";
  if(a==="dispute"){if(b.dataset.armed!=="1"){b.dataset.armed="1";b.insertAdjacentHTML("afterend",`<input class="disp-note" maxlength="300" placeholder="Что не так? Организатор проверит" style="min-height:36px;border:1px solid var(--line);border-radius:8px;padding:4px 8px">`);b.textContent="Отправить организатору";return}note=(b.parentElement.querySelector(".disp-note")||{}).value||""}
  if(a==="decline"||a==="cancel"){if(b.dataset.armed!=="1"){b.dataset.armed="1";b.textContent="Точно?";return}}
  b.disabled=true;try{const r=await papi("/api/orders/act",{id:b.dataset.o,action:a,note});PX.orders[r.order.id]=r.order;toast(a==="done"?(r.order.status==="completed_verified"?"Выполнение подтверждено обеими сторонами":"Подтверждение отправлено"):"Готово");renderOrders()}catch(err){toast(err.message||errText(err));b.disabled=false}});
document.addEventListener("click",e=>{const b=e.target.closest("[data-rvf]");if(!b)return;const id=b.dataset.rvf,box=document.querySelector(`[data-rvbox="${CSS.escape(id)}"]`);const rv=PX.reviews[id]||{};const mn=+PX.settings.reviewMin||50,mx=+PX.settings.reviewMax||1500;let photos=[...(rv.photos||[])];
  box.innerHTML=`<form class="mini-form" data-dirty="1" novalidate><fieldset style="border:0;padding:0;margin:0"><legend>Оценка *</legend><div class="stars-in">${[5,4,3,2,1].map(n=>`<input type="radio" name="rv-r-${esc(id)}" id="rv-${esc(id)}-${n}" value="${n}" ${rv.rating===n?"checked":""}><label for="rv-${esc(id)}-${n}" title="${n}">★</label>`).join("")}</div></fieldset>
   <label>Отзыв * <span class="hint"><span class="rv-cnt">${(rv.text||"").length}</span> / ${mx}, не меньше ${mn}. Без телефонов, договоров и сведений о гостях</span><textarea rows="5" maxlength="${mx}" class="rv-t">${esc(rv.text||"")}</textarea></label>
   <div class="photos rv-ph"></div><input type="file" class="rv-file" accept="image/jpeg,image/png,image/webp" multiple hidden>
   <div class="row"><button class="btn small" type="submit">Отправить на модерацию</button><button class="btn ghost small" type="button" class="rv-x" data-rvx>Отмена</button><span class="msg err rv-m"></span></div></form>`;
  const f=box.querySelector("form"),ph=box.querySelector(".rv-ph"),fi=box.querySelector(".rv-file");
  const drawPh=()=>{ph.innerHTML=photos.map((p,i)=>`<div class="photo" style="background-image:url('${blob(p)}')"><button type="button" class="x" data-i="${i}" aria-label="Убрать фото">×</button></div>`).join("")+(photos.length<3?`<label class="upl" tabindex="0">+ Фото (до 3)</label>`:"")};drawPh();
  ph.onclick=e2=>{const x=e2.target.closest(".x");if(x){photos.splice(+x.dataset.i,1);drawPh();return}if(e2.target.closest(".upl"))fi.click()};
  fi.onchange=async()=>{for(const file of [...fi.files].slice(0,3-photos.length)){try{const r=await ASSETS.upload(file);photos.push(r.id);drawPh()}catch(err){toast(err.message||"Не удалось загрузить фото")}}fi.value=""};
  f.querySelector(".rv-t").oninput=e2=>{f.querySelector(".rv-cnt").textContent=e2.target.value.length};
  f.querySelector("[data-rvx]").onclick=()=>{box.innerHTML=""};
  f.onsubmit=async e2=>{e2.preventDefault();const m=f.querySelector(".rv-m");const rating=+((f.querySelector("input[type=radio]:checked")||{}).value||0),text=f.querySelector(".rv-t").value.trim();
    if(!rating){m.textContent="Поставьте оценку";return}if(text.length<mn){m.textContent=`Напишите хотя бы ${mn} символов`;return}
    try{const r=await papi("/api/reviews",{orderId:id,rating,text,photos,edit:!!rv.id});PX.reviews[id]=r.review;toast("Отзыв отправлен на модерацию");box.innerHTML="";renderOrders()}catch(err){m.textContent=err.message||errText(err)}}});
function renderReviewsList(){const box=$("#rv-list");if(!box)return;
  if(ROLE==="couple"){const l=Object.values(PX.reviews).filter(r=>r.coupleUid===UID);$("#rv-h").textContent="Мои отзывы";
    box.innerHTML=l.length?l.map(r=>`<div class="rv"><b>${esc(r.vendorName)}</b><span class="stars">${"★".repeat(r.rating)}</span><span class="st st-${r.status==="published"?"ok":r.status==="pending"?"warn":"bad"}" style="justify-self:start">${RV_ST_L[r.status]}</span>${r.moderation&&r.moderation.reason&&r.status!=="published"?`<span class="note">Причина: ${esc(r.moderation.reason)}</span>`:""}<p style="margin:0">${esc(r.text)}</p>${r.reply?`<div class="reply">Ответ: ${esc(r.reply.text)}</div>`:""}</div>`).join(""):`<p class="note" style="margin:0">Отзывов пока нет.</p>`;return}
  const v=myVendor();$("#rv-h").textContent="Отзывы о вас";if(!v){box.innerHTML="";return}const l=Object.values(PX.reviews).filter(r=>r.vendorId===v.id);
  box.innerHTML=l.length?l.map(r=>`<div class="rv">${revHtml(r)}${r.reply?"":`<form class="mini-form rv-reply" data-rid="${esc(r.id)}" novalidate><label>Публичный ответ <span class="hint">один раз, до 1000 символов</span><textarea rows="2" maxlength="1000"></textarea></label><div class="row"><button class="btn small" type="submit">Ответить</button><span class="msg err"></span></div></form>`}
    ${r.complaint?`<span class="note">Жалоба модератору отправлена ${fmtDate(r.complaint.at)}${r.complaint.status==="closed"?" · рассмотрена":""}</span>`:`<button class="btn ghost small" type="button" data-rvc="${esc(r.id)}" style="justify-self:start">Пожаловаться модератору</button>`}</div>`).join(""):`<p class="note" style="margin:0">Пока нет подтверждённых отзывов. Они появляются после подтверждённых заказов.</p>`;
  box.querySelectorAll(".rv-reply").forEach(f=>f.onsubmit=async e=>{e.preventDefault();const t=f.querySelector("textarea").value.trim();if(!t)return;try{await papi("/api/reviews/reply",{id:f.dataset.rid,text:t});PX.reviews[f.dataset.rid]={...PX.reviews[f.dataset.rid],reply:{text:t,at:nowIso()}};toast("Ответ опубликован");renderReviewsList()}catch(err){f.querySelector(".msg").textContent=err.message||errText(err)}});
  box.querySelectorAll("[data-rvc]").forEach(b=>b.onclick=async()=>{if(b.dataset.armed!=="1"){b.dataset.armed="1";b.insertAdjacentHTML("beforebegin",`<input class="rvc-t" maxlength="600" placeholder="Что нарушает правила?" style="min-height:36px;border:1px solid var(--line);border-radius:8px;padding:4px 8px">`);b.textContent="Отправить жалобу";return}
    const t=(b.parentElement.querySelector(".rvc-t")||{}).value||"";try{await papi("/api/reviews/complain",{id:b.dataset.rvc,text:t});toast("Жалоба отправлена модератору");PX.reviews[b.dataset.rvc]={...PX.reviews[b.dataset.rvc],complaint:{at:nowIso(),status:"open"}};renderReviewsList()}catch(err){toast(err.message||errText(err))}})}

/* ---------- уведомления и счётчики ---------- */
function plusNotifs(){const out=[];if(!window.SD_SERVER||!UID)return out;const t=todayStr();
  if(ROLE==="vendor"){const v=myVendor();
    myApps().forEach(a=>(a.history||[]).forEach(h=>{if(h.by!==UID&&h.status&&h.status!=="new")out.push({at:h.at,href:"#cabinet",text:"Заявка "+a.num+": "+(APP_ST_L[h.status]||h.status)+(h.comment?" — "+h.comment:"")})}));
    if(v){const pl=v._plan||{};if(pl.active&&pl.until&&daysTo(pl.until)<=7)out.push({at:new Date(Date.parse(pl.until)-7*864e5).toISOString(),href:"#cabinet",text:"«Партнёр +» действует до "+fmtDate(pl.until)+". Продлить можно через вкладку «Тариф»"});
      if(pl.expired)out.push({at:pl.until,href:"#cabinet",text:"Срок «Партнёр +» истёк: карточка осталась в каталоге бесплатно, архив сделок сохранён"});
      const s=PX.subs[v.id];((s&&s.changeHistory)||[]).forEach(h=>{if(h.action==="terms_approved")out.push({at:h.at,href:"#cabinet",text:"Условия скидки утверждены и показаны в каталоге"});if(h.action==="terms_rejected")out.push({at:h.at,href:"#cabinet",text:"Условия скидки не утверждены: "+(h.note||"")});if(h.action==="grant"&&h.by!=="system")out.push({at:h.at,href:"#cabinet",text:"Подключён «Партнёр +» до "+fmtDate(s.endAt)})});
      allReqs().filter(r=>r.mode==="direct"&&r.targetedVendorId===v.id&&r.publishedAt).forEach(r=>out.push({at:r.publishedAt,href:"#req-"+r.id,text:"Адресный запрос: "+catName(r.categoryId)+", "+fmtDate(r.eventDate)+", "+(r.city||"")}));
      myOrders().forEach(o=>{if(o.status==="requested")out.push({at:o.createdAt,href:"#cabinet",text:"Пара просит подтвердить заказ на "+fmtDate(o.eventDate)});if(["selected","confirmed"].includes(o.status)&&o.eventDate<=t&&!(o.confirm||{}).vendor)out.push({at:o.eventDate+"T12:00:00Z",href:"#cabinet",text:"Подтвердите выполнение заказа на "+fmtDate(o.eventDate)})});
      Object.values(PX.reviews).filter(r=>r.vendorId===v.id&&r.status==="published").forEach(r=>out.push({at:r.publishedAt,href:"#cabinet",text:"Новый отзыв: "+"★".repeat(r.rating)}))}}
  if(ROLE==="couple"){myOrders().forEach(o=>{if(["selected","confirmed"].includes(o.status)&&o.eventDate<=t&&!(o.confirm||{}).couple)out.push({at:o.eventDate+"T12:00:00Z",href:"#cabinet",text:"Подтвердите выполнение заказа у «"+o.vendorName+"» — после этого можно оставить отзыв"});
      (o.history||[]).forEach(h=>{if(h.side==="vendor"&&["accept","decline","done"].includes(h.type))out.push({at:h.at,href:"#cabinet",text:"«"+o.vendorName+"»: "+({accept:"заказ подтверждён",decline:"заказ не подтверждён",done:"выполнение подтверждено"}[h.type])})})});
    Object.values(PX.reviews).filter(r=>r.coupleUid===UID&&r.moderation).forEach(r=>out.push({at:r.moderation.at,href:"#cabinet",text:"Отзыв о «"+r.vendorName+"»: "+RV_ST_L[r.status].toLowerCase()+(r.status!=="published"&&r.moderation.reason?" — "+r.moderation.reason:"")}))}
  if(IS_OWNER){Object.values(PX.apps).filter(a=>a.status==="new").forEach(a=>out.push({at:a.submittedAt,href:"#cabinet",text:"Новая заявка на подключение "+a.num+": "+a.org}));
    allReqs().filter(r=>r.mode==="sos"&&r.sosEscalated&&reqStatus(r)==="open").forEach(r=>out.push({at:r.escalatedAt||r.lastWaveAt,href:"#req-"+r.id,text:"SOS без откликов: "+catName(r.categoryId)+", "+fmtDate(r.eventDate)}));
    Object.values(PX.reviews).filter(r=>r.status==="pending").forEach(r=>out.push({at:r.updatedAt,href:"#cabinet",text:"Отзыв на модерации: "+r.vendorName}));
    Object.values(PX.orders).filter(o=>o.status==="disputed").forEach(o=>out.push({at:((o.history||[]).slice(-1)[0]||{}).at,href:"#cabinet",text:"Разногласия по заказу: "+o.vendorName}))}
  return out}
if(typeof notifList==="function"){const _nl=notifList;notifList=function(){const base=_nl();const seen=seenAt("all");const extra=plusNotifs().filter(n=>n.at).map(n=>({...n,unread:String(n.at)>seen}));return[...base,...extra].sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,30)}}
if(typeof tabBadges==="function"){const _tb=tabBadges;tabBadges=function(){_tb();if(!window.SD_SERVER)return;const set=(t,n)=>{const b=document.querySelector(`.tabs button[data-t="${t}"]`);if(!b)return;b.querySelector(".cnt")?.remove();if(n)b.insertAdjacentHTML("beforeend",` <span class="cnt">${n}</span>`)};
  const v=myVendor(),t=todayStr();if(v&&ROLE==="vendor"){set("sos",allReqs().filter(r=>r.mode==="sos"&&reqStatus(r)==="open"&&(r.invited||[]).some(i=>i.vendorId===v.id)&&!mySosResp(r.id)&&!offersFor(r.id).some(o=>o.vendorId===v.id)).length)}
  set("orders",myOrders().filter(o=>(ROLE==="vendor"&&o.status==="requested")||(["selected","confirmed"].includes(o.status)&&o.eventDate<=t&&!(o.confirm||{})[ROLE==="couple"?"couple":"vendor"])).length);
  if(IS_OWNER){const b=document.querySelector('.tabs button[data-t="admin"] .cnt');const base=b?+b.textContent||0:0;set("admin",base+Object.values(PX.apps).filter(a=>a.status==="new").length+Object.values(PX.reviews).filter(r=>r.status==="pending").length+allReqs().filter(r=>r.mode==="sos"&&r.sosEscalated&&reqStatus(r)==="open").length+termsPending().length)}
  lockIcons()}}

/* ---------- панель организатора (ТЗ 4) ---------- */
const termsPending=()=>liveVendors.filter(v=>v._plan&&v._plan.active&&v._plan.termsStatus==="pending");
const ADM_SECS=[["overview","Обзор"],["apps","Заявки на подключение"],["subs","«Партнёр +» и скидки"],["ads","Реклама"],["reviews","Отзывы и заказы"],["sos","SOS"],["journal","Журнал"],["settings","Настройки"]];
let admSec=lsGet("sd-adm-sec","overview");
function renderAdminPlus(quiet){if(!IS_OWNER||!window.SD_SERVER)return;const root=$("#t-admin");if(!root)return;
  if(!$("#adm-nav")){const ov=document.createElement("div");ov.id="adm-sec-overview";ov.className="adm-sec";[...root.children].forEach(c=>ov.appendChild(c));root.appendChild(ov);
    root.insertAdjacentHTML("afterbegin",`<div class="adm-nav" id="adm-nav" role="tablist">${ADM_SECS.map(([k,l])=>`<button type="button" data-sec="${k}" aria-pressed="false">${l}<span class="cnt-sl"></span></button>`).join("")}</div>`);
    ADM_SECS.slice(1).forEach(([k])=>root.insertAdjacentHTML("beforeend",`<div class="adm-sec" id="adm-sec-${k}" hidden></div>`));
    $("#adm-nav").onclick=e=>{const b=e.target.closest("[data-sec]");if(!b)return;admSec=b.dataset.sec;lsSet("sd-adm-sec",admSec);renderAdminPlus()}}
  const cnt={apps:Object.values(PX.apps).filter(a=>a.status==="new").length,subs:termsPending().length,reviews:Object.values(PX.reviews).filter(r=>r.status==="pending"||(r.complaint&&r.complaint.status==="open")).length+Object.values(PX.orders).filter(o=>o.status==="disputed").length,sos:allReqs().filter(r=>r.mode==="sos"&&r.sosEscalated&&reqStatus(r)==="open").length};
  document.querySelectorAll("#adm-nav [data-sec]").forEach(b=>{b.setAttribute("aria-pressed",b.dataset.sec===admSec);const n=cnt[b.dataset.sec];b.querySelector(".cnt-sl").innerHTML=n?` <span class="cnt">${n}</span>`:""});
  ADM_SECS.forEach(([k])=>{const el=$("#adm-sec-"+k);if(el)el.hidden=k!==admSec});
  const el=$("#adm-sec-"+admSec);if(admSec==="overview"||!el||busyIn(el))return;
  const openIdx=[...el.querySelectorAll("details")].map((d,i)=>d.open?i:-1).filter(i=>i>=0);
  ({apps:admApps,subs:admSubs,ads:admAds,reviews:admReviews,sos:admSos,journal:quiet?()=>{}:admJournal,settings:admSettings})[admSec](el);
  const ds=el.querySelectorAll("details");openIdx.forEach(i=>{if(ds[i])ds[i].open=true})}
const vName=id=>(liveVendors.find(v=>v.id===id)||{}).name||"—";
let appFlt={st:"active",cat:"",src:"",q:""};
function admApps(el){const seen=seenAt("apps");let l=Object.values(PX.apps).sort((a,b)=>String(b.submittedAt).localeCompare(String(a.submittedAt)));
  const f=appFlt;if(f.st==="active")l=l.filter(a=>["new","in_work","need_info"].includes(a.status));else if(f.st)l=l.filter(a=>a.status===f.st);if(f.cat)l=l.filter(a=>a.category===f.cat);if(f.src)l=l.filter(a=>a.sourcePlacement===f.src);
  if(f.q){const q=f.q.toLowerCase();l=l.filter(a=>[a.num,a.org,a.contactName,a.contactEmail,a.contactPhone].join(" ").toLowerCase().includes(q))}
  const srcs=[...new Set(Object.values(PX.apps).map(a=>a.sourcePlacement))];
  el.innerHTML=`<div class="panel"><div class="row" style="justify-content:space-between"><h3>Заявки на сотрудничество</h3><span class="note">Новых: ${Object.values(PX.apps).filter(a=>a.status==="new").length} · уведомления — в кабинете (почта подключается отдельно)</span></div>
   <div class="flt"><select id="af-st" aria-label="Статус"><option value="active">Активные</option><option value="">Все</option>${Object.entries(APP_ST_L).map(([k,v])=>`<option value="${k}">${v}</option>`).join("")}</select>
   <select id="af-cat" aria-label="Раздел"><option value="">Все разделы</option>${CATS.map(c=>`<option value="${c.id}">${esc(c.n)}</option>`).join("")}</select>
   <select id="af-src" aria-label="Источник"><option value="">Все источники</option>${srcs.map(s=>`<option value="${esc(s)}">${esc(SRC_L[s]||s)}</option>`).join("")}</select><input id="af-q" type="search" placeholder="Поиск: номер, название, контакты" value="${esc(f.q)}"></div>
   <div class="list">${l.length?l.map(a=>`<details class="app-row" data-app="${esc(a.id)}"><summary><span><b>${esc(a.num)}</b> · ${esc(a.org)}${String(a.submittedAt)>seen?' <span class="unseen">новая</span>':""}</span><span class="st st-${APP_TONE[a.status]}">${APP_ST_L[a.status]}</span>
     <span class="note" style="flex-basis:100%">${a.requestedPlan==="AD"?"Реклама":"«Партнёр +»"} · ${esc(catName(a.category))} · ${fmtDate(a.submittedAt)} · источник: ${esc(SRC_L[a.sourcePlacement]||a.sourcePlacement)}</span></summary>
     <dl class="kv"><dt>Контакт</dt><dd>${esc(a.contactName||"—")}</dd><dt>Email</dt><dd>${esc(a.contactEmail)}</dd><dt>Телефон</dt><dd>${esc(a.contactPhone)}</dd><dt>Фестиваль</dt><dd>${esc(FEST_L[a.festivalStatus]||"—")}</dd><dt>Карточка</dt><dd>${a.vendorId?`<a href="#p-${esc(a.vendorId)}">${esc(vName(a.vendorId))}</a>`:"нет карточки"}</dd><dt>Комментарий</dt><dd>${esc(a.comment||"—")}</dd></dl>
     <details><summary>Журнал (${(a.history||[]).length})</summary><ul>${(a.history||[]).map(h=>`<li>${new Date(h.at).toLocaleString("ru-RU")} · ${APP_ST_L[h.status]||h.status}${h.comment?" · "+esc(h.comment):""}</li>`).join("")}</ul></details>
     <div class="app-acts"><input class="ap-com" maxlength="600" placeholder="Комментарий для заявителя (обязателен при отказе и уточнении)" style="min-height:40px;border:1px solid var(--line);border-radius:8px;padding:6px 10px;background:var(--bg);color:var(--ink)">
     <div class="row"><button class="btn ghost small" type="button" data-as="in_work">В работу</button><button class="btn ghost small" type="button" data-as="need_info">Требуется уточнение</button><button class="btn ghost small" type="button" data-as="rejected">Отклонить</button><button class="btn ghost small" type="button" data-as="closed">Закрыть</button>
     ${a.vendorId&&a.requestedPlan!=="AD"?`<button class="btn small" type="button" data-aplus="${esc(a.vendorId)}" data-appid="${esc(a.id)}">Активировать «Партнёр +»…</button>`:""}${a.requestedPlan==="AD"?`<button class="btn small" type="button" data-acamp="${esc(a.vendorId||"")}">Создать кампанию…</button>`:""}</div></div></details>`).join(""):`<div class="empty" style="min-height:100px">Заявок нет.</div>`}</div></div>`;
  $("#af-st").value=f.st;$("#af-cat").value=f.cat;$("#af-src").value=f.src;
  ["af-st","af-cat","af-src"].forEach(id=>$("#"+id).onchange=e=>{appFlt[{"af-st":"st","af-cat":"cat","af-src":"src"}[id]]=e.target.value;admApps(el)});$("#af-q").oninput=e=>{appFlt.q=e.target.value;clearTimeout(admApps.t);admApps.t=setTimeout(()=>{admApps(el);$("#af-q").focus()},300)};
  el.querySelectorAll("[data-as]").forEach(b=>b.onclick=async()=>{const row=b.closest("[data-app]");const com=row.querySelector(".ap-com").value.trim();b.disabled=true;
    try{const r=await papi("/api/admin/application",{id:row.dataset.app,status:b.dataset.as,comment:com});PX.apps[r.application.id]=r.application;toast("Статус: "+APP_ST_L[b.dataset.as]);admApps(el)}catch(err){toast(err.message||errText(err));b.disabled=false}});
  el.querySelectorAll("[data-aplus]").forEach(b=>b.onclick=()=>{admSec="subs";lsSet("sd-adm-sec","subs");PX.adm.plusFor={vendorId:b.dataset.aplus,applicationId:b.dataset.appid};renderAdminPlus()});
  el.querySelectorAll("[data-acamp]").forEach(b=>b.onclick=()=>{admSec="ads";lsSet("sd-adm-sec","ads");PX.adm.campEdit={id:"",vendorId:b.dataset.acamp};renderAdminPlus()});
  markSeen("apps")}
function planLabel(v){const p=v._plan||{};return p.active?(p.admitted?"«Партнёр +» до "+fmtDate(p.until):"«Партнёр +» без допуска"):p.expired?"истёк "+fmtDate(p.until):p.status==="suspended"?"приостановлен":p.status==="revoked"?"отозван":"FREE"}
const termsText=t=>t?`${t.discount&&t.discount.pct?"−"+t.discount.pct+"% "+(t.discount.cond||""):"без скидки"}${t.promo?" · промокод "+t.promo:""}${t.offer&&t.offer.title?" · спецпредложение «"+t.offer.title+"»"+(t.offer.until?" до "+fmtDate(t.offer.until):""):""}`:"—";
let subQ="";
function admSubs(el){const tp=termsPending();const pf=PX.adm.plusFor;const list=[...liveVendors].filter(v=>v.name).sort((a,b)=>String(a.name).localeCompare(String(b.name),"ru")).filter(v=>!subQ||(v.name+" "+catName(v.cat)).toLowerCase().includes(subQ.toLowerCase()));
  const P=PX.plans.PLUS||{},Fp=PX.plans.FREE||{};
  el.innerHTML=`${tp.length?`<div class="panel"><h3>Условия скидки на утверждении <span class="cnt">${tp.length}</span></h3><div class="list">${tp.map(v=>`<div class="ordr" data-tv="${esc(v.id)}"><b>${esc(v.name)}</b><span>Новые: ${esc(termsText(v._draft))}</span><span class="note">Сейчас в каталоге: ${esc(termsText((PX.subs[v.id]||{}).terms))}</span>
     <div class="row"><button class="btn small" type="button" data-ta="approve">Утвердить</button><input class="tn" maxlength="300" placeholder="Что исправить" style="min-height:36px;border:1px solid var(--line);border-radius:8px;padding:4px 8px;background:var(--bg);color:var(--ink)"><button class="btn ghost small" type="button" data-ta="reject">Вернуть с замечанием</button></div></div>`).join("")}</div></div>`:""}
   ${pf?admPlusForm(pf):""}
   <div class="panel"><div class="row" style="justify-content:space-between"><h3>Партнёры и статус программы</h3><input id="sub-q" type="search" placeholder="Поиск по названию или разделу" value="${esc(subQ)}" style="min-height:40px;border:1px solid var(--line);border-radius:8px;padding:6px 10px;background:var(--bg);color:var(--ink)"></div>
   <div class="tbl"><table><thead><tr><th>Партнёр</th><th>Раздел</th><th>Тариф</th><th>Допуск</th><th>Скидка</th><th>Источник</th><th></th></tr></thead><tbody>${list.map(v=>{const p=v._plan||{};return`<tr><td><a href="#p-${esc(v.id)}">${esc(v.name)}</a>${v.mod&&v.mod!=="approved"?' <span class="chip">'+(v.mod==="pending"?"на модерации":"отклонена")+"</span>":""}</td><td>${esc(catName(v.cat))}</td><td>${esc(planLabel(v))}</td><td>${p.participationVerified?"✓":"—"}</td><td>${p.termsStatus==="approved"&&p.discountApproved?"утверждена":p.termsStatus==="pending"?"на утверждении":"—"}</td><td>${esc(p.source||"")}</td><td><button class="btn ghost small" type="button" data-pv="${esc(v.id)}">Управлять</button></td></tr>`}).join("")}</tbody></table></div></div>
   <div class="two-col">${[["PLUS",P],["FREE",Fp]].map(([code,pl])=>`<form class="mini-form" data-plan="${code}" novalidate><h3 style="margin:0">Тариф ${code==="PLUS"?"«Партнёр +»":"FREE"}</h3><label>Название<input name="name" value="${esc(pl.name||"")}" maxlength="80"></label>
     <div class="g2"><label>Цена, ₽ <span class="hint">пусто — «${esc(PX.settings.plusPriceText||"условия уточняет организатор")}»</span><input name="priceRub" type="number" min="0" value="${pl.priceRub??""}"></label><label>Период<input name="billingPeriod" value="${esc(pl.billingPeriod||"")}" placeholder="месяц, сезон, год" maxlength="40"></label></div>
     <label>Возможности <span class="hint">по одной в строке</span><textarea name="features" rows="5">${esc((pl.features||[]).join("\n"))}</textarea></label><label class="chk"><input type="checkbox" name="isPublic" ${pl.isPublic!==false?"checked":""}> Показывать публично</label><label class="chk"><input type="checkbox" name="enabled" ${pl.enabled!==false?"checked":""}> Тариф включён</label>
     <p class="note" style="margin:0">Изменение цены не меняет уже оформленные подписки.</p><button class="btn small" type="submit" style="justify-self:start">Сохранить тариф</button></form>`).join("")}</div>`;
  $("#sub-q").oninput=e=>{subQ=e.target.value;clearTimeout(admSubs.t);admSubs.t=setTimeout(()=>{admSubs(el);$("#sub-q").focus()},300)};
  el.querySelectorAll("[data-pv]").forEach(b=>b.onclick=()=>{PX.adm.plusFor={vendorId:b.dataset.pv,applicationId:""};admSubs(el);el.scrollIntoView({behavior:"smooth"})});
  el.querySelectorAll("[data-ta]").forEach(b=>b.onclick=async()=>{const row=b.closest("[data-tv]");try{await papi("/api/admin/terms",{vendorId:row.dataset.tv,action:b.dataset.ta,note:row.querySelector(".tn").value});toast(b.dataset.ta==="approve"?"Условия утверждены":"Замечание отправлено");refreshSubs()}catch(err){toast(err.message||errText(err))}});
  el.querySelectorAll("[data-plan]").forEach(f=>f.onsubmit=async e=>{e.preventDefault();const code=f.dataset.plan,old=PX.plans[code]||{};const fd=new FormData(f);
    const doc={...old,code,name:fd.get("name"),priceRub:fd.get("priceRub")===""?null:+fd.get("priceRub"),billingPeriod:fd.get("billingPeriod"),features:String(fd.get("features")||"").split("\n").map(s=>s.trim()).filter(Boolean),isPublic:!!fd.get("isPublic"),enabled:!!fd.get("enabled"),createdAt:old.createdAt||nowIso(),updatedAt:nowIso()};
    try{await DB.doc("plans/"+code).set(doc);PX.plans[code]=doc;toast("Тариф сохранён")}catch(err){toast(errText(err))}});
  const pfF=$("#plus-f");if(pfF)bindPlusForm(pfF,el)}
function admPlusForm(pf){const v=liveVendors.find(x=>x.id===pf.vendorId);if(!v)return"";const s=PX.subs[v.id]||{};const p=v._plan||{};
  const start=(s.startAt&&p.active?s.startAt.slice(0,10):todayStr());const end=s.endAt?new Date(Date.parse(s.endAt)+3*36e5).toISOString().slice(0,10):(PX.settings.trialEnd||"");
  return`<form class="mini-form panel" id="plus-f" data-v="${esc(v.id)}" data-app="${esc(pf.applicationId||"")}" novalidate><div class="row" style="justify-content:space-between"><h3 style="margin:0">«Партнёр +»: ${esc(v.name)}</h3><button class="btn ghost small" type="button" id="pf-x">Закрыть</button></div>
   <p class="note" style="margin:0">Сейчас: ${esc(planLabel(v))}. Права включаются только после явного действия «Активировать». Два независимых условия: активный срок и подтверждённый допуск.${pf.applicationId?" Заявка "+esc((PX.apps[pf.applicationId]||{}).num||"")+" будет отмечена одобренной.":""}</p>
   <div class="g2"><label>Начало<input type="date" name="startAt" value="${esc(start)}"></label><label>Окончание<input type="date" name="endAt" value="${esc(end)}"></label></div>
   <label class="chk"><input type="checkbox" name="participationVerified" ${s.participationVerified?"checked":""}> Допуск подтверждён (участие или партнёрство с фестивалем)</label>
   <label class="chk"><input type="checkbox" name="discountApproved" ${s.discountApproved&&p.termsStatus==="approved"?"checked":""}> Утвердить текущие условия скидки: ${esc(termsText(v._draft))}</label>
   <div class="g2"><label>Основание<select name="source">${[["application","Заявка на подключение"],["festival","Участник фестиваля"],["trial","Пробный период"],["manual","Решение организатора"]].map(([k,l])=>`<option value="${k}" ${(s.source||(pf.applicationId?"application":"manual"))===k?"selected":""}>${l}</option>`).join("")}</select></label><label>Примечание<input name="note" maxlength="300" value=""></label></div>
   <div class="row"><button class="btn" type="submit">${p.active?"Сохранить изменения":"Активировать «Партнёр +»"}</button>${s.status==="active"?`<button class="btn ghost small" type="button" data-pa="suspend">Приостановить</button><button class="btn danger small" type="button" data-pa="revoke">Отозвать</button>`:s.status?`<button class="btn ghost small" type="button" data-pa="resume">Возобновить</button>`:""}<span class="msg err" id="pf-m"></span></div>
   ${(s.changeHistory||[]).length?`<details><summary>Журнал изменений (${s.changeHistory.length})</summary><ul>${s.changeHistory.slice().reverse().map(h=>`<li>${new Date(h.at).toLocaleString("ru-RU")} · ${esc(h.action)}${h.startAt?" · "+fmtDate(h.startAt)+"–"+fmtDate(h.endAt):""}${h.participationVerified!=null?" · допуск "+(h.participationVerified?"да":"нет"):""}${h.note?" · "+esc(h.note):""}</li>`).join("")}</ul></details>`:""}</form>`}
function bindPlusForm(f,el){$("#pf-x").onclick=()=>{PX.adm.plusFor=null;admSubs(el)};
  f.onsubmit=async e=>{e.preventDefault();const fd=new FormData(f);const m=$("#pf-m");m.textContent="";
    try{await papi("/api/admin/plus",{vendorId:f.dataset.v,action:"grant",startAt:fd.get("startAt"),endAt:fd.get("endAt"),participationVerified:!!fd.get("participationVerified"),discountApproved:fd.get("discountApproved")?true:false,source:fd.get("source"),note:fd.get("note"),applicationId:f.dataset.app||undefined});
      toast(fd.get("participationVerified")?"«Партнёр +» активирован":"Срок сохранён. Без подтверждённого допуска закрытые функции не включатся");PX.adm.plusFor=null;refreshSubs()}catch(err){m.textContent=err.message||errText(err)}};
  f.querySelectorAll("[data-pa]").forEach(b=>b.onclick=async()=>{if(b.dataset.armed!=="1"){b.dataset.armed="1";b.textContent="Подтвердить";return}try{await papi("/api/admin/plus",{vendorId:f.dataset.v,action:b.dataset.pa,note:new FormData(f).get("note")});toast("Готово");refreshSubs()}catch(err){toast(err.message||errText(err))}})}
let adStats=null,adRange={from:"",to:""};
async function loadAdStats(){try{adStats=await apiFetch("/api/admin/stats?from="+(adRange.from||"0000")+"&to="+(adRange.to||"9999"));const el=$("#adm-sec-ads");if(el&&!el.hidden&&!busyIn(el))admAds(el)}catch(_){}}
function admAds(el){const camps=Object.entries(PX.camps).map(([id,c])=>({id,...c})).sort((a,b)=>String(b.updatedAt||"").localeCompare(String(a.updatedAt||"")));const st=adStats||{campaigns:[],slots:{},vendors:[]};const cs=id=>(st.campaigns||[]).find(x=>x.id===id)||{views:0,clicks:0};
  const ed=PX.adm.campEdit;
  el.innerHTML=`<div class="panel"><h3>Рекламные места</h3><div class="tbl"><table><thead><tr><th>Место</th><th>Вкл.</th><th>Лимит</th><th>Устройства</th><th>Категории</th><th class="n">Показы</th><th class="n">Клики</th><th></th></tr></thead><tbody>${Object.keys(SLOT_L).map(code=>{const s=PX.slots[code]||{};const ss=(st.slots||{})[code]||{views:0,clicks:0};return`<tr data-slot="${code}"><td><b>${SLOT_L[code]}</b><br><small class="note">${code}</small></td><td><input type="checkbox" name="enabled" ${s.enabled!==false?"checked":""} aria-label="Включено"></td><td><input type="number" name="maxCards" min="1" max="6" value="${s.maxCards||1}" style="width:60px"></td><td><label class="chk"><input type="checkbox" name="desktop" ${(s.devices||["desktop"]).includes("desktop")?"checked":""}> ПК</label><label class="chk"><input type="checkbox" name="mobile" ${(s.devices||["mobile"]).includes("mobile")?"checked":""}> моб.</label></td><td><input name="categories" value="${esc((s.categories||[]).join(","))}" placeholder="все" style="width:120px" title="Коды разделов через запятую"></td><td class="n">${ss.views}</td><td class="n">${ss.clicks}</td><td><button class="btn ghost small" type="button" data-slot-save>Сохранить</button></td></tr>`}).join("")}</tbody></table></div>
   <p class="note" style="margin:0">По умолчанию — не больше одного большого баннера на экране и одного сквозного блока на странице. Реклама не показывается в формах, переписке, кабинете и SOS.</p></div>
   ${ed?campForm(ed):""}
   <div class="panel"><div class="row" style="justify-content:space-between"><h3>Кампании</h3><button class="btn small" type="button" id="camp-new">Новая кампания</button></div>
   <div class="flt"><label>С<input type="date" id="as-from" value="${esc(adRange.from)}"></label><label>По<input type="date" id="as-to" value="${esc(adRange.to)}"></label><button class="btn ghost small" type="button" id="as-go">Показать статистику</button><button class="btn ghost small" type="button" id="as-csv">Выгрузить CSV</button></div>
   <div class="tbl"><table><thead><tr><th>Кампания</th><th>Место</th><th>Статус</th><th>Период</th><th class="n">Показы</th><th class="n">Клики</th><th class="n">CTR</th><th></th></tr></thead><tbody>${camps.length?camps.map(c=>{const x=cs(c.id);return`<tr><td><b>${esc(c.title||"Без названия")}</b><br><small class="note">${esc(c.advertiser||"")}${c.vendorId?" · "+esc(vName(c.vendorId)):""}${c.exclusive?" · эксклюзив":""}</small></td><td>${SLOT_L[c.slot]||c.slot}</td><td>${CAMP_ST_L[c.status]||c.status}</td><td>${c.startAt?fmtDate(c.startAt):"—"} – ${c.endAt?fmtDate(c.endAt):"—"}</td><td class="n">${x.views}</td><td class="n">${x.clicks}</td><td class="n">${x.views?(x.clicks/x.views*100).toFixed(1)+"%":"—"}</td><td><button class="btn ghost small" type="button" data-ce="${esc(c.id)}">Изменить</button></td></tr>`}).join(""):`<tr><td colspan="8" class="note">Кампаний пока нет. Если их нет, рекламные блоки на сайте скрыты.</td></tr>`}</tbody></table></div></div>
   ${(st.vendors||[]).length?`<div class="panel"><h3>Просмотры карточек</h3><div class="tbl"><table><thead><tr><th>Партнёр</th><th class="n">Просмотры</th><th class="n">Контакты</th><th class="n">Показы в блоке</th><th class="n">Клики в блоке</th></tr></thead><tbody>${st.vendors.slice(0,30).map(v=>`<tr><td>${esc(v.name)}</td><td class="n">${v.page}</td><td class="n">${v.contact}</td><td class="n">${v.pin_view}</td><td class="n">${v.pin_click}</td></tr>`).join("")}</tbody></table></div></div>`:""}`;
  if(!adStats)loadAdStats();
  el.querySelectorAll("[data-slot-save]").forEach(b=>b.onclick=async()=>{const tr=b.closest("[data-slot]");const code=tr.dataset.slot;const q=n=>tr.querySelector(`[name="${n}"]`);const cats=q("categories").value.split(",").map(s=>s.trim()).filter(s=>CATS.some(c=>c.id===s));
    const doc={...(PX.slots[code]||{}),code,name:SLOT_L[code],enabled:q("enabled").checked,maxCards:Math.max(1,+q("maxCards").value||1),devices:[q("desktop").checked?"desktop":"",q("mobile").checked?"mobile":""].filter(Boolean),categories:cats,updatedAt:nowIso()};
    try{await DB.doc("adslots/"+code).set(doc);PX.slots[code]=doc;toast("Место сохранено")}catch(err){toast(errText(err))}});
  $("#camp-new").onclick=()=>{PX.adm.campEdit={id:""};admAds(el)};el.querySelectorAll("[data-ce]").forEach(b=>b.onclick=()=>{PX.adm.campEdit={id:b.dataset.ce};admAds(el);el.scrollIntoView({behavior:"smooth"})});
  $("#as-go").onclick=()=>{adRange={from:$("#as-from").value,to:$("#as-to").value};adStats=null;loadAdStats()};
  $("#as-csv").onclick=()=>{const rows=[["Кампания","Рекламодатель","Место","Статус","Начало","Окончание","Показы","Клики","CTR %"],...camps.map(c=>{const x=cs(c.id);return[c.title,c.advertiser||"",SLOT_L[c.slot]||c.slot,CAMP_ST_L[c.status]||c.status,c.startAt?fmtDate(c.startAt):"",c.endAt?fmtDate(c.endAt):"",x.views,x.clicks,x.views?(x.clicks/x.views*100).toFixed(1):""]})];
    const q=v=>{const s=String(v??"");return/[;"\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};const csv="﻿"+rows.map(r=>r.map(q).join(";")).join("\r\n");const u=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})),a=document.createElement("a");a.href=u;a.download="reklama-"+(adRange.from||"vse")+"-"+(adRange.to||todayStr())+".csv";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000)};
  const cf=$("#camp-f");if(cf)bindCampForm(cf,el)}
function campForm(ed){const c=ed.id?{...(PX.camps[ed.id]||{})}:{status:"draft",slot:"CAT_PINNED",weight:1,priority:0,categories:[],vendorId:ed.vendorId||""};
  return`<form class="mini-form panel" id="camp-f" data-id="${esc(ed.id||"")}" novalidate><div class="row" style="justify-content:space-between"><h3 style="margin:0">${ed.id?"Кампания: "+esc(c.title||""):"Новая кампания"}</h3><button class="btn ghost small" type="button" id="cf-x">Закрыть</button></div>
   <div class="g2"><label>Рекламодатель<input name="advertiser" maxlength="120" value="${esc(c.advertiser||"")}"></label><label>Маркировка (erid) <span class="hint">если требуется</span><input name="erid" maxlength="80" value="${esc(c.erid||"")}"></label></div>
   <div class="g2"><label>Место<select name="slot">${Object.entries(SLOT_L).map(([k,l])=>`<option value="${k}" ${c.slot===k?"selected":""}>${l}</option>`).join("")}</select></label><label>Карточка партнёра <span class="hint">для «В центре внимания», подборки, предложения недели</span><select name="vendorId"><option value="">— без карточки —</option>${[...liveVendors].filter(v=>v.name&&approved(v)&&v.visible!==false).sort((a,b)=>String(a.name).localeCompare(String(b.name),"ru")).map(v=>`<option value="${esc(v.id)}" ${c.vendorId===v.id?"selected":""}>${esc(v.name)}</option>`).join("")}</select></label></div>
   <label>Заголовок<input name="title" maxlength="120" value="${esc(c.title||"")}"></label><label>Текст<input name="text" maxlength="240" value="${esc(c.text||"")}"></label>
   <div class="g2"><label>Кнопка<input name="button" maxlength="40" value="${esc(c.button||"")}" placeholder="Подробнее"></label><label>Ссылка <span class="hint">карточка портала (#p-…) или https://</span><input name="link" maxlength="300" value="${esc(c.link||"")}"></label></div>
   <div class="g2"><label>Изображение 1600×400 <span class="hint">WebP/JPG/PNG</span><span class="row"><input type="file" accept="image/jpeg,image/png,image/webp" data-img="image"><span class="note" data-imgn="image">${c.image?"загружено":"нет"}</span></span></label><label>Мобильное 750×500<span class="row"><input type="file" accept="image/jpeg,image/png,image/webp" data-img="imageMobile"><span class="note" data-imgn="imageMobile">${c.imageMobile?"загружено":"нет"}</span></span></label></div>
   <label>Alt-текст изображения<input name="alt" maxlength="160" value="${esc(c.alt||"")}"></label>
   <label>Категории <span class="hint">пусто — все</span><select name="categories" multiple size="5">${CATS.map(x=>`<option value="${x.id}" ${(c.categories||[]).includes(x.id)?"selected":""}>${esc(x.n)}</option>`).join("")}</select></label>
   <div class="g2"><label>Начало<input type="date" name="startAt" value="${esc((c.startAt||"").slice(0,10))}"></label><label>Окончание<input type="date" name="endAt" value="${esc((c.endAt||"").slice(0,10))}"></label></div>
   <div class="g2"><label>Вес ротации<input type="number" name="weight" min="1" max="100" value="${c.weight||1}"></label><label>Приоритет<input type="number" name="priority" min="0" max="10" value="${c.priority||0}"></label></div>
   <label class="chk"><input type="checkbox" name="exclusive" ${c.exclusive?"checked":""}> Эксклюзивное размещение (резервирует место на период)</label>
   <label>Статус<select name="status">${CAMP_ST.map(s=>`<option value="${s}" ${c.status===s?"selected":""}>${CAMP_ST_L[s]}</option>`).join("")}</select></label>
   <div class="prev-ad" id="cf-prev"></div>
   <div class="row"><button class="btn" type="submit">Сохранить кампанию</button><span class="msg err" id="cf-m"></span></div>${(c.history||[]).length?`<details><summary>Журнал статусов</summary><ul>${c.history.map(h=>`<li>${new Date(h.at).toLocaleString("ru-RU")} · ${CAMP_ST_L[h.status]||h.status}</li>`).join("")}</ul></details>`:""}</form>`}
function bindCampForm(f,el){const imgs={image:(PX.camps[f.dataset.id]||{}).image||"",imageMobile:(PX.camps[f.dataset.id]||{}).imageMobile||""};
  const read=()=>{const fd=new FormData(f);const d=s=>s?new Date(s+(s.length===10?"T00:00:00+03:00":"")).toISOString():"";return{advertiser:fd.get("advertiser").trim(),erid:fd.get("erid").trim(),slot:fd.get("slot"),vendorId:fd.get("vendorId"),title:fd.get("title").trim(),text:fd.get("text").trim(),button:fd.get("button").trim(),link:fd.get("link").trim(),alt:fd.get("alt").trim(),
    categories:[...f.querySelector('[name="categories"]').selectedOptions].map(o=>o.value),startAt:d(fd.get("startAt")),endAt:fd.get("endAt")?new Date(fd.get("endAt")+"T23:59:59+03:00").toISOString():"",weight:+fd.get("weight")||1,priority:+fd.get("priority")||0,exclusive:!!fd.get("exclusive"),status:fd.get("status"),...imgs}};
  const prev=()=>{const c={id:"preview",...read(),marker:PX.settings.adMarker};$("#cf-prev").innerHTML=c.slot==="CAT_PINNED"||c.slot==="HOME_FEATURED"?(c.vendorId&&findV(c.vendorId)?`<div style="max-width:320px">${vcard(findV(c.vendorId),false)}</div><p class="note">Карточка партнёра с пометкой «${esc(c.marker||"Реклама")}»</p>`:`<p class="note">Для этого места выберите карточку партнёра.</p>`):bannerHtml(c,c.slot)};prev();f.addEventListener("input",()=>{f.dataset.dirty="1";prev()});
  $("#cf-x").onclick=()=>{PX.adm.campEdit=null;admAds(el)};
  f.querySelectorAll("[data-img]").forEach(i=>i.onchange=async()=>{const file=i.files[0];if(!file)return;try{const r=await ASSETS.upload(file);imgs[i.dataset.img]=r.id;f.querySelector(`[data-imgn="${i.dataset.img}"]`).textContent="загружено";prev()}catch(err){toast(err.message||"Не удалось загрузить")}});
  f.onsubmit=async e=>{e.preventDefault();const m=$("#cf-m");m.textContent="";const c=read();if(!c.title&&!c.vendorId){m.textContent="Укажите заголовок или карточку партнёра";return}if(["CAT_PINNED","HOME_FEATURED","WEEKLY_OFFER"].includes(c.slot)&&!c.vendorId){m.textContent="Для этого места нужна карточка партнёра";return}
    const id=f.dataset.id||("c"+Date.now().toString(36));const old=PX.camps[id]||{};
    try{await DB.doc("campaigns/"+id).set({...old,...c});delete f.dataset.dirty;PX.adm.campEdit=null;toast("Кампания сохранена");refreshSubs();adStats=null;admAds(el)}catch(err){m.textContent=String(err.message||"").startsWith("slot_conflict")?"Место занято эксклюзивной кампанией «"+String(err.message).split(":").slice(1).join(":")+"» на эти даты. Выберите другие даты или ротацию.":errText(err)}}}
function admReviews(el){const rs=Object.values(PX.reviews);const pend=rs.filter(r=>r.status==="pending"),comp=rs.filter(r=>r.complaint&&r.complaint.status==="open"),pub=rs.filter(r=>r.status==="published");const disp=Object.values(PX.orders).filter(o=>o.status==="disputed");
  const card=(r,acts)=>`<div class="ordr" data-rvid="${esc(r.id)}"><b>${esc(r.vendorName)} · ${"★".repeat(r.rating)}</b><span class="note">${RV_ST_L[r.status]} · ${fmtDate(r.updatedAt||r.createdAt)} · заказ подтверждён обеими сторонами</span><p style="margin:0">${esc(r.text)}</p>${r.complaint?`<span class="note">Жалоба подрядчика: ${esc(r.complaint.text||"без текста")}</span>`:""}<div class="row"><input class="rv-why" maxlength="300" placeholder="Причина (обязательна для скрытия)" style="min-height:36px;border:1px solid var(--line);border-radius:8px;padding:4px 8px;background:var(--bg);color:var(--ink)">${acts}</div></div>`;
  el.innerHTML=`<div class="panel"><h3>Отзывы на модерации (${pend.length})</h3><div class="list">${pend.map(r=>card(r,`<button class="btn small" type="button" data-ra="publish">Опубликовать</button><button class="btn ghost small" type="button" data-ra="reject">Отклонить</button>`)).join("")||'<span class="note">Очередь пуста.</span>'}</div></div>
   <div class="panel"><h3>Жалобы подрядчиков (${comp.length})</h3><div class="list">${comp.map(r=>card(r,`<button class="btn ghost small" type="button" data-ra="publish" data-close="1">Оставить отзыв</button><button class="btn danger small" type="button" data-ra="hide" data-close="1">Скрыть отзыв</button>`)).join("")||'<span class="note">Жалоб нет.</span>'}</div></div>
   <div class="panel"><h3>Разногласия по заказам (${disp.length})</h3><div class="list">${disp.map(o=>`<div class="ordr" data-oid="${esc(o.id)}"><b>${esc(o.vendorName)} · ${fmtDate(o.eventDate)}</b><span class="note">${(o.history||[]).filter(h=>h.type==="dispute").map(h=>esc((h.side==="couple"?"Пара: ":"Подрядчик: ")+(h.note||"без комментария"))).join("; ")}</span><div class="row"><input class="od-n" maxlength="300" placeholder="Комментарий" style="min-height:36px;border:1px solid var(--line);border-radius:8px;padding:4px 8px;background:var(--bg);color:var(--ink)"><button class="btn small" type="button" data-od="completed_verified">Подтвердить выполнение</button><button class="btn ghost small" type="button" data-od="cancelled">Отменить заказ</button></div></div>`).join("")||'<span class="note">Разногласий нет.</span>'}</div></div>
   <div class="panel"><h3>Опубликованные (${pub.length})</h3><div class="list">${pub.slice(0,50).map(r=>card(r,`<button class="btn ghost small" type="button" data-ra="hide">Скрыть</button>`)).join("")||'<span class="note">Пока нет.</span>'}</div></div>`;
  el.querySelectorAll("[data-ra]").forEach(b=>b.onclick=async()=>{const row=b.closest("[data-rvid]");try{await papi("/api/admin/review",{id:row.dataset.rvid,action:b.dataset.ra,reason:row.querySelector(".rv-why").value,closeComplaint:!!b.dataset.close});toast("Готово");refreshSubs()}catch(err){toast(err.message||errText(err))}});
  el.querySelectorAll("[data-od]").forEach(b=>b.onclick=async()=>{const row=b.closest("[data-oid]");try{await papi("/api/admin/order",{id:row.dataset.oid,status:b.dataset.od,note:row.querySelector(".od-n").value});toast("Готово");refreshSubs()}catch(err){toast(err.message||errText(err))}})}
function admSos(el){const l=allReqs().filter(r=>r.mode==="sos").sort((a,b)=>(reqStatus(a)==="open"?0:1)-(reqStatus(b)==="open"?0:1)||String(a.eventDate).localeCompare(String(b.eventDate)));
  el.innerHTML=`<div class="panel"><h3>Очередь SOS</h3><p class="note" style="margin:0">Волны: сначала участники «Партнёр +» в городе пары, затем шире; занятые в календаре исключаются. Без откликов после последней волны — эскалация организатору.</p>
   <div class="tbl"><table><thead><tr><th>Заявка</th><th>Срочность</th><th>Дата</th><th>Город</th><th class="n">Волна</th><th class="n">Приглашено</th><th class="n">Откликов</th><th>Статус</th></tr></thead><tbody>${l.length?l.map(r=>`<tr><td><a href="#req-${esc(r.id)}">№ ${shortId(r.id)} · ${esc(catName(r.categoryId))}</a>${r.sosEscalated?' <span class="chip plus">эскалация</span>':""}${r.sosStopped?' <span class="chip">остановлена</span>':""}</td><td>${esc(URG_L[r.urgency]||"")}</td><td>${fmtDate(r.eventDate)} ${esc(r.eventTime||"")}<br><small class="note">${daysTo(r.eventDate+"T23:00:00")} дн.</small></td><td>${esc(r.city||"")}</td><td class="n">${r.waves||0}</td><td class="n">${(r.invited||[]).length}</td><td class="n">${offersFor(r.id).filter(o=>o.status!=="withdrawn").length}</td><td>${REQ_ST[reqStatus(r)]}</td></tr>`).join(""):`<tr><td colspan="8" class="note">Срочных заявок не было.</td></tr>`}</tbody></table></div></div>`}
async function admJournal(el){el.innerHTML=`<div class="panel"><h3>Журнал действий</h3><p class="note">Загружаем…</p></div>`;try{const j=await apiFetch("/api/admin/journal?limit=300");
  el.innerHTML=`<div class="panel"><div class="row" style="justify-content:space-between"><h3>Журнал действий</h3><button class="btn ghost small" type="button" id="jr-r">Обновить</button></div><p class="note" style="margin:0">Кто, когда и что изменил: статусы, тарифы, кампании, отзывы, заявки. Без входов в аккаунт.</p><div class="tbl"><table><thead><tr><th>Когда</th><th>Кто</th><th>Действие</th><th>Объект</th></tr></thead><tbody>${j.rows.map(r=>`<tr><td>${new Date(r.at).toLocaleString("ru-RU")}</td><td>${esc(r.email||r.uid||"система")}</td><td>${esc(r.action)}</td><td><small>${esc(r.target||"")}</small></td></tr>`).join("")}</tbody></table></div></div>`;$("#jr-r").onclick=()=>admJournal(el)}catch(e){el.innerHTML=`<div class="panel">${esc(errText(e))}</div>`}}
function admSettings(el){const s=PX.settings,F2=s.features||{};const FL={plus:"Уровни FREE / «Партнёр +»",ads:"Реклама и «В центре внимания»",favorites:"Избранное пар",direct:"Адресный запрос",calendar:"Календарь занятости",sos:"Свадебный SOS",reviews:"Заказы и отзывы",seo:"Индексация поисковиками"};
  el.innerHTML=`<form class="mini-form panel" id="set-f" novalidate><h3 style="margin:0">Настройки портала</h3><p class="note" style="margin:0">Меняются без правки кода. Выключенная функция скрывается из интерфейса и отключается на сервере.</p>
   <fieldset style="border:0;padding:0"><legend>Функции</legend>${Object.entries(FL).map(([k,l])=>`<label class="chk"><input type="checkbox" name="f_${k}" ${F2[k]!==false?"checked":""}> ${l}</label>`).join("")}</fieldset>
   <div class="g2"><label>Карточек в «В центре внимания» на телефоне<input type="number" name="pinnedMobile" min="0" max="4" value="${s.pinnedMobile??2}"></label><label>…на компьютере<input type="number" name="pinnedDesktop" min="0" max="6" value="${s.pinnedDesktop??3}"></label></div>
   <div class="g2"><label>Карточек до «Показать ещё»<input type="number" name="firstPage" min="6" max="48" value="${s.firstPage??12}"></label><label>Пометка рекламы<input name="adMarker" maxlength="40" value="${esc(s.adMarker||"Реклама")}"></label></div>
   <label class="chk"><input type="checkbox" name="excludePinnedFromOrganic" ${s.excludePinnedFromOrganic!==false?"checked":""}> Не повторять карточки из «В центре внимания» в общей выдаче</label><label class="chk"><input type="checkbox" name="plusRotation" ${s.plusRotation===true?"checked":""}> Участники «Партнёр +» занимают невыкупленные места по ротации</label>
   <div class="g2"><label>Минимальная видимая площадь для показа, %<input type="number" name="viewMinPct" min="10" max="100" value="${s.viewMinPct??50}"></label><label>Минимальное время показа, мс<input type="number" name="viewMinMs" min="0" max="10000" step="100" value="${s.viewMinMs??1000}"></label></div>
   <div class="g2"><label>Календарь вперёд, месяцев<input type="number" name="calendarMonths" min="6" max="36" value="${s.calendarMonths??18}"></label><label>Пауза между волнами SOS, мин<input type="number" name="sosWaveMinutes" min="5" max="1440" value="${s.sosWaveMinutes??30}"></label></div>
   <div class="g2"><label>Волн SOS до эскалации<input type="number" name="sosMaxWaves" min="1" max="5" value="${s.sosMaxWaves??3}"></label><label class="chk" style="align-self:end"><input type="checkbox" name="sosAutoPublish" ${s.sosAutoPublish!==false?"checked":""}> Ускоренная публикация SOS (антиспам)</label></div>
   <div class="g2"><label>Отзыв: минимум символов<input type="number" name="reviewMin" min="10" max="500" value="${s.reviewMin??50}"></label><label>Отзыв: максимум символов<input type="number" name="reviewMax" min="200" max="5000" value="${s.reviewMax??1500}"></label></div>
   <label>Текст о стоимости «Партнёр +», если цена не задана<input name="plusPriceText" maxlength="160" value="${esc(s.plusPriceText||"")}"></label>
   <div class="row"><button class="btn" type="submit">Сохранить настройки</button><span class="msg" id="set-m"></span></div></form>`;
  const f=$("#set-f");f.oninput=()=>f.dataset.dirty="1";f.onsubmit=async e=>{e.preventDefault();const fd=new FormData(f);const n=k=>+fd.get(k);
    const doc={...s,features:Object.fromEntries(Object.keys(FL).map(k=>[k,!!fd.get("f_"+k)])),pinnedMobile:n("pinnedMobile"),pinnedDesktop:n("pinnedDesktop"),firstPage:n("firstPage"),adMarker:fd.get("adMarker")||"Реклама",excludePinnedFromOrganic:!!fd.get("excludePinnedFromOrganic"),plusRotation:!!fd.get("plusRotation"),
      viewMinPct:n("viewMinPct"),viewMinMs:n("viewMinMs"),calendarMonths:n("calendarMonths"),sosWaveMinutes:n("sosWaveMinutes"),sosMaxWaves:n("sosMaxWaves"),sosAutoPublish:!!fd.get("sosAutoPublish"),reviewMin:n("reviewMin"),reviewMax:n("reviewMax"),plusPriceText:fd.get("plusPriceText"),updatedAt:nowIso()};
    try{await DB.doc("settings/main").set(doc);PX.settings=doc;delete f.dataset.dirty;$("#set-m").textContent="Сохранено";render()}catch(err){$("#set-m").textContent=errText(err)}}}

PLUS_READY=true;
