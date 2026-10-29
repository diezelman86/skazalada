/* ---------- server mode: own hosting (сказала-да.рф), API + email/password ---------- */
function apiFetch(url,opt){opt=opt||{};return fetch(url,{credentials:"same-origin",...opt,headers:{"Content-Type":"application/json","X-SD":"1",...(opt.headers||{})}})
  .then(async r=>{const j=await r.json().catch(()=>({}));if(!r.ok)throw{code:r.status===401?"auth":(j.code||"unavailable"),message:j.error||"",status:r.status};return j})}
const encP=p=>encodeURIComponent(p);
const SUBS=new Set();
const snapDoc=(id,data)=>({id,exists:data!=null,data:()=>data==null?undefined:data,metadata:{fromCache:false,hasPendingWrites:false}});
const randId=()=>Math.random().toString(36).slice(2,10)+Date.now().toString(36);
const SDB={
  doc(p){const id=p.split("/").pop();return{id,path:p,
    async get(){const j=await apiFetch("/api/doc?path="+encP(p));return snapDoc(id,j.data)},
    async set(d){await apiFetch("/api/doc?path="+encP(p),{method:"PUT",body:JSON.stringify({data:d})});refreshSubs()},
    async update(d){const cur=(await this.get()).data()||{};await this.set({...cur,...d})},
    async delete(){await apiFetch("/api/doc?path="+encP(p),{method:"DELETE"});refreshSubs()},
    onSnapshot(cb,errCb){const s={kind:"doc",p,cb,errCb};SUBS.add(s);runSub(s);return()=>SUBS.delete(s)},
    collection(c){return SDB.collection(p+"/"+c)}}},
  collection(c){const q={where:[],lim:0};const api={path:c,
    where(f,op,v){q.where.push([f,op,v]);return api},limit(n){q.lim=n;return api},orderBy(){return api},
    doc(id){return SDB.doc(c+"/"+(id||randId()))},
    async get(){const j=await apiFetch("/api/col?path="+encP(c)+(q.where.length?"&where="+encP(JSON.stringify(q.where)):""));
      let docs=j.docs.map(d=>snapDoc(d.id,d.data));if(q.lim)docs=docs.slice(0,q.lim);return{docs,size:docs.length,empty:!docs.length,docChanges:()=>[],metadata:{fromCache:false}}},
    onSnapshot(cb,errCb){const s={kind:"col",api,cb,errCb};SUBS.add(s);runSub(s);return()=>SUBS.delete(s)}};return api}};
async function runSub(s){try{s.cb(s.kind==="doc"?await SDB.doc(s.p).get():await s.api.get())}catch(e){if(e&&e.code==="auth"){location.reload();return}}}
let subTimer=null;function refreshSubs(){clearTimeout(subTimer);subTimer=setTimeout(()=>SUBS.forEach(runSub),120)}
setInterval(()=>{if(!document.hidden&&SUBS.size)SUBS.forEach(runSub)},10000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)refreshSubs()});
addEventListener("hashchange",()=>{if(SUBS.size)refreshSubs()});
let ME=null;

function authHtml(){return`<div class="auth">
  <div class="auth-intro"><h3>Вход в личный кабинет</h3><p>При регистрации выберите, кто вы. От этого зависит, что будет в кабинете: пара оформляет дисконтную карту и размещает заявки, подрядчик ведёт карточку в каталоге, отвечает на заявки и проверяет карты пар.</p></div>
  <div class="auth-forms">
  <form class="f panel" id="login-f" novalidate><h3>Войти</h3>
    <label for="lg-email">Email<input id="lg-email" type="email" autocomplete="email" required></label>
    <label for="lg-pass">Пароль<input id="lg-pass" type="password" autocomplete="current-password" required></label>
    <div class="row"><button class="btn" type="submit">Войти</button><span class="msg err" id="lg-msg"></span></div>
    <p class="note" style="margin:0">Забыли пароль? Напишите организатору <a href="https://vk.ru/club109353383" target="_blank" rel="noopener">во ВКонтакте</a>, он выдаст временный.</p></form>
  <form class="f panel" id="reg-f" novalidate><h3>Регистрация</h3>
    <fieldset class="role-pick"><legend>Кто вы?</legend>${rolePickHtml("rg-role")}</fieldset>
    <label for="rg-email">Email<input id="rg-email" type="email" autocomplete="email" required></label>
    <div class="g2"><label for="rg-pass">Пароль <span class="hint">от 8 символов</span><input id="rg-pass" type="password" autocomplete="new-password" required></label>
    <label for="rg-pass2">Повторите пароль<input id="rg-pass2" type="password" autocomplete="new-password" required></label></div>
    <label class="chk" style="font-weight:500;color:var(--ink)"><input id="rg-consent" type="checkbox"> <span>Согласен на обработку персональных данных по <a href="#privacy">политике конфиденциальности</a></span></label>
    <div class="row"><button class="btn" type="submit">Зарегистрироваться</button><span class="msg err" id="rg-msg"></span></div></form>
  </div></div>`}
