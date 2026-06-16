/* Gidget — daily spending tracker on real calendar weeks, with savings goals.
   index.html is just the shell; all logic + save/export lives here. */
"use strict";
const STORE_KEY = "gidget-v1";
const WEEK_START_DAY = 0; // 0 = Sunday

const usd  = n => (Number(n)||0).toLocaleString("en-US",{style:"currency",currency:"USD"});
const uid  = () => Math.random().toString(36).slice(2,9);
const sum  = a => a.reduce((s,x)=>s+(Number(x.amount)||0),0);
const esc  = s => String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const numv = v => parseFloat(String(v||"").replace(/,/g,"."))||0;
const round2 = n => Math.round((Number(n)||0)*100)/100;

/* ---- dates ---- */
const isoDate = d => { const x=new Date(d), p=n=>String(n).padStart(2,"0");
  return x.getFullYear()+"-"+p(x.getMonth()+1)+"-"+p(x.getDate()); };
const parseISO = s => { const a=String(s).split("-").map(Number); return new Date(a[0],(a[1]||1)-1,a[2]||1); };
const addDays = (d,n) => { const x=new Date(d); x.setDate(x.getDate()+n); return x; };
function startOfWeek(d){ const x=new Date(d); x.setHours(0,0,0,0);
  x.setDate(x.getDate()-((x.getDay()-WEEK_START_DAY+7)%7)); return x; }
const mo = d => d.toLocaleString("en-US",{month:"short"});
function fmtRange(startISO){ const s=parseISO(startISO), e=addDays(s,6);
  return s.getMonth()===e.getMonth()
    ? `${mo(s)} ${s.getDate()} – ${e.getDate()}`
    : `${mo(s)} ${s.getDate()} – ${mo(e)} ${e.getDate()}`; }
const yearOf = startISO => String(parseISO(startISO).getFullYear());
const fmtDay = iso => { const d=parseISO(iso); return d.toLocaleString("en-US",{weekday:"short"})+" "+d.getDate(); };
const dateStamp = () => isoDate(new Date());

const DEFAULTS = {
  income: ["Paycheck 1","Paycheck 2"],
  bills: ["Rent","Utilities","Phone","Internet","Insurance","Subscriptions"]
};

let state = load();

function load(){
  try{
    const r = localStorage.getItem(STORE_KEY);
    if(r){ const d = JSON.parse(r); return { weeks:d.weeks||[], goals:d.goals||[], ui:{tab:"budget",weekIndex:0,stale:false} }; }
  }catch(e){}
  return { weeks:[], goals:[], ui:{tab:"budget",weekIndex:0,stale:false} };
}
function save(){
  try{ localStorage.setItem(STORE_KEY, JSON.stringify({weeks:state.weeks, goals:state.goals})); }catch(e){}
}
function commit(){ save(); render(); }

/* ---------- computation ---------- */
function cashTotals(){
  const out=[]; let prev=0;
  state.weeks.forEach((w,i)=>{
    const canCarry = i>0;
    const start = (w.startOverride!=null) ? Number(w.startOverride) : (canCarry?prev:0);
    const income = sum(w.income);
    const expenses = sum(w.bills)+sum(w.spending);
    const setAside = sum(w.setAside);
    const cashEnding = start + income - expenses - setAside;
    out.push({start,income,expenses,setAside,cashEnding,carried:(w.startOverride==null)&&canCarry});
    prev = cashEnding;
  });
  return out;
}
function weekIndexOf(id){ if(!id) return null; const i=state.weeks.findIndex(w=>w.id===id); return i<0?null:i; }
function contributions(goalId, through){
  let t=0;
  state.weeks.forEach((w,i)=>{ if(through!=null && i>through) return;
    t += w.setAside.filter(a=>a.goalId===goalId).reduce((s,a)=>s+(Number(a.amount)||0),0); });
  return t;
}
function reserveNow(g){ return contributions(g.id,null) - (g.spent||0); }
function projected(g){ const idx=weekIndexOf(g.targetWeekId);
  return (idx!=null ? contributions(g.id,idx) : contributions(g.id,null)) - (g.spent||0); }
function totalReservesNow(){ return state.goals.reduce((s,g)=>s+reserveNow(g),0); }
function reservesThrough(idx){ return state.goals.reduce((s,g)=>s+(contributions(g.id,idx)-(g.spent||0)),0); }

