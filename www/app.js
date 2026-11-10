'use strict';
/* HabitFlow 2 — habits, tasks, streaks, XP. Same Supabase schema as the original (one JSON doc per user). */
const KEY='habitflow_v3',DIRTY_KEY='habitflow_dirty',ACCT_KEY='habitflow_acct',THEME_KEY='habitflow_theme',GUEST_KEY='habitflow_guest',REM_KEY='habitflow_rem',TABLE='habitflow_data';
const DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],DAYNUM=[1,2,3,4,5,6,0],DOW1=['S','M','T','W','T','F','S'];
const COLORS=[['#feda75','#fa7e1e'],['#fa7e1e','#d62976'],['#d62976','#962fbf'],['#962fbf','#4f5bd5'],['#4f5bd5','#00c6ff'],['#00c6ff','#00e6a8'],['#00e6a8','#b6f24a'],['#ff5e62','#ff9966']];
const EMOJIS=['💪','🏃','🧘','💧','🥗','😴','📚','✍️','💻','🎯','🧠','🎸','🎨','🧹','💊','🚭','🙏','☀️','🌙','💰','📵','🐶','🌱','🚴'];
const HCATS=['Fitness','Health','Learning','Career','Personal','Other'],TCATS=['College','Career','Fitness','Personal','Other'];
const CAT_DEF={Fitness:['💪',1],Health:['🥗',6],Learning:['📚',4],Career:['💼',3],Personal:['✨',2],Other:['⭐',0],College:['🎓',4]};
const EMPTY={habits:[],tasks:[],checks:{},taskChecks:{},checkTimes:{},taskCheckTimes:{}};
const clone=o=>JSON.parse(JSON.stringify(o));
const norm=s=>{s=Object.assign(clone(EMPTY),s||{});for(const k of Object.keys(EMPTY))if(s[k]==null)s[k]=clone(EMPTY[k]);return s};
const cfg=window.HABITFLOW_CONFIG||{};
const CLOUD=!!(cfg.url&&cfg.key&&!/PASTE_|YOUR/.test(cfg.url+cfg.key)&&window.supabase);
const sb=CLOUD?window.supabase.createClient(cfg.url,cfg.key):null;
let state;try{state=norm(JSON.parse(localStorage.getItem(KEY)||'null'))}catch(e){state=clone(EMPTY)}
let tab='home',sel=null,sessionUser=null,cloudLoaded=false,saveTimer=null,authMode='login',statSeg='week',monthOff=0,popKey=null,startCache={},sheetOpen=false;
const $=id=>document.getElementById(id);
const pad=n=>String(n).padStart(2,'0');
const iso=d=>{const x=new Date(d);return `${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}`};
const today=()=>iso(new Date());
const dateObj=s=>new Date(s+'T12:00:00');
const addDays=(s,n)=>{const d=dateObj(s);d.setDate(d.getDate()+n);return iso(d)};
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const stamp=()=>new Date().toISOString();
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const fmtStamp=v=>v?new Date(v).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
const hasLocalData=()=>!!(state.habits.length||state.tasks.length||Object.keys(state.checks).length||Object.keys(state.taskChecks).length);
sel=today();

/* ---------- native helpers (Capacitor) with web fallbacks ---------- */
const isNative=()=>!!(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform());
const plug=n=>{try{const C=window.Capacitor;return C&&((C.Plugins&&C.Plugins[n])||(C.registerPlugin&&C.registerPlugin(n)))||null}catch(e){return null}};
const buzz=(t)=>{try{const H=isNative()&&plug('Haptics');if(H){if(t==='ok')H.notification({type:'SUCCESS'});else if(t==='big')H.impact({style:'HEAVY'});else H.impact({style:'LIGHT'});return}if(navigator.vibrate)navigator.vibrate(t==='big'?[30,40,30]:t==='ok'?18:8)}catch(e){}};

/* ---------- theme ---------- */
const themePref=()=>localStorage.getItem(THEME_KEY)||'dark';
function applyTheme(){const p=themePref();const t=p==='system'?(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):p;document.documentElement.dataset.theme=t;const c=t==='dark'?'#0b0b12':'#f6f6fa';document.querySelector('meta[name=theme-color]').content=c;try{const S=isNative()&&plug('StatusBar');if(S){S.setStyle({style:t==='dark'?'DARK':'LIGHT'});S.setBackgroundColor({color:c})}}catch(e){}}

/* ---------- persistence & cloud ---------- */
const isDirty=()=>localStorage.getItem(DIRTY_KEY)==='1';
const setDirty=v=>{v?localStorage.setItem(DIRTY_KEY,'1'):localStorage.removeItem(DIRTY_KEY)};
function save(){startCache={};localStorage.setItem(KEY,JSON.stringify(state));if(sessionUser&&cloudLoaded){setDirty(true);clearTimeout(saveTimer);saveTimer=setTimeout(saveCloud,500)}}
async function saveCloud(){if(!sb||!sessionUser||!cloudLoaded)return false;try{const{error}=await sb.from(TABLE).upsert({user_id:sessionUser.id,data:state,updated_at:stamp()},{onConflict:'user_id'});if(error)throw error;setDirty(false);renderChrome();return true}catch(e){setDirty(true);renderChrome();return false}}
async function loadCloud(){
  if(!sb||!sessionUser)return;
  const acct=localStorage.getItem(ACCT_KEY);
  if(isDirty()&&acct===sessionUser.id){cloudLoaded=true;await saveCloud();render();return}
  try{
    const{data,error}=await sb.from(TABLE).select('data').eq('user_id',sessionUser.id).maybeSingle();
    if(error)throw error;
    if(data&&data.data){state=norm(data.data);cloudLoaded=true}
    else{const old=hasLocalData()?clone(state):null;state=clone(EMPTY);cloudLoaded=true;if(old&&await ask('Import local data?','This account has no cloud data yet. Import the habits and history saved on this device?','Import','Start fresh'))state=old}
    localStorage.setItem(KEY,JSON.stringify(state));localStorage.setItem(ACCT_KEY,sessionUser.id);setDirty(false);
    if(!data||!data.data)await saveCloud();
  }catch(e){
    if(acct===sessionUser.id){cloudLoaded=true;toast('Offline — using data saved on this device')}
    else{cloudLoaded=false;toast('Can’t reach the cloud right now. Tap Sync to retry.')}
  }
  syncReminders();render();
}
window.addEventListener('online',()=>{if(sessionUser&&cloudLoaded&&isDirty())saveCloud()});