function bindAuth(){const L=$("#login-f"),R=$("#reg-f");if(!L)return;
  const pref=sessGet("sd-role-pref");if(pref){const i=document.querySelector(`input[name="rg-role"][value="${pref}"]`);if(i)i.checked=true}
  L.onsubmit=async e=>{e.preventDefault();$("#lg-msg").textContent="";try{await apiFetch("/api/auth/login",{method:"POST",body:JSON.stringify({email:$("#lg-email").value,password:$("#lg-pass").value})});location.hash="cabinet";location.reload()}catch(err){$("#lg-msg").textContent=err.message||"Не удалось войти"}};
  R.onsubmit=async e=>{e.preventDefault();const m=$("#rg-msg");m.textContent="";
    if($("#rg-pass").value!==$("#rg-pass2").value){m.textContent="Пароли не совпадают";return}
    if(!pickedRole("rg-role")){m.textContent="Выберите, кто вы: пара или подрядчик";return}
    if(!$("#rg-consent").checked){m.textContent="Отметьте согласие на обработку персональных данных";return}
    try{await apiFetch("/api/auth/register",{method:"POST",body:JSON.stringify({email:$("#rg-email").value,password:$("#rg-pass").value,consent:true,role:pickedRole("rg-role")})});location.hash="cabinet";location.reload()}catch(err){m.textContent=err.message||"Не удалось зарегистрироваться"}}}
/* ---------- роли: пара или подрядчик ---------- */
function rolePickHtml(name){return`<label class="role-opt"><input type="radio" name="${name}" value="couple"><span><b>Мы пара</b><small>Дисконтная карта, заявки подрядчикам, предложения и переписка</small></span></label>
  <label class="role-opt"><input type="radio" name="${name}" value="vendor"><span><b>Я подрядчик</b><small>Карточка в каталоге, заявки пар и отклики, проверка карт</small></span></label>`}
const pickedRole=name=>{const i=document.querySelector(`input[name="${name}"]:checked`);return i?i.value:""};
const ROLE_NAME={couple:"пара",vendor:"подрядчик"};
function roleChooser(){$("#cab-on").hidden=true;$("#cab-off").hidden=false;$("#cab-off").classList.remove("empty");
  $("#cab-lead").textContent="Выберите, кто вы. От этого зависит, что будет в вашем кабинете.";
  $("#cab-off").innerHTML=`<form class="f panel" id="role-f" novalidate style="max-width:640px"><h3>Кто вы?</h3><fieldset class="role-pick">${rolePickHtml("cr-role")}</fieldset>
    <p class="note" style="margin:0">Роль выбирается один раз. Если ошиблись, напишите организатору, он поменяет.</p>
    <div class="row"><button class="btn" type="submit">Продолжить</button><span class="msg err" id="cr-msg"></span></div></form>`;
  $("#role-f").onsubmit=async e=>{e.preventDefault();const r=pickedRole("cr-role");if(!r){$("#cr-msg").textContent="Выберите вариант";return}
    try{await apiFetch("/api/me/role",{method:"POST",body:JSON.stringify({role:r})});location.hash="cabinet";location.reload()}catch(err){$("#cr-msg").textContent=err.message||"Не удалось сохранить"}}}