/* ---------- week creation & calendar advance ---------- */
function newWeekFrom(src, startISO){
  // Blank week except: carried balance, goals (global), and items the user marked recurring.
  const keep    = arr => (arr||[]).filter(x=>x.recurring).map(x=>({id:uid(),label:x.label,amount:x.amount,recurring:true}));
  const keepSet = arr => (arr||[]).filter(a=>a.recurring).map(a=>({id:uid(),goalId:a.goalId,amount:a.amount,recurring:true}));
  return { id:uid(), startDate:startISO, startOverride:null,
    income:keep(src.income), bills:keep(src.bills), spending:[], setAside:keepSet(src.setAside) };
}
function createFirstWeek(seed){
  const mk = ls => seed ? ls.map(l=>({id:uid(),label:l,amount:0,recurring:true})) : [];
  state.weeks=[{ id:uid(), startDate:isoDate(startOfWeek(new Date())), startOverride:0,
    income:mk(DEFAULTS.income), bills:mk(DEFAULTS.bills), spending:[], setAside:[] }];
  state.ui.weekIndex=0; state.ui.stale=false; commit();
}
function addWeek(){
  const last=state.weeks[state.weeks.length-1];
  if(!last){ createFirstWeek(false); return; }
  const start = isoDate(addDays(parseISO(last.startDate), 7));
  state.weeks.push(newWeekFrom(last, start));
  state.ui.weekIndex=state.weeks.length-1; commit();
}
function startFresh(){
  const cur = isoDate(startOfWeek(new Date()));
  const last = state.weeks[state.weeks.length-1];
  state.ui.stale=false;
  if(!last){ createFirstWeek(true); return; }
  if(last.startDate === cur){ state.ui.weekIndex=state.weeks.length-1; commit(); editStart(); return; }
  const w = newWeekFrom(last, cur);
  state.weeks.push(w);
  state.ui.weekIndex=state.weeks.length-1;
  commit();
  editStart(); // let the user set the true current balance after a gap
}
function autoAdvance(){
  if(state.weeks.length===0) return;
  const cur = isoDate(startOfWeek(new Date()));
  const last = state.weeks[state.weeks.length-1];
  if(!last.startDate){ state.ui.weekIndex=state.weeks.length-1; return; }
  if(last.startDate >= cur){ state.ui.weekIndex=state.weeks.length-1; return; }
  const nextOfLast = isoDate(addDays(parseISO(last.startDate),7));
  if(cur === nextOfLast){
    state.weeks.push(newWeekFrom(last, cur));   // consecutive week → advance automatically
    state.ui.weekIndex=state.weeks.length-1; save();
  }else{
    state.ui.stale=true;                        // missed a week or more → offer a fresh start
    state.ui.weekIndex=state.weeks.length-1;
  }
}

/* ---------- render ---------- */
function render(){
  const v=document.getElementById("view");
  const keep=v.scrollTop;
  const t=state.ui.tab;
  v.innerHTML = t==="goals" ? renderGoals() : t==="overview" ? renderOverview() : renderBudget();
  v.scrollTop=keep;
  document.querySelectorAll(".tab").forEach(b=> b.classList.toggle("active", b.dataset.tabkey===t));
}

function renderBudget(){
  if(state.weeks.length===0) return emptyBudget();
  let i=Math.max(0,Math.min(state.ui.weekIndex,state.weeks.length-1));
  state.ui.weekIndex=i;
  const week=state.weeks[i];
  const t=cashTotals()[i];
  const banner = state.ui.stale
    ? `<div class="banner"><span>It's a new week and a few have passed. Start fresh from this week?</span>
        <span class="bannerbtns"><button class="bannerbtn" data-action="app:fresh">Start fresh</button>
        <button class="bannerx" data-action="app:dismissstale" aria-label="Dismiss">×</button></span></div>`
    : "";
  return hero(week,i,t) + `<div class="scroll">` + banner
    + sectionCard("spending",week)
    + sectionCard("income",week)
    + sectionCard("bills",week)
    + setAsideCard(week)
    + summaryCard(t)
    + `<div class="footer">
         <button class="primary" data-action="week:new">+ New week</button>
         <button class="ghostbtn" data-action="app:data">Save &amp; export</button>
       </div>`
    + `</div>`;
}

function hero(week,i,t){
  const n=state.weeks.length, reserves=totalReservesNow();
  const sub = reserves>0 ? `<div class="sub">${usd(reserves)} set aside · ${usd(t.cashEnding+reserves)} total</div>` : "";
  return `<header class="hero">
    <div class="brandrow"><span class="logo">Gidget</span></div>
    <div class="nav">
      <button class="navbtn" data-action="week:prev" ${i===0?"disabled":""} aria-label="Previous week">‹</button>
      <button class="title" data-action="week:settings">
        <div class="eyebrow">${esc(yearOf(week.startDate))}</div>
        <div class="wl">${esc(fmtRange(week.startDate))}</div>
      </button>
      <button class="navbtn" data-action="week:next" ${i===n-1?"disabled":""} aria-label="Next week">›</button>
    </div>
    <div class="balwrap">
      <div class="eyebrow">Cash on hand</div>
      <div class="bal" style="color:${t.cashEnding<0?"var(--neg)":"#fff"}">${usd(t.cashEnding)}</div>
      ${sub}
    </div>
  </header>`;
}