/* ---------- schedule logic ---------- */
const daysFor=h=>h.frequency==='daily'?DAYNUM:h.frequency==='weekdays'?[1,2,3,4,5]:h.frequency==='weekends'?[6,0]:(h.days||[]);
function startOf(h){if(startCache[h.id]!==undefined)return startCache[h.id];let s=h.createdAt?iso(h.createdAt):'0000-00-00';const p=h.id+'|';for(const k in state.checks)if(k.startsWith(p)){const d=k.slice(p.length);if(d<s)s=d}return startCache[h.id]=s}
const scheduled=(h,s)=>daysFor(h).includes(dateObj(s).getDay())&&s>=startOf(h);
const done=(h,s)=>!!state.checks[h.id+'|'+s];
const taskInstances=s=>state.tasks.filter(t=>t.repeat?(s>=t.startDate&&(t.days||[]).includes(dateObj(s).getDay())):t.date===s);
const taskDone=(t,s)=>!!state.taskChecks[t.id+'|'+s];
function counts(s){let a=0,b=0;state.habits.forEach(h=>{if(scheduled(h,s)){b++;if(done(h,s))a++}});taskInstances(s).forEach(t=>{b++;if(taskDone(t,s))a++});return{a,b}}
const completion=s=>{const c=counts(s);return c.b?Math.round(c.a/c.b*100):0};
const scheduleText=h=>{const d=daysFor(h);if(d.length===7)return'Every day';if(h.frequency==='weekdays')return'Weekdays';if(h.frequency==='weekends')return'Weekends';return d.map(x=>DAYS[DAYNUM.indexOf(x)]).join(' ')};
function habitStreak(h){let n=0;for(let i=0;i<400;i++){const d=addDays(today(),-i);if(d<startOf(h))break;if(!scheduled(h,d))continue;if(done(h,d))n++;else if(i===0)continue;else break}return n}
function dayStreak(){let n=0;for(let i=0;i<400;i++){const d=addDays(today(),-i),c=counts(d);if(!c.b)continue;if(c.a===c.b)n++;else if(i===0)continue;else break}return n}
function bestDayStreak(){let best=0,cur=0;for(let i=364;i>=0;i--){const c=counts(addDays(today(),-i));if(!c.b)continue;if(c.a===c.b){cur++;best=Math.max(best,cur)}else if(i!==0)cur=0}return best}
function perfectDays(){let n=0;for(let i=0;i<365;i++){const c=counts(addDays(today(),-i));if(c.b&&c.a===c.b)n++}return n}
const PW={High:15,Medium:10,Low:5};
function stats(){
  const hc=Object.keys(state.checks).filter(k=>state.checks[k]).length;
  let tx=0,tc=0;for(const k in state.taskChecks){if(!state.taskChecks[k])continue;tc++;const t=state.tasks.find(x=>x.id===k.split('|')[0]);tx+=PW[t&&t.priority]||10}
  const perfect=perfectDays(),xp=hc*10+tx+perfect*25,level=Math.floor(Math.sqrt(xp/40))+1,base=40*(level-1)**2,next=40*level**2;
  return{hc,tc,perfect,xp,level,pct:Math.round((xp-base)/(next-base)*100),toNext:next-xp,streak:dayStreak(),best:bestDayStreak(),habits:state.habits.length}
}
const BADGES=[
  ['🌱','First step',s=>s.hc+s.tc>=1],['🔥','3-day streak',s=>s.best>=3],['⚡','7-day streak',s=>s.best>=7],['🚀','30-day streak',s=>s.best>=30],
  ['💯','100 check-ins',s=>s.hc+s.tc>=100],['🌟','Perfect day',s=>s.perfect>=1],['🎯','5 habits',s=>s.habits>=5],['👑','Level 5',s=>s.level>=5]
];
const unlocked=s=>BADGES.filter(b=>b[2](s)).map(b=>b[1]);

/* ---------- item look ---------- */
const hash=s=>{let x=0;for(const c of String(s))x=(x*31+c.charCodeAt(0))>>>0;return x};
const meta=(it,isTask)=>{const d=CAT_DEF[it.category]||['⭐',hash(it.id)%8];return{emoji:it.emoji||(isTask?'📌':d[0]),ci:it.ci!=null?it.ci:d[1]}};
const grad=ci=>{const c=COLORS[ci%COLORS.length];return `linear-gradient(135deg,${c[0]},${c[1]})`};

/* ---------- toggling ---------- */
function snapshot(d){const s=stats();return{level:s.level,badges:unlocked(s),c:counts(d)}}
function toggle(kind,id,s){
  if(s>today()){toast('You can’t check off a future day yet');return}
  const before=snapshot(s);const isH=kind==='habit',map=isH?state.checks:state.taskChecks,times=isH?state.checkTimes:state.taskCheckTimes,k=id+'|'+s;let on;
  if(map[k]){delete map[k];delete times[k];on=false}else{map[k]=1;times[k]=stamp();on=true}
  popKey=on?kind+id:null;save();render();
  if(!on){buzz();return}
  buzz('ok');const after=snapshot(s),msgs=[];
  if(after.c.b&&after.c.a===after.c.b&&before.c.a!==before.c.b){confetti();buzz('big');msgs.push('Perfect day! 🎉 Everything done')}
  after.badges.filter(b=>!before.badges.includes(b)).forEach(b=>msgs.push('🏅 Badge unlocked: '+b));
  if(after.level>before.level)msgs.push('⬆️ Level up! You’re now level '+after.level);
  msgs.forEach((m,i)=>setTimeout(()=>toast(m),i*2300));
}