function accountBar(){if(!ME||$("#acct"))return;
  $("#cab-lead").insertAdjacentHTML("afterend",`<div class="acct" id="acct"><span>Вы вошли как <b>${esc(ME.email)}</b> · ${ME.isAdmin?"организатор":ROLE_NAME[ME.role]||"роль не выбрана"}</span>
    <details><summary>Аккаунт</summary><form class="f" id="pw-f" novalidate><label for="pw-old">Текущий пароль<input id="pw-old" type="password" autocomplete="current-password"></label><label for="pw-new">Новый пароль<input id="pw-new" type="password" autocomplete="new-password"></label><button class="btn small" type="submit">Сменить пароль</button></form>
    <form class="f" id="del-f" novalidate><label for="del-pass">Удалить аккаунт и личные данные <span class="hint">введите пароль</span><input id="del-pass" type="password" autocomplete="current-password"></label><button class="btn danger small" type="submit">Удалить аккаунт</button></form></details>
    <button class="btn ghost small" type="button" id="logout">Выйти</button></div>`);
  $("#logout").onclick=async()=>{try{await apiFetch("/api/auth/logout",{method:"POST"})}catch(_){}location.reload()};
  $("#pw-f").onsubmit=async e=>{e.preventDefault();try{await apiFetch("/api/auth/password",{method:"POST",body:JSON.stringify({old:$("#pw-old").value,password:$("#pw-new").value})});toast("Пароль изменён");$("#pw-old").value=$("#pw-new").value=""}catch(err){toast(err.message||"Не удалось сменить пароль")}};
  $("#del-f").onsubmit=async e=>{e.preventDefault();const b=e.submitter;if(b.dataset.armed!=="1"){b.dataset.armed="1";b.textContent="Точно удалить? Это необратимо";return}
    try{await apiFetch("/api/me",{method:"DELETE",body:JSON.stringify({password:$("#del-pass").value})});location.hash="catalog";location.reload()}catch(err){toast(err.message||"Не удалось удалить аккаунт")}}}
function adminTools(){if(!ME||!ME.isAdmin||$("#adm-users"))return;
  $("#t-admin").insertAdjacentHTML("beforeend",`<div class="panel" id="adm-users" style="margin-top:20px"><h3>Пользователи</h3>
   <form class="f" id="rp-f" novalidate style="grid-template-columns:minmax(0,1fr) auto;align-items:end"><label for="rp-email">Сбросить пароль (выдаст временный)<input id="rp-email" type="email"></label><button class="btn ghost" type="submit">Сбросить</button></form>
   <p class="msg ok" id="rp-out"></p>
   <form class="f" id="sr-f" novalidate style="grid-template-columns:minmax(0,1fr) auto auto;align-items:end"><label for="sr-email">Сменить роль пользователя<input id="sr-email" type="email" placeholder="email"></label><select id="sr-role" aria-label="Роль"><option value="couple">Пара</option><option value="vendor">Подрядчик</option></select><button class="btn ghost" type="submit">Сменить</button></form>
   <form class="f" id="as-f" novalidate><label for="as-vendor">Передать карточку каталога партнёру<select id="as-vendor"></select></label><label for="as-email">Email зарегистрированного партнёра<input id="as-email" type="email"></label><div class="row"><button class="btn ghost" type="submit">Передать</button></div></form>
   <details><summary id="us-sum">Зарегистрированы</summary><div class="list" id="us-list"></div></details></div>`);
  const fillV=()=>{$("#as-vendor").innerHTML=liveVendors.map(v=>`<option value="${esc(v.id)}">${esc(v.name)}${v.demo?" (демо)":""}</option>`).join("")};fillV();setInterval(fillV,20000);
  $("#rp-f").onsubmit=async e=>{e.preventDefault();try{const j=await apiFetch("/api/admin/reset-password",{method:"POST",body:JSON.stringify({email:$("#rp-email").value})});$("#rp-out").textContent="Временный пароль: "+j.password+" — передайте его пользователю, он сменит пароль в разделе «Аккаунт»."}catch(err){$("#rp-out").textContent=err.message||"Не удалось"}};
  $("#sr-f").onsubmit=async e=>{e.preventDefault();try{await apiFetch("/api/admin/set-role",{method:"POST",body:JSON.stringify({email:$("#sr-email").value,role:$("#sr-role").value})});toast("Роль изменена. Пользователю нужно обновить страницу.");loadUsers()}catch(err){toast(err.message||"Не удалось сменить роль")}};
  $("#as-f").onsubmit=async e=>{e.preventDefault();try{await apiFetch("/api/admin/assign-vendor",{method:"POST",body:JSON.stringify({vendorId:$("#as-vendor").value,email:$("#as-email").value})});toast("Карточка передана партнёру");refreshSubs()}catch(err){toast(err.message||"Не удалось передать")}};
  const loadUsers=()=>apiFetch("/api/admin/users").then(j=>{const l=j.users.filter(u=>!u.disabled),n=r=>l.filter(u=>u.role===r).length;$("#us-sum").textContent=`Зарегистрированы: ${l.length} (пар ${n("couple")}, подрядчиков ${n("vendor")})`;$("#us-list").innerHTML=l.map(u=>`<div class="rl"><b>${esc(u.email)}</b><span class="amt">${ROLE_NAME[u.role]||"без роли"} · ${fmtDate(u.created)}</span></div>`).join("")}).catch(()=>{});loadUsers();
  cardsRegistry()}