function sectionCard(kind,week){
  const title={income:"Income",bills:"Bills",spending:"Spending"}[kind];
  const items=week[kind], tot=sum(items);
  let list=items;
  if(kind==="spending"){ list=items.slice().sort((a,b)=>String(a.date||"").localeCompare(String(b.date||""))); }
  let rows = kind==="income" ? startingRow() : "";
  list.forEach(it=>{
    const day = (kind==="spending" && it.date) ? `<span class="daytag">${esc(fmtDay(it.date))}</span>` : "";
    rows += `<div class="irow">`
      + `<button class="rowmain" data-action="item:edit" data-section="${kind}" data-id="${it.id}">${day}<span class="lbl">${esc(it.label)}</span></button>`
      + `<button class="rowamt amt" data-action="item:editamount" data-section="${kind}" data-id="${it.id}">${usd(it.amount)}</button>`
      + `</div>`;
  });
  rows += `<button class="row add" style="color:var(--${kind})" data-action="item:add" data-section="${kind}">
    <span><span class="plus">+</span>Add ${title.toLowerCase()}</span></button>`;
  return `<section class="card">
    <div class="bar ${kind}"><span>${title.toUpperCase()}</span><span class="amt">${usd(tot)}</span></div>
    <div class="rows">${rows}</div></section>`;
}

function startingRow(){
  const t=cashTotals()[state.ui.weekIndex];
  const chip = t.carried ? `<span class="chip">carried</span>` : "";
  return `<button class="row" data-action="start:edit">
    <span>Starting balance${chip}</span><span class="amt">${usd(t.start)}</span></button>`;
}

function setAsideCard(week){
  const tot=sum(week.setAside);
  let rows="";
  if(state.goals.length===0){
    rows=`<div class="hint">Create a goal in the Goals tab to start setting money aside toward it.</div>`;
  }else{
    week.setAside.forEach(a=>{
      const g=state.goals.find(x=>x.id===a.goalId);
      rows += `<div class="irow">`
        + `<button class="rowmain" data-action="setaside:edit" data-id="${a.id}"><span class="lbl">${esc(g?g.name:"Goal")}</span></button>`
        + `<button class="rowamt amt" data-action="setaside:editamount" data-id="${a.id}">${usd(a.amount)}</button>`
        + `</div>`;
    });
    rows += `<button class="row add" style="color:var(--setaside)" data-action="setaside:add">
      <span><span class="plus">+</span>Set aside money</span></button>`;
  }
  return `<section class="card">
    <div class="bar setaside"><span>SET ASIDE</span><span class="amt">${usd(tot)}</span></div>
    <div class="rows">${rows}</div></section>`;
}

function summaryCard(t){
  const sr=(l,v,c)=>`<div class="srow"><span style="color:${c}">${l}</span><span class="amt" style="color:${c}">${usd(v)}</span></div>`;
  return `<section class="card summary">
    ${sr("Starting balance",t.start,"var(--muted)")}
    ${sr("+ Income",t.income,"var(--income)")}
    ${sr("− Expenses",t.expenses,"var(--red)")}
    ${sr("− Set aside",t.setAside,"var(--setaside)")}
    <div class="rule"></div>
    <div class="row total"><span>Cash on hand</span>
      <span class="amt" style="color:${t.cashEnding<0?"var(--red)":"var(--ink)"}">${usd(t.cashEnding)}</span></div>
  </section>`;
}

function emptyBudget(){
  return `<div class="empty"><div class="emptycard">
    <div class="sun"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/></svg></div>
    <div class="biglogo">Gidget</div>
    <p class="tagline">Track what you spend each day and always know your cash on hand. Mark income and bills as recurring once, and each new week starts ready.</p>
    <button class="primary block" data-action="create:seeded">Create first week</button>
    <button class="textbtn" data-action="create:blank">or start blank</button>
  </div></div>`;
}

/* ---------- render: goals ---------- */
function renderGoals(){
  let body;
  if(state.goals.length===0){
    body=`<div class="empty"><div class="emptycard">
      <h1>No goals yet</h1>
      <p>Add a goal like &ldquo;Vacation&rdquo; with a target and a deadline. Then set money aside toward it in the Budget tab.</p>
      <button class="primary block" data-action="goal:add">Add a goal</button>
    </div></div>`;
  }else{
    body=state.goals.map(goalCard).join("");
  }
  return `<header class="bar2"><h2>Goals</h2><button class="iconbtn" data-action="goal:add" aria-label="Add goal">+</button></header>
    <div class="pad">${body}</div>`;
}