/* ---------- UI atoms ---------- */
const I={
  home:'<svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  plan:'<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="17" rx="3"/><path d="M8 3v3M16 3v3M8 12l2.5 2.5L16 9"/></svg>',
  stats:'<svg viewBox="0 0 24 24"><path d="M5 20V11M12 20V4M19 20v-6"/></svg>',
  me:'<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>',
  plus:'<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  chk:'<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>'
};
function renderChrome(){
  $('tabbar').innerHTML=[['home','Home'],['plan','Tasks'],['plus',''],['stats','Stats'],['me','Me']].map(([t,l])=>t==='plus'?`<button class="tab plus" data-act="add" aria-label="Add"><span class="plusBtn">${I.plus}</span></button>`:`<button class="tab ${tab===t?'on':''}" data-act="tab" data-tab="${t}" aria-label="${l}">${I[t]}</button>`).join('');
  const a=document.querySelector('.avatar i');if(a)a.className=isDirty()?'warn':'';
}
const userName=()=>{const u=sessionUser;const n=u&&u.user_metadata&&u.user_metadata.full_name;return n||(u&&u.email?u.email.split('@')[0]:'there')};
const greeting=()=>{const h=new Date().getHours();return h<5?'Late night':h<12?'Good morning':h<17?'Good afternoon':'Good evening'};
function itemRow(kind,it,s,isDone,subExtra,tag){
  const isTask=kind==='task',m=meta(it,isTask),key=kind+it.id;
  return `<div class="swipe ${popKey===key?'pop':''}" data-kind="${kind}" data-id="${it.id}" data-date="${s}"><div class="swipeBg">✓ Done</div><div class="item ${isDone?'done':''}"><div class="emo" style="--g:${grad(m.ci)}">${esc(m.emoji)}</div><div class="txt" data-act="edit" data-kind="${kind}" data-id="${it.id}"><b>${esc(it.name)}</b><span>${subExtra}</span></div>${tag||''}<button class="chk ${isDone?'on':''}" data-act="toggle" data-kind="${kind}" data-id="${it.id}" data-date="${s}" aria-label="Toggle">${I.chk}</button></div></div>`;
}
const prioTag=p=>`<span class="tag ${p==='High'?'hi':p==='Low'?'lo':'md'}">${esc(p)}</span>`;
function habitRowHtml(h,s){const st=habitStreak(h);return itemRow('habit',h,s,done(h,s),`${esc(h.category)} · ${esc(scheduleText(h))}${h.reminder?' · ⏰ '+esc(h.reminder):''}${st>=2?` <i class="streakMini">🔥${st}</i>`:''}`)}
function taskRowHtml(t,s,overdue){return itemRow('task',t,s,taskDone(t,s),`${esc(t.category)}${t.repeat?' · '+esc(scheduleText({frequency:'custom',days:t.days})):''}${overdue?' · due '+esc(dateObj(s).toLocaleDateString(undefined,{month:'short',day:'numeric'})):''}`,overdue?'<span class="tag od">Overdue</span>':prioTag(t.priority))}
const emptyBox=(e,t)=>`<div class="empty"><big>${e}</big>${t}</div>`;

/* ---------- Home ---------- */
function renderHome(){
  const s=sel,isToday=s===today(),hs=state.habits.filter(h=>scheduled(h,s)),ts=taskInstances(s),c=counts(s),p=c.b?Math.round(c.a/c.b*100):0,st=stats();
  const strip=Array.from({length:15},(_,i)=>addDays(today(),i-10)).map(d=>{const cc=counts(d),cls=cc.b===0?'':cc.a===cc.b?'p':(d<=today()&&cc.a>0?'m':'');const o=dateObj(d);return `<button class="dchip ${d===s?'on':''} ${d===today()?'today':''}" data-act="seldate" data-date="${d}"><small>${o.toLocaleDateString(undefined,{weekday:'short'}).slice(0,3)}</small><b>${o.getDate()}</b><i class="${cls}"></i></button>`}).join('');
  const stories=`<button class="story add" data-act="addhabit"><span class="ring"><span class="face">+</span></span><em>New</em></button>`+hs.map(h=>{const m=meta(h),d=done(h,s);return `<button class="story ${d?'seen':''} ${popKey==='habit'+h.id?'pop':''}" data-act="toggle" data-kind="habit" data-id="${h.id}" data-date="${s}" style="--g:${grad(m.ci)}"><span class="ring" style="--g:${grad(m.ci)}"><span class="face" style="--g:${grad(m.ci)}">${esc(m.emoji)}</span>${d?'<i class="badgeOk">✓</i>':''}</span><em>${esc(h.name)}</em></button>`}).join('');
  const left=c.b-c.a,line=!c.b?'Nothing scheduled — add something or enjoy the rest':left===0?'Perfect day — streak locked in 🔥':`${left} left${isToday?' today':' that day'} · finish all to keep your streak`;
  const overdue=isToday?overdueTasks().length:0;
  $('home').innerHTML=`<div class="greet"><div class="gt"><div class="sub">${esc(dateObj(today()).toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'}))}</div><h1>${greeting()}, ${esc(userName())}</h1></div><div class="flame ${st.streak>0?'hot':''}">🔥 ${st.streak}</div><button class="avatar" data-act="tab" data-tab="me">${esc(userName()[0].toUpperCase())}${sessionUser?`<i class="${isDirty()?'warn':''}"></i>`:''}</button></div>
  <div class="scrollX" id="strip" data-keep="strip">${strip}</div>
  <div class="scrollX stories" data-keep="stories" style="margin-top:8px">${stories}</div>
  <div class="hero"><div class="heroTop"><div class="pring" style="--p:${p}"><span>${p}%</span></div><div class="heroTxt"><h2>${isToday?'Today’s progress':esc(dateObj(s).toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'}))}</h2><p>${esc(line)}</p></div></div><div class="xp"><div class="xpRow"><span>Level ${st.level}</span><span>${st.xp} XP · ${st.toNext} to next</span></div><div class="xpBar"><span style="width:${st.pct}%"></span></div></div></div>
  ${overdue?`<div class="banner" data-act="tab" data-tab="plan">⏰ ${overdue} overdue task${overdue>1?'s':''} — tap to clear them</div>`:''}
  <div class="sectionTitle">Habits <small>swipe → to complete</small></div>${hs.length?hs.map(h=>habitRowHtml(h,s)).join(''):emptyBox('🌱','No habits scheduled for this day.<br>Tap <b>+</b> to start one.')}
  <div class="sectionTitle">Tasks</div>${ts.length?ts.map(t=>taskRowHtml(t,s)).join(''):emptyBox('📝','No tasks for this day.')}`;
}
function overdueTasks(){const out=[],t0=today();state.tasks.forEach(t=>{if(t.repeat)return;if(t.date<t0&&t.date>=addDays(t0,-60)&&!taskDone(t,t.date))out.push(t)});return out.sort((a,b)=>a.date<b.date?-1:1)}