/* ---------- Реестр дисконтных карт (только организатор) ---------- */
let REG=[];
function cardsRegistry(){
  $("#t-admin").insertAdjacentHTML("afterbegin",`<div class="panel reg" id="reg" style="margin-bottom:20px">
   <div class="row" style="justify-content:space-between"><h3>Реестр карт <span class="note" id="reg-count"></span></h3>
   <div class="row"><button class="btn ghost small" type="button" id="reg-refresh">Обновить</button><button class="btn small" type="button" id="reg-csv">Выгрузить в Excel</button></div></div>
   <div class="row reg-tools"><input id="reg-q" type="search" placeholder="Поиск: номер, имена, телефон, email" aria-label="Поиск по реестру карт">
   <select id="reg-f" aria-label="Фильтр"><option value="all">Все карты</option><option value="used">Использованные</option><option value="unused">Ни разу не использованы</option><option value="blocked">Заблокированные</option></select></div>
   <div class="tbl"><table><thead><tr><th>Номер</th><th>Пара</th><th>Дата свадьбы</th><th>Телефон</th><th>Email</th><th>Оформлена</th><th class="n">Использований</th><th class="n">Сумма, ₽</th><th>Последнее</th><th>Статус</th></tr></thead><tbody id="reg-body"><tr><td colspan="10" class="note">Загружаем реестр…</td></tr></tbody></table></div>
   <p class="note" style="margin:0">Реестр видите только вы. Телефоны и почты — персональные данные: не пересылайте выгрузку третьим лицам.</p></div>`);
  const load=()=>apiFetch("/api/admin/cards").then(j=>{REG=j.cards;drawReg()}).catch(e=>{$("#reg-body").innerHTML=`<tr><td colspan="10" class="note">${esc(e.message||"Не удалось загрузить реестр")}</td></tr>`});
  $("#reg-refresh").onclick=load;$("#reg-q").oninput=drawReg;$("#reg-f").onchange=drawReg;
  $("#reg-csv").onclick=()=>{const rows=regFiltered();if(!rows.length){toast("Нет карт для выгрузки");return}
    const head=["Номер карты","Пара","Дата свадьбы","Телефон","Email","Город","Оформлена","Использований","Сумма заказов, ₽","Последнее использование","Партнёры","Статус"];
    const q=v=>{const s=String(v??"");return/[;"\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
    const csv="﻿"+[head,...rows.map(c=>[c.num,c.names,c.date?fmtDate(c.date):"",c.phone,c.email,c.city,fmtDate(c.createdAt),c.uses,c.sum,c.lastUse?fmtDate(c.lastUse):"",c.vendors.join(", "),regStatus(c)])].map(r=>r.map(q).join(";")).join("\r\n");
    const u=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})),a=document.createElement("a");a.href=u;a.download="reestr-kart-"+new Date().toISOString().slice(0,10)+".csv";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),5000)};
  load();
}
const regStatus=c=>c.deleted?"аккаунт удалён":c.blocked?"заблокирована":"действует";
function regFiltered(){const q=($("#reg-q").value||"").trim().toLowerCase(),f=$("#reg-f").value;
  return REG.filter(c=>(f==="all"||(f==="used"&&c.uses)||(f==="unused"&&!c.uses)||(f==="blocked"&&c.blocked))&&(!q||[c.num,c.names,c.phone,c.email,c.city].join(" ").toLowerCase().includes(q)))}