function goalCard(g){
  const reserve=reserveNow(g), proj=projected(g);
  const pct = g.target>0 ? Math.min(Math.max(reserve/g.target,0),1) : 0;
  const deadline=state.weeks.find(w=>w.id===g.targetWeekId);
  let dl;
  if(deadline){
    const onTrack=proj>=g.target;
    dl = `<div class="dl ${onTrack?"good":"bad"}">${onTrack
      ? "On track for "+esc(fmtRange(deadline.startDate))+" — projected "+usd(proj)
      : "Short "+usd(g.target-proj)+" by "+esc(fmtRange(deadline.startDate))}</div>`;
  }else{
    dl=`<div class="dl muted">No deadline set</div>`;
  }
  const spent = (g.spent>0) ? `<div class="muted small" style="margin-top:6px">${usd(g.spent)} already spent from this goal</div>` : "";
  return `<section class="card goal">
    <div class="goalhead"><h3>${esc(g.name)}</h3>
      <div class="goalbtns">
        <button class="minibtn" data-action="goal:edit" data-id="${g.id}">Edit</button>
        <button class="minibtn" data-action="goal:spend" data-id="${g.id}">Spend</button>
        <button class="minibtn danger" data-action="goal:delete" data-id="${g.id}">Delete</button>
      </div>
    </div>
    <div class="bartrack"><div class="barfill" style="width:${(pct*100).toFixed(1)}%"></div></div>
    <div class="goalrow"><span class="strong">${usd(reserve)} of ${usd(g.target)}</span><span class="muted">${Math.round(pct*100)}%</span></div>
    ${spent}${dl}
  </section>`;
}

/* ---------- render: overview ---------- */
function renderOverview(){
  if(state.weeks.length===0){
    return `<header class="bar2"><h2>Overview</h2></header>
      <div class="empty"><p class="muted center">Add weeks in the Budget tab to see your projection.</p></div>`;
  }
  const totals=cashTotals();
  const reserves=totalReservesNow();
  let summary="";
  if(state.goals.length>0){
    const rows=state.goals.map(g=>`<div class="srow"><span>${esc(g.name)}</span>
      <span class="amt" style="color:var(--setaside)">${usd(reserveNow(g))} / ${usd(g.target)}</span></div>`).join("");
    summary=`<section class="card" style="padding:6px 16px 14px">
      <div class="pad-s muted">RESERVES</div>${rows}
      <div class="rule"></div>
      <div class="srow strong"><span>Total set aside</span>
        <span class="amt" style="color:var(--setaside)">${usd(reserves)}</span></div></section>`;
  }
  const weekRows=state.weeks.map((w,idx)=>{
    const t=totals[idx];
    const extra = reserves>0 ? `<div class="small muted">${usd(t.cashEnding+reservesThrough(idx))} in account</div>` : "";
    return `<div class="orow">
      <div><div>${esc(fmtRange(w.startDate))}</div><div class="small muted">${esc(yearOf(w.startDate))}</div></div>
      <div class="oright"><div class="amt" style="font-weight:800;color:${t.cashEnding<0?"var(--red)":"var(--ink)"}">${usd(t.cashEnding)}</div>${extra}</div>
    </div>`;
  }).join("");
  return `<header class="bar2"><h2>Overview</h2></header>
    <div class="pad">${summary}
      <section class="card">
        <div class="bar gold"><span>WEEK</span><span>CASH ON HAND</span></div>
        <div class="rows">${weekRows}</div></section>
    </div>`;
}

/* ---------- modal ---------- */
function modal(title, bodyHTML, onSave, opts){
  opts = opts || {};
  const root=document.createElement("div");
  root.className="overlay";
  const saveBtn = opts.noSave ? "<span style='width:52px'></span>" : `<button class="textbtn save" data-x="save">Save</button>`;
  root.innerHTML=`<div class="sheet">
    <div class="sheethead">
      <button class="textbtn" data-x="cancel">Cancel</button>
      <strong>${esc(title)}</strong>
      ${saveBtn}
    </div>
    <div class="sheetbody">${bodyHTML}</div></div>`;
  document.body.appendChild(root);
  const close=()=>{ root.remove(); document.removeEventListener("keydown",onKey); };
  const onKey=e=>{ if(e.key==="Escape") close(); };
  document.addEventListener("keydown",onKey);
  root.addEventListener("click",e=>{
    if(e.target===root){ close(); return; }
    const x=e.target.closest("[data-x]"); if(!x) return;
    const k=x.dataset.x;
    if(k==="cancel") close();
    else if(k==="save"){ if(onSave(root)!==false) close(); }
    else if(k==="delete"){ if(opts.onDelete) opts.onDelete(); close(); }
    else if(opts.onExtra){ opts.onExtra(k, close); }
  });
  const f=root.querySelector("input,select"); if(f) f.focus();
  return {root, close};
}
const moneyField = (label,id,val)=>`<label class="fld">${label}<div class="money"><span>$</span><input id="${id}" inputmode="decimal" value="${val==null?"":val}" placeholder="0.00"></div></label>`;