/* ---------- Tasks tab ---------- */
function renderPlan(){
  const od=overdueTasks(),dates=Array.from({length:14},(_,i)=>addDays(today(),i));
  let html='';
  if(od.length)html+=`<div class="sectionTitle" style="margin-top:6px">Overdue <small>${od.length}</small></div>`+od.map(t=>taskRowHtml(t,t.date,true)).join('');
  dates.forEach(s=>{const ts=taskInstances(s);if(!ts.length)return;const lbl=s===today()?'Today':s===addDays(today(),1)?'Tomorrow':dateObj(s).toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'});html+=`<div class="sectionTitle">${lbl} <small>${ts.filter(t=>taskDone(t,s)).length}/${ts.length}</small></div>`+ts.map(t=>taskRowHtml(t,s)).join('')});
  $('plan').innerHTML=`<div class="pageHead"><div><h1>Tasks</h1><div class="sub">Next 14 days · swipe → to complete · tap a task to edit</div></div></div>${html||emptyBox('✅','Nothing planned for the next 14 days.<br>Tap <b>+</b> to add a task.')}`;
}

/* ---------- Stats tab ---------- */
function weekDays(){const st=dateObj(today());st.setDate(st.getDate()-((st.getDay()+6)%7));return Array.from({length:7},(_,i)=>iso(new Date(st.getFullYear(),st.getMonth(),st.getDate()+i)))}
function habitPerf(h,dates){const a=dates.filter(d=>scheduled(h,d)&&d<=today()),c=a.filter(d=>done(h,d)).length;return{c,n:a.length,p:a.length?Math.round(c/a.length*100):0}}
const perfRows=dates=>state.habits.length?state.habits.map(h=>{const r=habitPerf(h,dates),m=meta(h);return `<div class="prow"><div class="t"><span>${esc(m.emoji)}</span>${esc(h.name)}<em>${r.c}/${r.n} · ${r.p}%</em></div><div class="pbar" style="--g:${grad(m.ci)}"><span style="width:${r.p}%"></span></div></div>`}).join(''):'<div class="sub" style="padding:10px 0">No habits yet.</div>';
function monthInfo(){const d=dateObj(today());d.setDate(1);d.setMonth(d.getMonth()+monthOff);const y=d.getFullYear(),m=d.getMonth(),n=new Date(y,m+1,0).getDate();return{d,y,m,n,dates:Array.from({length:n},(_,i)=>`${y}-${pad(m+1)}-${pad(i+1)}`)}}
function renderStats(){
  const st=stats();let body='';
  if(statSeg==='week'){
    const wd=weekDays(),vals=wd.map(completion),past=wd.filter(d=>d<=today()),avg=past.length?Math.round(past.reduce((a,d)=>a+completion(d),0)/past.length):0;
    body=`<div class="card"><div class="sectionTitle" style="margin:0 0 4px">This week <small>avg ${avg}%</small></div><div class="bars">${wd.map((d,i)=>`<div class="bcol ${d===today()?'today':''}"><div class="b"><span style="height:${vals[i]}%"></span></div><small>${dateObj(d).toLocaleDateString(undefined,{weekday:'narrow'})}</small></div>`).join('')}</div></div><div class="sectionTitle">Habit performance</div><div class="card">${perfRows(wd)}</div>`;
  }else{
    const mi=monthInfo(),lead=(new Date(mi.y,mi.m,1).getDay()+6)%7,past=mi.dates.filter(d=>d<=today()),avg=past.length?Math.round(past.reduce((a,d)=>a+completion(d),0)/past.length):0;
    const nav=`<div class="monthNav"><button data-act="mon" data-d="-1">‹</button><b>${esc(mi.d.toLocaleDateString(undefined,{month:'long',year:'numeric'}))}</b><button data-act="mon" data-d="1" ${monthOff>=0?'disabled style="opacity:.3"':''}>›</button></div>`;
    if(statSeg==='month'){
      const cells=['M','T','W','T','F','S','S'].map(x=>`<div class="dw">${x}</div>`).join('')+Array(lead).fill('<div></div>').join('')+mi.dates.map(d=>{const c=counts(d),p=c.b?Math.round(c.a/c.b*100):0,l=!c.b||d>today()?'':p===100?'l4':p>=67?'l3':p>=34?'l2':p>0?'l1':'';return `<div class="cc ${l} ${d===today()?'td':''} ${d>today()?'fu':''}">${dateObj(d).getDate()}</div>`}).join('');
      body=`${nav}<div class="card"><div class="cal">${cells}</div><div class="sub" style="margin-top:12px">Average completion <b style="color:var(--ink)">${avg}%</b> · brighter = more done</div></div><div class="sectionTitle">Monthly habit report</div><div class="card">${perfRows(mi.dates)}</div>`;
    }else{
      const items=[...state.habits.map(h=>({k:'habit',it:h})),...state.tasks.map(t=>({k:'task',it:t}))];
      const sch=(x,d)=>x.k==='habit'?scheduled(x.it,d):taskInstances(d).some(t=>t.id===x.it.id),chk=(x,d)=>x.k==='habit'?done(x.it,d):taskDone(x.it,d);
      const head=`<tr><th>Habit / Task</th>${mi.dates.map(d=>`<th><b>${dateObj(d).getDate()}</b><br><span class="sub" style="font-size:9px">${dateObj(d).toLocaleDateString(undefined,{weekday:'narrow'})}</span></th>`).join('')}</tr>`;
      const rows=items.map(x=>`<tr><td>${esc(meta(x.it,x.k==='task').emoji)} ${esc(x.it.name)}</td>${mi.dates.map(d=>{const on=sch(x,d);return on?`<td class="c" data-act="trk" data-kind="${x.k}" data-id="${x.it.id}" data-date="${d}"><span class="tk ${chk(x,d)?'on':''}"></span></td>`:'<td class="c off"></td>'}).join('')}</tr>`).join('');
      const W=Math.max(320,mi.n*18),H=100,pp=8,pts=mi.dates.map((d,i)=>`${pp+i/Math.max(1,mi.n-1)*(W-2*pp)},${H-pp-(d>today()?0:completion(d)/100)*(H-2*pp)}`).join(' ');
      body=`${nav}<div class="trk"><table>${head}${rows||`<tr><td colspan="${mi.n+1}" style="padding:24px;text-align:center">Nothing to track yet</td></tr>`}</table></div><div class="sectionTitle">Daily completion</div><div class="card"><div class="spark"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs><linearGradient id="lg" x1="0" x2="1"><stop offset="0" stop-color="#fa7e1e"/><stop offset=".5" stop-color="#d62976"/><stop offset="1" stop-color="#4f5bd5"/></linearGradient></defs><polyline points="${pts}" fill="none" stroke="url(#lg)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg></div></div>`;
    }
  }
  $('stats').innerHTML=`<div class="pageHead"><h1>Stats</h1></div><div class="grid2" style="margin-bottom:14px"><div class="kpi g"><small>Current streak</small><b>🔥 ${st.streak}</b></div><div class="kpi"><small>Best streak</small><b>${st.best}</b></div><div class="kpi"><small>Check-ins</small><b>${st.hc+st.tc}</b></div><div class="kpi"><small>Perfect days</small><b>${st.perfect}</b></div></div><div class="seg" style="margin-bottom:14px">${[['week','Week'],['month','Month'],['tracker','Tracker']].map(([k,l])=>`<button class="${statSeg===k?'on':''}" data-act="seg" data-seg="${k}">${l}</button>`).join('')}</div>${body}`;
}

/* ---------- Me tab ---------- */
function renderMe(){
  const st=stats(),un=unlocked(st),tp=themePref(),rem=localStorage.getItem(REM_KEY)!=='0';
  const manage=[...state.habits.map(h=>({k:'habit',it:h})),...state.tasks.map(t=>({k:'task',it:t}))].map(x=>{const m=meta(x.it,x.k==='task');return `<div class="row" data-act="edit" data-kind="${x.k}" data-id="${x.it.id}"><div class="emo" style="--g:${grad(m.ci)}">${esc(m.emoji)}</div><div class="rt"><b>${esc(x.it.name)}</b><span>${x.k==='habit'?esc(x.it.category)+' · '+esc(scheduleText(x.it)):esc(x.it.category)+' · '+(x.it.repeat?esc(scheduleText({frequency:'custom',days:x.it.days})):esc(x.it.date))}</span></div><span class="go">›</span></div>`}).join('');
  const ev=[];state.habits.forEach(h=>ev.push({c:0,n:h.name,t:h.createdAt}));state.tasks.forEach(t=>ev.push({c:0,n:t.name,t:t.createdAt}));
  for(const k in state.checks)if(state.checks[k]){const h=state.habits.find(x=>x.id===k.split('|')[0]);if(h)ev.push({c:1,n:h.name,t:state.checkTimes[k],d:k.split('|')[1]})}
  for(const k in state.taskChecks)if(state.taskChecks[k]){const t=state.tasks.find(x=>x.id===k.split('|')[0]);if(t)ev.push({c:1,n:t.name,t:state.taskCheckTimes[k],d:k.split('|')[1]})}
  ev.sort((a,b)=>new Date(b.t||0)-new Date(a.t||0));
  const cloudTxt=!sessionUser?'This device only':isDirty()?'Waiting to sync':'Synced';
  $('me').innerHTML=`<div class="profile"><div class="avatar">${esc(userName()[0].toUpperCase())}${sessionUser?`<i class="${isDirty()?'warn':''}"></i>`:''}</div><div><h2>${esc(userName())}</h2><div class="sub">${esc(sessionUser?sessionUser.email:'Guest mode')} · ${cloudTxt}</div><span class="lvl">LEVEL ${st.level} · ${st.xp} XP</span></div></div>
  <div class="card"><div class="sectionTitle" style="margin:0 0 12px">Badges <small>${un.length}/${BADGES.length}</small></div><div class="badges">${BADGES.map(b=>`<div class="bdg ${un.includes(b[1])?'':'lock'}"><div class="ic">${b[0]}</div><small>${b[1]}</small></div>`).join('')}</div></div>
  <div class="sectionTitle">My habits & tasks <small>tap to edit</small></div><div class="card list">${manage||'<div class="sub">Nothing yet — tap + to add.</div>'}</div>
  <div class="sectionTitle">Settings</div><div class="card">
    <div class="setRow"><b>Theme</b><div class="seg" style="width:210px">${[['dark','Dark'],['light','Light'],['system','Auto']].map(([k,l])=>`<button class="${tp===k?'on':''}" data-act="theme" data-v="${k}">${l}</button>`).join('')}</div></div>
    <div class="setRow"><div><b>Habit reminders</b><div class="sub">Notify at each habit’s reminder time</div></div><button class="sw ${rem?'on':''}" data-act="rem" aria-label="Toggle reminders"></button></div>
    <div class="setRow"><div><b>${sessionUser?'Sync now':'Sign in to sync'}</b><div class="sub">${sessionUser?'Push or pull your cloud data':'Back up and use on all your devices'}</div></div><button class="btn soft" data-act="sync">${sessionUser?'↻ Sync':'Sign in'}</button></div>
    <div class="setRow"><b>Export backup</b><button class="btn soft" data-act="export">Export</button></div>
  </div>
  <div class="sectionTitle">History</div>
  <details class="card"><summary>Activity log (latest 60)</summary><div class="inner">${ev.length?ev.slice(0,60).map(e=>`<div class="logRow"><span class="d ${e.c?'c':''}">${e.c?'✓':'+'}</span><div><b>${e.c?'Checked':'Added'}</b> · ${esc(e.n)}${e.d?` <span class="sub">(${esc(e.d)})</span>`:''}</div><span class="tm">${esc(fmtStamp(e.t))}</span></div>`).join(''):'<div class="sub">No activity yet.</div>'}</div></details>
  <div style="display:grid;gap:10px;margin-top:22px">${sessionUser?'<button class="btn soft block" data-act="logout">Log out</button>':''}<button class="btn danger block" data-act="reset">Reset all data</button></div>
  <div class="sub" style="text-align:center;margin-top:18px">HabitFlow 2.0</div>`;
}

/* ---------- render ---------- */
function render(){
  startCache={};
  const keep={};document.querySelectorAll('[data-keep]').forEach(e=>keep[e.dataset.keep]=e.scrollLeft);
  document.querySelectorAll('.screen').forEach(e=>e.classList.toggle('active',e.id===tab));
  ({home:renderHome,plan:renderPlan,stats:renderStats,me:renderMe})[tab]();
  document.querySelectorAll('[data-keep]').forEach(e=>{if(keep[e.dataset.keep]!==undefined)e.scrollLeft=keep[e.dataset.keep];else if(e.id==='strip'){const o=e.querySelector('.on');if(o)e.scrollLeft=o.offsetLeft-e.clientWidth/2+o.clientWidth/2}});
  popKey=null;renderChrome();
}

/* ---------- sheets / dialog / toast ---------- */
function openSheet(html){const r=$('sheetRoot');r.innerHTML=`<div class="scrim" data-act="closeSheet"></div><div class="sheet"><div class="grab"></div>${html}</div>`;sheetOpen=true;requestAnimationFrame(()=>requestAnimationFrame(()=>r.classList.add('open')))}
function closeSheet(){const r=$('sheetRoot');if(!sheetOpen)return;sheetOpen=false;r.classList.remove('open');setTimeout(()=>{if(!sheetOpen)r.innerHTML=''},330)}
function ask(title,msg,ok='OK',cancel='Cancel',danger=false){return new Promise(res=>{const r=$('dialogRoot');r.innerHTML=`<div class="scrim"></div><div class="dialog"><h3>${esc(title)}</h3><p>${esc(msg)}</p><div class="actions"><button class="btn soft" id="dlgNo">${esc(cancel)}</button><button class="btn ${danger?'danger':'grad'}" id="dlgYes">${esc(ok)}</button></div></div>`;requestAnimationFrame(()=>r.classList.add('open'));const fin=v=>{r.classList.remove('open');setTimeout(()=>r.innerHTML='',250);res(v)};$('dlgNo').onclick=()=>fin(false);$('dlgYes').onclick=()=>fin(true)})}
let toastT;function toast(m){const t=$('toast');t.textContent=m;t.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('show'),2200)}

/* form helpers */
let form={};
const emojiPicker=cur=>`<div class="f"><div class="lb">Icon</div><div class="emojiGrid">${EMOJIS.map(e=>`<button type="button" class="${e===cur?'on':''}" data-act="fEmoji" data-v="${e}">${e}</button>`).join('')}</div></div>`;
const colorPicker=cur=>`<div class="f"><div class="lb">Color</div><div class="swatches">${COLORS.map((c,i)=>`<button type="button" class="${i===cur?'on':''}" data-act="fColor" data-v="${i}" style="background:${grad(i)}"></button>`).join('')}</div></div>`;
const dayPicker=sel=>`<div class="dayRow">${DAYS.map((n,i)=>`<button type="button" class="${sel.includes(DAYNUM[i])?'on':''}" data-act="fDay" data-v="${DAYNUM[i]}">${n[0]}</button>`).join('')}</div>`;
const chipSet=(list,cur,act)=>`<div class="chips">${list.map(x=>`<button type="button" class="chip ${x===cur?'on':''}" data-act="${act}" data-v="${x}">${x}</button>`).join('')}</div>`;
function openAdd(){openSheet(`<h2>Create new</h2><div class="pick"><button data-act="addhabit"><span class="ic">🔁</span><div><b>Habit</b><span>Repeats on a schedule · builds streaks</span></div></button><button data-act="addtask"><span class="ic">✅</span><div><b>Task</b><span>One-time or weekly to-do with priority</span></div></button></div>`)}
function habitSheet(id){
  const h=id?state.habits.find(x=>x.id===id):null;
  form={kind:'habit',id,emoji:h?meta(h).emoji:'💪',ci:h?meta(h).ci:1,cat:h?h.category:'Fitness',freq:h?h.frequency:'daily',days:h?[...daysFor(h)]:[1,2,3,4,5]};
  openSheet(`<h2>${h?'Edit habit':'New habit'}</h2><div class="f"><label>Name</label><input type="text" id="fName" maxlength="40" placeholder="e.g. Gym, Read 20 pages" value="${esc(h?h.name:'')}"></div>${emojiPicker(form.emoji)}${colorPicker(form.ci)}<div class="f"><div class="lb">Category</div>${chipSet(HCATS,form.cat,'fCat')}</div><div class="f"><div class="lb">Repeat</div>${chipSet(['Every day','Weekdays','Weekends','Custom'],{daily:'Every day',weekdays:'Weekdays',weekends:'Weekends',custom:'Custom'}[form.freq],'fFreq')}<div id="fDays" class="${form.freq==='custom'?'':'hidden'}" style="margin-top:6px">${dayPicker(form.days)}</div></div><div class="f"><label>Reminder (optional)</label><input type="time" id="fRem" value="${esc(h&&h.reminder||'')}"></div><div class="actions">${h?'<button class="btn danger" data-act="fDelete">Delete</button>':''}<button class="btn grad" data-act="fSave">${h?'Save':'Create habit'}</button></div>`);
}
function taskSheet(id){
  const t=id?state.tasks.find(x=>x.id===id):null;
  form={kind:'task',id,emoji:t?meta(t,true).emoji:'📌',ci:t?meta(t,true).ci:4,cat:t?t.category:'College',prio:t?t.priority:'Medium',repeat:t?t.repeat:false,days:t?[...(t.days||[])]:[1,3,5]};
  openSheet(`<h2>${t?'Edit task':'New task'}</h2><div class="f"><label>Name</label><input type="text" id="fName" maxlength="60" placeholder="e.g. Finish DSA practice" value="${esc(t?t.name:'')}"></div><div class="f"><label>Due / start date</label><input type="date" id="fDate" value="${esc(t?t.date:sel)}"></div>${emojiPicker(form.emoji)}${colorPicker(form.ci)}<div class="f"><div class="lb">Priority</div>${chipSet(['Low','Medium','High'],form.prio,'fPrio')}</div><div class="f"><div class="lb">Category</div>${chipSet(TCATS,form.cat,'fCat')}</div><div class="setRow" style="border:0;padding:0 0 12px"><b>Repeat weekly</b><button type="button" class="sw ${form.repeat?'on':''}" data-act="fRepeat"></button></div><div id="fDays" class="f ${form.repeat?'':'hidden'}">${dayPicker(form.days)}</div><div class="actions">${t?'<button class="btn danger" data-act="fDelete">Delete</button>':''}<button class="btn grad" data-act="fSave">${t?'Save':'Create task'}</button></div>`);
}
function reselect(act,v){document.querySelectorAll(`#sheetRoot [data-act="${act}"]`).forEach(b=>b.classList.toggle('on',b.dataset.v==String(v)))}
async function saveForm(){
  const name=($('fName').value||'').trim();if(!name){toast('Give it a name first');$('fName').focus();return}
  if(form.kind==='habit'){
    if(form.freq==='custom'&&!form.days.length){toast('Pick at least one day');return}
    const days=form.freq==='daily'?DAYNUM:form.freq==='weekdays'?[1,2,3,4,5]:form.freq==='weekends'?[6,0]:form.days,rem=$('fRem').value;
    if(form.id){Object.assign(state.habits.find(x=>x.id===form.id),{name,category:form.cat,frequency:form.freq,days,reminder:rem,emoji:form.emoji,ci:form.ci})}
    else state.habits.push({id:uid(),name,category:form.cat,frequency:form.freq,days,target:1,reminder:rem,emoji:form.emoji,ci:form.ci,createdAt:stamp()});
    if(rem)await ensureNotifPerm();
  }else{
    const date=$('fDate').value;if(!date){toast('Pick a date');return}
    if(form.repeat&&!form.days.length){toast('Pick at least one day');return}
    const f={name,date,startDate:date,repeat:form.repeat,days:form.repeat?form.days:[],priority:form.prio,category:form.cat,emoji:form.emoji,ci:form.ci};
    if(form.id)Object.assign(state.tasks.find(x=>x.id===form.id),f);else state.tasks.push({id:uid(),...f,createdAt:stamp()});
  }
  save();closeSheet();render();syncReminders();buzz('ok');toast(form.id?'Saved ✓':'Added ✓')
}
async function deleteForm(){
  const isH=form.kind==='habit';
  if(!await ask(`Delete this ${form.kind}?`,'Its history will be removed too. This can’t be undone.','Delete','Keep',true))return;
  const id=form.id,pref=id+'|';
  if(isH){state.habits=state.habits.filter(h=>h.id!==id);['checks','checkTimes'].forEach(m=>Object.keys(state[m]).forEach(k=>{if(k.startsWith(pref))delete state[m][k]}))}
  else{state.tasks=state.tasks.filter(t=>t.id!==id);['taskChecks','taskCheckTimes'].forEach(m=>Object.keys(state[m]).forEach(k=>{if(k.startsWith(pref))delete state[m][k]}))}
  save();closeSheet();render();syncReminders();toast('Deleted')
}

/* ---------- reminders (native only) ---------- */
async function ensureNotifPerm(){try{const L=isNative()&&plug('LocalNotifications');if(!L)return false;let p=await L.checkPermissions();if(p.display!=='granted')p=await L.requestPermissions();return p.display==='granted'}catch(e){return false}}
const nid=(id,wd)=>(hash(id)%200000000)*10+wd;
async function syncReminders(){
  try{const L=isNative()&&plug('LocalNotifications');if(!L)return;
    const pend=await L.getPending();if(pend.notifications&&pend.notifications.length)await L.cancel({notifications:pend.notifications.map(n=>({id:n.id}))});
    if(localStorage.getItem(REM_KEY)==='0')return;
    if((await L.checkPermissions()).display!=='granted')return;
    const list=[];state.habits.forEach(h=>{if(!h.reminder)return;const[hh,mm]=h.reminder.split(':').map(Number);daysFor(h).forEach(d=>list.push({id:nid(h.id,d+1),title:`${meta(h).emoji} ${h.name}`,body:'Time to check in — keep your streak alive 🔥',schedule:{on:{weekday:d+1,hour:hh,minute:mm},allowWhileIdle:true}}))});
    if(list.length)await L.schedule({notifications:list})
  }catch(e){}
}

/* ---------- confetti ---------- */
function confetti(){try{
  const c=$('confetti'),x=c.getContext('2d');c.width=innerWidth*devicePixelRatio;c.height=innerHeight*devicePixelRatio;x.scale(devicePixelRatio,devicePixelRatio);
  const cols=['#feda75','#fa7e1e','#d62976','#962fbf','#4f5bd5','#2ee59d','#fffc00'];
  const ps=Array.from({length:130},()=>({x:innerWidth/2,y:innerHeight*.45,vx:(Math.random()-.5)*16,vy:-Math.random()*16-5,s:Math.random()*8+4,r:Math.random()*6,vr:(Math.random()-.5)*.4,c:cols[Math.random()*cols.length|0]}));
  let f=0;(function tick(){x.clearRect(0,0,innerWidth,innerHeight);ps.forEach(p=>{p.vy+=.45;p.x+=p.vx;p.y+=p.vy;p.vx*=.99;p.r+=p.vr;x.save();x.translate(p.x,p.y);x.rotate(p.r);x.fillStyle=p.c;x.fillRect(-p.s/2,-p.s/3,p.s,p.s*.6);x.restore()});if(++f<110)requestAnimationFrame(tick);else x.clearRect(0,0,innerWidth,innerHeight)})()
}catch(e){}}

/* ---------- auth ---------- */
function showAuthMsg(m,err){const e=$('authMsg');e.textContent=m;e.className='authMsg show '+(err?'error':'ok')}
function setAuthMode(m){authMode=m;$('loginTab').classList.toggle('on',m==='login');$('registerTab').classList.toggle('on',m==='register');$('authTitle').textContent=m==='login'?'Welcome back':'Create your account';$('authSubmit').textContent=m==='login'?'Login':'Create account';$('nameWrap').classList.toggle('hidden',m==='login');$('authPassword').autocomplete=m==='login'?'current-password':'new-password';$('authMsg').className='authMsg'}
function showApp(user){sessionUser=user;$('auth').classList.add('hidden');$('app').classList.remove('hidden');if(!sel)sel=today()}
function showAuth(){sessionUser=null;cloudLoaded=false;$('app').classList.add('hidden');$('auth').classList.remove('hidden')}
async function onSignedIn(user){const prev=localStorage.getItem(ACCT_KEY);if(prev&&prev!==user.id){state=clone(EMPTY);localStorage.setItem(KEY,JSON.stringify(state));setDirty(false)}showApp(user);tab='home';await loadCloud()}
async function handleAuth(e){
  e.preventDefault();
  if(!CLOUD){showAuthMsg('Cloud isn’t configured in this build. Use “Skip for now”, or add your Supabase keys to supabase-config.js.',true);return}
  const email=$('authEmail').value.trim(),password=$('authPassword').value,name=$('authName').value.trim();$('authSubmit').disabled=true;$('authMsg').className='authMsg';
  try{
    if(authMode==='register'){const r=await sb.auth.signUp({email,password,options:{data:{full_name:name}}});if(r.error)throw r.error;if(r.data.session){localStorage.removeItem(GUEST_KEY);await onSignedIn(r.data.user)}else showAuthMsg('Account created. Check your email to confirm it, then log in.')}
    else{const r=await sb.auth.signInWithPassword({email,password});if(r.error)throw r.error;localStorage.removeItem(GUEST_KEY);await onSignedIn(r.data.user)}
  }catch(err){let m=err.message||'Authentication failed.';if(/fetch/i.test(m))m='Can’t reach Supabase. Check your internet connection, and that the Supabase project isn’t paused.';showAuthMsg(m,true)}
  finally{$('authSubmit').disabled=false}
}
async function logout(){
  if(isDirty()&&!await ask('Unsynced changes','Some changes haven’t reached the cloud yet. Logging out now will lose them.','Log out anyway','Cancel',true))return;
  if(sb)try{await sb.auth.signOut()}catch(e){}
  cloudLoaded=false;state=clone(EMPTY);localStorage.setItem(KEY,JSON.stringify(state));localStorage.removeItem(ACCT_KEY);setDirty(false);syncReminders();showAuth();setAuthMode('login')
}

/* ---------- events ---------- */
let dragged=false;
document.addEventListener('click',async ev=>{
  const el=ev.target.closest('[data-act]');if(!el)return;
  if(dragged){dragged=false;return}
  const a=el.dataset.act,d=el.dataset;
  switch(a){
    case'tab':tab=d.tab;$('screens').querySelectorAll('.screen').forEach(s=>s.scrollTop=0);render();break;
    case'add':openAdd();break;
    case'addhabit':habitSheet();break;
    case'addtask':taskSheet();break;
    case'closeSheet':closeSheet();break;
    case'toggle':ev.stopPropagation();toggle(d.kind,d.id,d.date);break;
    case'trk':toggle(d.kind,d.id,d.date);break;
    case'edit':d.kind==='habit'?habitSheet(d.id):taskSheet(d.id);break;
    case'seldate':sel=d.date;render();break;
    case'seg':statSeg=d.seg;render();break;
    case'mon':if(!(Number(d.d)>0&&monthOff>=0)){monthOff+=Number(d.d);render()}break;
    case'theme':localStorage.setItem(THEME_KEY,d.v);applyTheme();render();break;
    case'rem':{const on=localStorage.getItem(REM_KEY)==='0';localStorage.setItem(REM_KEY,on?'1':'0');if(on&&isNative()&&!await ensureNotifPerm())toast('Allow notifications in Android settings to get reminders');syncReminders();render();break}
    case'sync':if(!sessionUser){showAuth();break}if(isDirty()){toast('Syncing…');const ok=await saveCloud();toast(ok?'Synced ✓':'Still offline — will retry automatically')}else{toast('Syncing…');await loadCloud();toast('Synced ✓')}render();break;
    case'export':{try{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),u=URL.createObjectURL(blob),l=document.createElement('a');l.href=u;l.download='habitflow-backup.json';document.body.appendChild(l);l.click();l.remove();toast('Backup exported')}catch(e){toast('Export isn’t available here')}break}
    case'logout':logout();break;
    case'reset':if(await ask('Reset everything?','All habits, tasks and history will be erased'+(sessionUser?' from this device and the cloud':'')+'.','Erase all','Cancel',true)){state=clone(EMPTY);save();syncReminders();render();toast('All data erased')}break;
    case'fEmoji':form.emoji=d.v;reselect('fEmoji',d.v);break;
    case'fColor':form.ci=Number(d.v);reselect('fColor',d.v);break;
    case'fCat':form.cat=d.v;reselect('fCat',d.v);break;
    case'fPrio':form.prio=d.v;reselect('fPrio',d.v);break;
    case'fFreq':{form.freq={'Every day':'daily',Weekdays:'weekdays',Weekends:'weekends',Custom:'custom'}[d.v];reselect('fFreq',d.v);$('fDays').classList.toggle('hidden',form.freq!=='custom');break}
    case'fDay':{const v=Number(d.v);form.days=form.days.includes(v)?form.days.filter(x=>x!==v):[...form.days,v];el.classList.toggle('on')}break;
    case'fRepeat':form.repeat=!form.repeat;el.classList.toggle('on',form.repeat);$('fDays').classList.toggle('hidden',!form.repeat);break;
    case'fSave':saveForm();break;
    case'fDelete':deleteForm();break;
  }
});
/* swipe right to complete */
(function(){
  let sx=0,sy=0,box=null,item=null,active=false,locked=false;
  document.addEventListener('pointerdown',e=>{const s=e.target.closest('.swipe');if(!s||e.target.closest('.chk'))return;box=s;item=s.querySelector('.item');sx=e.clientX;sy=e.clientY;active=true;locked=false});
  document.addEventListener('pointermove',e=>{if(!active)return;const dx=e.clientX-sx,dy=e.clientY-sy;if(!locked){if(Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx)){active=false;return}if(dx>10&&dx>Math.abs(dy)*1.4){locked=true;item.classList.add('drag');try{item.setPointerCapture(e.pointerId)}catch(_){}}else return}
    const x=Math.max(0,Math.min(dx,150));item.style.transform=`translateX(${x}px)`;box.querySelector('.swipeBg').style.opacity=Math.min(1,x/90)});
  const end=e=>{if(!active)return;active=false;if(!locked)return;const dx=e.clientX-sx;item.classList.remove('drag');item.style.transform='';box.querySelector('.swipeBg').style.opacity=0;dragged=true;setTimeout(()=>dragged=false,60);if(dx>90&&!item.classList.contains('done')){const d=box.dataset;toggle(d.kind,d.id,d.date)}else if(dx>90){buzz();toast('Already done ✓')}};
  document.addEventListener('pointerup',end);document.addEventListener('pointercancel',end);
})();
let lastDay=today();document.addEventListener('visibilitychange',()=>{if(document.hidden)return;if(today()!==lastDay){lastDay=today();sel=today()}if(!$('app').classList.contains('hidden'))render()});