function drawReg(){const l=regFiltered();$("#reg-count").textContent=REG.length?`${l.length} из ${REG.length}`:"";
  $("#reg-body").innerHTML=l.length?l.map(c=>`<tr><td><a href="#check-${esc(c.num)}">${esc(c.num)}</a></td><td>${esc(c.names||"—")}</td><td>${c.date?fmtDate(c.date):"—"}</td><td>${esc(c.phone||"—")}</td><td>${esc(c.email||"—")}</td><td>${fmtDate(c.createdAt)}</td><td class="n">${c.uses}</td><td class="n">${c.sum?fmtRub(c.sum):"—"}</td><td>${c.lastUse?fmtDate(c.lastUse):"—"}</td><td><span class="st st-${c.blocked||c.deleted?"bad":"ok"}">${regStatus(c)}</span></td></tr>`).join("")
   :`<tr><td colspan="10" class="note">${REG.length?"Ничего не найдено. Измените поиск или фильтр.":"Карт пока нет. Они появятся, когда пары оформят карту в кабинете."}</td></tr>`}

async function startServer(){
  LIVE=true;DB=SDB;setLiveLabels();
  document.querySelectorAll("#concept-toggle,#guide-open").forEach(b=>b.hidden=true);
  const ft=document.querySelector(".site-footer .wrap > span");if(ft)ft.innerHTML='© 2026 #СказалаДа!<br><a href="#privacy">Политика конфиденциальности</a>';
  try{ME=(await apiFetch("/api/me")).user}catch(_){ME=null}
  DB.collection("vendors").onSnapshot(s=>{liveVendors=s.docs.map(d=>({id:d.id,...d.data()}));liveLoaded=true;renderAll()});
  if(!ME){$("#cab-off").innerHTML=authHtml();$("#cab-off").classList.remove("empty");bindAuth();cabState();renderPhotos();route();return}
  UID=ME.id;IS_OWNER=!!ME.isAdmin;CAN_WRITE=true;ROLE=IS_OWNER?null:ME.role||"none";
  if(ROLE==="none"){accountBar();roleChooser();route();return}
  USER={id:async()=>ME.id,isOwner:async()=>!!ME.isAdmin,canEdit:async()=>!!ME.isAdmin,can:async()=>true};
  ASSETS={async upload(file){const r=await fetch("/api/upload",{method:"POST",credentials:"same-origin",headers:{"Content-Type":file.type||"application/octet-stream","X-SD":"1"},body:file});const j=await r.json().catch(()=>({}));if(!r.ok)throw{code:j.code||"unavailable",message:j.error||""};return j}};
  $("#tab-admin").hidden=!IS_OWNER;cabState();renderPhotos();accountBar();adminTools();
  DB.doc("data/users/"+UID+"/profile").onSnapshot(s=>{profile=s.exists?JSON.parse(JSON.stringify(s.data())):{};renderCouple();renderQRViews();ensureCardDoc()});
  ["requests","offers","messages"].forEach(col=>DB.collection(col).onSnapshot(s=>{BR[col]={};s.docs.forEach(d=>BR[col][d.id]=d.data());renderBroker()}));
  DB.collection("freedates").onSnapshot(s=>{FD={};s.docs.forEach(d=>FD[d.id]=d.data());renderFree();renderBroker();if(location.hash.startsWith("#p-"))renderVendorPage(findV(location.hash.slice(3)),false)});
  DB.collection("redemptions").onSnapshot(s=>{QR.reds={};s.docs.forEach(d=>QR.reds[d.id]=d.data());renderQRViews()});
  if(IS_OWNER){DB.collection("complaints").onSnapshot(s=>{BR.complaints={};s.docs.forEach(d=>BR.complaints[d.id]=d.data());renderBroker()});
    DB.collection("cards").onSnapshot(s=>{QR.cards={};s.docs.forEach(d=>QR.cards[d.id]=d.data());renderQRViews()});
    DB.collection("blocks").onSnapshot(s=>{QR.blocks={};s.docs.forEach(d=>QR.blocks[d.id]=d.data());renderQRViews()})}
  route();
}