/* ---------- editors ---------- */
function editItem(section,id){
  const week=state.weeks[state.ui.weekIndex];
  const ex = id ? week[section].find(x=>x.id===id) : null;
  const title={income:"Income",bills:"Bills",spending:"Spending"}[section];
  const canRecur = section==="income" || section==="bills";
  const dateField = section==="spending"
    ? `<label class="fld">Day<input id="m-date" type="date" value="${ex&&ex.date?esc(ex.date):dateStamp()}"></label>` : "";
  const recurField = canRecur
    ? `<label class="fldrow"><input type="checkbox" id="m-recur" ${(!ex || ex.recurring!==false)?"checked":""}> Recurring — carries to each new week</label>` : "";
  const body=`<label class="fld">Description<input id="m-label" type="text" value="${ex?esc(ex.label):""}" placeholder="Description"></label>
    ${moneyField("Amount","m-amt", ex?ex.amount:"")}
    ${dateField}
    ${recurField}
    ${ex?`<button class="delbtn" data-x="delete">Delete</button>`:""}`;
  modal(ex?`Edit ${title}`:`Add ${title}`, body, root=>{
    const label=(root.querySelector("#m-label").value||"").trim()||"Untitled";
    const amount=numv(root.querySelector("#m-amt").value);
    const date = section==="spending" ? (root.querySelector("#m-date").value||dateStamp()) : undefined;
    const recur = canRecur ? root.querySelector("#m-recur").checked : undefined;
    if(ex){ ex.label=label; ex.amount=amount; if(section==="spending") ex.date=date; if(canRecur) ex.recurring=recur; }
    else { const it={id:uid(),label,amount}; if(section==="spending") it.date=date; if(canRecur) it.recurring=recur; week[section].push(it); }
    commit();
  }, { onDelete:()=>{ week[section]=week[section].filter(x=>x.id!==id); commit(); } });
}

function editAmount(section,id){
  const week=state.weeks[state.ui.weekIndex];
  const ex=week[section].find(x=>x.id===id); if(!ex) return;
  modal((ex.label||"Item")+" — amount", moneyField("Amount","m-amt",ex.amount), root=>{
    ex.amount=numv(root.querySelector("#m-amt").value); commit();
  });
}
function editSetAsideAmount(id){
  const week=state.weeks[state.ui.weekIndex];
  const ex=week.setAside.find(a=>a.id===id); if(!ex) return;
  const g=state.goals.find(x=>x.id===ex.goalId);
  modal((g?g.name:"Set aside")+" — amount", moneyField("Amount","m-amt",ex.amount), root=>{
    ex.amount=numv(root.querySelector("#m-amt").value); commit();
  });
}

function editStart(){
  const i=state.ui.weekIndex, week=state.weeks[i], t=cashTotals()[i], canCarry=i>0;
  const body=`${moneyField("Starting balance","m-amt", t.start)}
    ${canCarry?`<button class="linkbtn" data-x="carry">↺ Use carried balance from last week</button>`:""}`;
  modal("Starting balance", body, root=>{
    week.startOverride=numv(root.querySelector("#m-amt").value); commit();
  }, { onExtra:(k,close)=>{ if(k==="carry"){ week.startOverride=null; commit(); close(); } } });
}

function editSetAside(id){
  if(state.goals.length===0) return;
  const week=state.weeks[state.ui.weekIndex];
  const ex = id ? week.setAside.find(a=>a.id===id) : null;
  const opts=state.goals.map(g=>`<option value="${g.id}" ${ex&&ex.goalId===g.id?"selected":""}>${esc(g.name)}</option>`).join("");
  const body=`<label class="fld">Goal<select id="m-goal">${opts}</select></label>
    ${moneyField("Amount","m-amt", ex?ex.amount:"")}
    <label class="fldrow"><input type="checkbox" id="m-recur" ${(!ex || ex.recurring!==false)?"checked":""}> Recurring — carries to each new week</label>
    <p class="note">Money you set aside leaves your cash on hand and builds this goal's reserve.</p>
    ${ex?`<button class="delbtn" data-x="delete">Remove</button>`:""}`;
  modal(ex?"Edit set aside":"Set aside", body, root=>{
    const goalId=root.querySelector("#m-goal").value;
    const amount=numv(root.querySelector("#m-amt").value);
    const recur=root.querySelector("#m-recur").checked;
    if(ex){ ex.goalId=goalId; ex.amount=amount; ex.recurring=recur; } else week.setAside.push({id:uid(),goalId,amount,recurring:recur});
    commit();
  }, { onDelete:()=>{ week.setAside=week.setAside.filter(a=>a.id!==id); commit(); } });
}