/* ---------- boot ---------- */
async function boot(){
  applyTheme();
  $('loginTab').onclick=()=>setAuthMode('login');$('registerTab').onclick=()=>setAuthMode('register');$('authForm').onsubmit=handleAuth;
  $('pwToggle').onclick=()=>{const p=$('authPassword');p.type=p.type==='password'?'text':'password'};
  $('guestBtn').onclick=()=>{localStorage.setItem(GUEST_KEY,'1');showApp(null);render()};
  setAuthMode('login');
  try{const A=isNative()&&plug('App');if(A)A.addListener('backButton',()=>{if($('dialogRoot').classList.contains('open'))return;if(sheetOpen)closeSheet();else if(!$('auth').classList.contains('hidden')&&localStorage.getItem(GUEST_KEY))showApp(null);else if(tab!=='home'){tab='home';render()}else A.exitApp()})}catch(e){}
  try{if(!isNative()&&'serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('sw.js')}catch(e){}
  try{
    if(CLOUD){const{data}=await sb.auth.getSession();if(data&&data.session){showApp(data.session.user);render();await loadCloud()}
      else if(localStorage.getItem(GUEST_KEY)){showApp(null);render()}else showAuth()}
    else{if(localStorage.getItem(GUEST_KEY)){showApp(null);render()}else{showAuth();showAuthMsg('Cloud sync isn’t configured — you can still use the app on this device.',false)}}
  }catch(e){if(localStorage.getItem(GUEST_KEY)){showApp(null);render()}else showAuth()}
  $('boot').classList.add('out');setTimeout(()=>$('boot').remove(),400);
}
boot();