function editWeek(){
  const i=state.ui.weekIndex, week=state.weeks[i];
  const body=`<label class="fld">Week start date<input id="m-date" type="date" value="${esc(week.startDate)}"></label>
    <p class="note">Each week runs 7 days from its start date. Changing this only relabels the week.</p>
    <button class="delbtn" data-x="delete">Delete this week</button>`;
  modal("Edit week", body, root=>{
    const v=root.querySelector("#m-date").value; if(v) week.startDate=v; commit();
  }, { onDelete:()=>{
    const removed=week.id; state.weeks.splice(i,1);
    state.goals.forEach(g=>{ if(g.targetWeekId===removed) g.targetWeekId=null; });
    state.ui.weekIndex=Math.max(0,i-1); commit();
  }});
}

function editGoal(id){
  const ex = id ? state.goals.find(g=>g.id===id) : null;
  const wkOpts=`<option value="">No deadline</option>`+state.weeks.map(w=>
    `<option value="${w.id}" ${ex&&ex.targetWeekId===w.id?"selected":""}>${esc(fmtRange(w.startDate))}, ${esc(yearOf(w.startDate))}</option>`).join("");
  const body=`<label class="fld">Name<input id="m-name" value="${ex?esc(ex.name):""}" placeholder="e.g. Vacation"></label>
    ${moneyField("Target","m-target", ex?ex.target:"")}
    <label class="fld">Deadline (optional)<select id="m-week">${wkOpts}</select></label>
    ${ex?`<button class="delbtn" data-x="delete">Delete goal</button>`:""}`;
  modal(ex?"Edit goal":"New goal", body, root=>{
    const name=(root.querySelector("#m-name").value||"").trim();
    if(!name) return false;
    const target=numv(root.querySelector("#m-target").value);
    const wk=root.querySelector("#m-week").value||null;
    if(ex){ ex.name=name; ex.target=target; ex.targetWeekId=wk; }
    else state.goals.push({id:uid(),name,target,targetWeekId:wk,spent:0});
    commit();
  }, { onDelete:()=>removeGoal(id) });
}
function removeGoal(id){
  state.goals=state.goals.filter(g=>g.id!==id);
  state.weeks.forEach(w=>{ w.setAside=w.setAside.filter(a=>a.goalId!==id); });
  commit();
}
function recordSpend(id){
  const g=state.goals.find(x=>x.id===id); if(!g) return;
  const avail=reserveNow(g);
  const body=`${moneyField("Amount","m-amt","")}
    <p class="note">${usd(avail)} available in ${esc(g.name)}. Spending here draws down the reserve and does not change your cash on hand.</p>`;
  modal("Record spend", body, root=>{
    g.spent=(g.spent||0)+numv(root.querySelector("#m-amt").value); commit();
  });
}

/* ---------- save & export ---------- */
function downloadBlob(filename, mime, content){
  const blob = content instanceof Blob ? content : new Blob([content], {type:mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1500);
}
function pickFile(accept, cb){
  const inp=document.createElement("input");
  inp.type="file"; inp.accept=accept;
  inp.onchange=()=>{ if(inp.files && inp.files[0]) cb(inp.files[0]); };
  inp.click();
}
function saveBackup(){
  const data = JSON.stringify({app:"gidget", version:2, weeks:state.weeks, goals:state.goals}, null, 2);
  downloadBlob("gidget-backup-"+dateStamp()+".json", "application/json", data);
}
function restoreBackup(file){
  const r=new FileReader();
  r.onload=()=>{
    try{
      const d=JSON.parse(r.result);
      if(!d || !Array.isArray(d.weeks)) throw new Error("bad");
      state.weeks=d.weeks;
      state.goals=Array.isArray(d.goals)?d.goals:[];
      state.ui.weekIndex=Math.max(0,state.weeks.length-1); state.ui.stale=false;
      commit();
    }catch(e){ alert("That file isn't a Gidget backup. Pick a .json file you saved from Gidget."); }
  };
  r.readAsText(file);
}

function ledgerRows(){
  const rows=[["Week of","Section","Item","Date","Amount"]];
  const totals=cashTotals();
  state.weeks.forEach((w,i)=>{
    const t=totals[i], wk=w.startDate||"";
    rows.push([wk,"Starting","Previous balance","",round2(t.start)]);
    w.income.forEach(x=>rows.push([wk,"Income",x.label,"",round2(x.amount)]));
    w.bills.forEach(x=>rows.push([wk,"Bills",x.label,"",round2(x.amount)]));
    w.spending.slice().sort((a,b)=>String(a.date||"").localeCompare(String(b.date||"")))
      .forEach(x=>rows.push([wk,"Spending",x.label,x.date||"",round2(x.amount)]));
    w.setAside.forEach(a=>{ const g=state.goals.find(gg=>gg.id===a.goalId);
      rows.push([wk,"Set Aside",g?g.name:"Goal","",round2(a.amount)]); });
  });
  return rows;
}
function summaryRows(){
  const rows=[["Week of","Starting","Income","Expenses","Set aside","Cash on hand"]];
  const totals=cashTotals();
  state.weeks.forEach((w,i)=>{ const t=totals[i];
    rows.push([w.startDate||"",round2(t.start),round2(t.income),round2(t.expenses),round2(t.setAside),round2(t.cashEnding)]); });
  return rows;
}
function goalsRows(){
  const rows=[["Goal","Target","Deadline","Reserve now","Projected","Spent"]];
  state.goals.forEach(g=>{ const d=state.weeks.find(w=>w.id===g.targetWeekId);
    rows.push([g.name, round2(g.target), d?fmtRange(d.startDate):"", round2(reserveNow(g)), round2(projected(g)), round2(g.spent||0)]); });
  return rows;
}

function exportCSV(){
  if(state.weeks.length===0){ alert("Add a week first — there's nothing to export yet."); return; }
  const cell=v=>{ v = typeof v==="number" ? v.toFixed(2) : String(v==null?"":v);
    return /[",\n]/.test(v) ? '"'+v.replace(/"/g,'""')+'"' : v; };
  const csv = ledgerRows().map(r=>r.map(cell).join(",")).join("\r\n");
  downloadBlob("gidget-ledger-"+dateStamp()+".csv", "text/csv;charset=utf-8", "\ufeff"+csv);
}

/* ----- minimal pure-JS .xlsx writer (no dependencies) ----- */
function colName(n){ let s=""; n++; while(n>0){ const m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=Math.floor((n-1)/26); } return s; }
function xmlEsc(s){ return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c])); }
function sheetXml(rows){
  let out='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
  rows.forEach((row,ri)=>{
    out+=`<row r="${ri+1}">`;
    row.forEach((cell,ci)=>{
      const ref=colName(ci)+(ri+1);
      if(typeof cell==="number" && isFinite(cell)){ out+=`<c r="${ref}"><v>${cell}</v></c>`; }
      else{ out+=`<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(cell)}</t></is></c>`; }
    });
    out+="</row>";
  });
  return out+"</sheetData></worksheet>";
}
function crc32(bytes){ let c=~0; for(let i=0;i<bytes.length;i++){ c^=bytes[i];
  for(let k=0;k<8;k++) c=(c>>>1)^(0xEDB88320 & -(c&1)); } return (~c)>>>0; }
function zipStore(files){
  const enc=new TextEncoder();
  const u16=n=>[n&255,(n>>8)&255];
  const u32=n=>{ n>>>=0; return [n&255,(n>>8)&255,(n>>16)&255,(n>>24)&255]; };
  const parts=[]; const central=[]; let offset=0;
  files.forEach(f=>{
    const nameBytes=enc.encode(f.name), data=f.data, crc=crc32(data);
    const local=[].concat(u32(0x04034b50),u16(20),u16(0),u16(0),u16(0),u16(0),
      u32(crc),u32(data.length),u32(data.length),u16(nameBytes.length),u16(0));
    parts.push(Uint8Array.from(local), nameBytes, data);
    central.push({nameBytes,crc,len:data.length,offset});
    offset += local.length + nameBytes.length + data.length;
  });
  const cdStart=offset; let cdSize=0; const cd=[];
  central.forEach(c=>{
    const rec=[].concat(u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),
      u32(c.crc),u32(c.len),u32(c.len),u16(c.nameBytes.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(c.offset));
    cd.push(Uint8Array.from(rec), c.nameBytes);
    cdSize += rec.length + c.nameBytes.length;
  });
  const end=[].concat(u32(0x06054b50),u16(0),u16(0),u16(central.length),u16(central.length),
    u32(cdSize),u32(cdStart),u16(0));
  return new Blob([...parts, ...cd, Uint8Array.from(end)],
    {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
}
function makeXlsx(sheets){
  const enc=new TextEncoder(), files=[];
  let ct='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    +'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    +'<Default Extension="xml" ContentType="application/xml"/>'
    +'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>';
  sheets.forEach((s,i)=>{ ct+=`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`; });
  ct+="</Types>";
  files.push({name:"[Content_Types].xml", data:enc.encode(ct)});
  files.push({name:"_rels/.rels", data:enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    +'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')});
  let wb='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>';
  sheets.forEach((s,i)=>{ wb+=`<sheet name="${xmlEsc(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`; });
  wb+="</sheets></workbook>";
  files.push({name:"xl/workbook.xml", data:enc.encode(wb)});
  let rels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
  sheets.forEach((s,i)=>{ rels+=`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`; });
  rels+="</Relationships>";
  files.push({name:"xl/_rels/workbook.xml.rels", data:enc.encode(rels)});
  sheets.forEach((s,i)=>{ files.push({name:`xl/worksheets/sheet${i+1}.xml`, data:enc.encode(sheetXml(s.rows))}); });
  return zipStore(files);
}
function exportXLSX(){
  if(state.weeks.length===0){ alert("Add a week first — there's nothing to export yet."); return; }
  const blob=makeXlsx([
    {name:"Ledger", rows:ledgerRows()},
    {name:"Weekly Summary", rows:summaryRows()},
    {name:"Goals", rows:goalsRows()}
  ]);
  downloadBlob("gidget-budget-"+dateStamp()+".xlsx", "", blob);
}

function openData(){
  const body=`
    <button class="bigbtn" data-x="backup">⤓  Save backup (.json)</button>
    <button class="bigbtn" data-x="restore">⤒  Restore from backup…</button>
    <div class="divider"></div>
    <button class="bigbtn" data-x="csv">Export CSV</button>
    <button class="bigbtn" data-x="xlsx">Export Excel (.xlsx)</button>
    <button class="bigbtn" data-x="gsheet">Open Google Sheets…</button>
    <p class="note">Numbers and Google Sheets both open these files — double-click in Numbers, or use File → Import in Google Sheets. A native Apple <em>.numbers</em> file can't be created from a web page.</p>
    <div class="divider"></div>
    <button class="bigbtn" data-x="fresh">Start a fresh week (after a gap)</button>
    <button class="delbtn" data-x="reset">Reset everything</button>`;
  modal("Save & export", body, ()=>{}, { noSave:true, onExtra:(k,close)=>{
    if(k==="backup"){ saveBackup(); }
    else if(k==="restore"){ close(); pickFile(".json,application/json", restoreBackup); }
    else if(k==="csv"){ exportCSV(); }
    else if(k==="xlsx"){ exportXLSX(); }
    else if(k==="gsheet"){ window.open("https://sheets.new","_blank","noopener"); }
    else if(k==="fresh"){ close(); startFresh(); }
    else if(k==="reset"){ if(confirm("Erase every week and goal? This can't be undone.")){ state.weeks=[]; state.goals=[]; state.ui.weekIndex=0; state.ui.stale=false; commit(); close(); } }
  }});
}

/* ---------- action routing ---------- */
function onAction(a, el){
  const id=el.dataset.id, section=el.dataset.section;
  switch(a){
    case "tab:budget":  state.ui.tab="budget"; render(); break;
    case "tab:goals":   state.ui.tab="goals"; render(); break;
    case "tab:overview":state.ui.tab="overview"; render(); break;
    case "week:prev":   if(state.ui.weekIndex>0){ state.ui.weekIndex--; render(); } break;
    case "week:next":   if(state.ui.weekIndex<state.weeks.length-1){ state.ui.weekIndex++; render(); } break;
    case "week:settings": editWeek(); break;
    case "start:edit":  editStart(); break;
    case "item:add":    editItem(section,null); break;
    case "item:edit":   editItem(section,id); break;
    case "item:editamount": editAmount(section,id); break;
    case "setaside:add":  editSetAside(null); break;
    case "setaside:edit": editSetAside(id); break;
    case "setaside:editamount": editSetAsideAmount(id); break;
    case "week:new":    addWeek(); break;
    case "app:data":    openData(); break;
    case "app:fresh":   startFresh(); break;
    case "app:dismissstale": state.ui.stale=false; render(); break;
    case "goal:add":    editGoal(null); break;
    case "goal:edit":   editGoal(id); break;
    case "goal:spend":  recordSpend(id); break;
    case "goal:delete": modal("Delete goal?",
      `<p class="note">This removes the goal and any set-aside entries pointing to it.</p><button class="delbtn" data-x="delete">Delete</button>`,
      ()=>{}, { noSave:true, onDelete:()=>removeGoal(id) }); break;
    case "create:seeded": createFirstWeek(true); break;
    case "create:blank":  createFirstWeek(false); break;
  }
}

document.body.addEventListener("click", e=>{
  const el=e.target.closest("[data-action]"); if(!el) return;
  onAction(el.dataset.action, el);
});

autoAdvance();
render();
