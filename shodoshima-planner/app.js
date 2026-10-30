const DAY_NAMES={pool:'未安排',d1:'11/5',d2:'11/6',d3:'11/7'};
const DAYS=['pool','d1','d2','d3'];
const STORAGE='shodoshima-planner-v2';
const m=(h,mm=0)=>h*60+mm;
const all={d1:[m(0),m(24)],d2:[m(0),m(24)],d3:[m(0),m(24)]};
const hrs=(start,end,days=['d1','d2','d3'])=>Object.fromEntries(days.map(d=>[d,[start,end]]));
const P=(id,name,zone,lat,lng,duration,map,hoursText,hours,extra={})=>({id,name,zone,lat,lng,duration,map,hoursText,hours,required:true,...extra});

const items=[
  P('ferry-in','高松港 → 土庄港（已預約）','港口',34.48926,134.17179,60,'','08:02–09:02',all,{fixed:true,fixedStart:m(8,2),fixedEnd:m(9,2)}),
  P('stay-checkin','The Stay 入住','西南・住宿',34.469,134.169,30,'','15:30 固定',all,{fixed:true,fixedStart:m(15,30),fixedEnd:m(16)}),
  P('stay-morning','The Stay 早餐／早晨','西南・住宿',34.469,134.169,90,'','08:00–09:30',all,{fixed:true,fixedStart:m(8),fixedEnd:m(9,30)}),
  P('stay-out','The Stay 退房','西南・住宿',34.469,134.169,30,'','09:30–10:00',all,{fixed:true,fixedStart:m(9,30),fixedEnd:m(10)}),
  P('kairo-checkin','天空飯店海廬 入住','土庄・住宿',34.4802333,134.1860361,10,'','16:00 固定',all,{fixed:true,fixedStart:m(16),fixedEnd:m(16,10)}),
  P('angel','天使之路（乾潮）','土庄',34.4798,134.1888,75,'https://maps.google.com/?q=Angel+Road+Shodoshima','乾潮可走 12:34–18:34',hrs(m(12,34),m(18,34),['d2']),{fixed:true,fixedStart:m(16,15),fixedEnd:m(17,30)}),
  P('kairo-dinner','飯店晚餐／溫泉','土庄・住宿',34.4802333,134.1860361,90,'','18:30–20:00',all,{fixed:true,fixedStart:m(18,30),fixedEnd:m(20)}),
  P('kairo-out','天空飯店海廬 退房','土庄・住宿',34.4802333,134.1860361,30,'','09:30–10:00',all,{fixed:true,fixedStart:m(9,30),fixedEnd:m(10)}),
  P('port-buffer','抵達土庄港／車輛報到','港口',34.48926,134.17179,50,'','13:10 前抵達',all,{fixed:true,fixedStart:m(13,10),fixedEnd:m(14)}),
  P('ferry-out','土庄港 → 高松港（已預約）','港口',34.48926,134.17179,70,'','14:00–15:10',all,{fixed:true,fixedStart:m(14),fixedEnd:m(15,10)}),

  P('olive-park','小豆島橄欖公園','中部・橄欖區',34.4728411,134.2736368,75,'https://maps.app.goo.gl/p534wb6dfo7qeZk99','08:30–17:00',hrs(m(8,30),m(17))),
  P('tomigaoka','富丘八幡神社','土庄',34.4857641,134.1954157,35,'https://maps.app.goo.gl/SiRYivYkk7hjFMVx7','戶外；白天較佳',hrs(m(7),m(17,30))),
  P('nishinotaki','西之瀧 龍水寺','山區',34.489333,134.223869,50,'https://maps.app.goo.gl/8TYEpufYbssYWXas7','白天參拜',hrs(m(8),m(17)),{mountain:true}),
  P('olive-garden','小豆島橄欖園','中部・橄欖區',34.4709007,134.2705505,45,'https://maps.app.goo.gl/MJoz1qah2AKApAdn8','約 08:30–17:00',hrs(m(8,30),m(17))),
  P('olive-beach','橄欖海灘','中部・橄欖區',34.4691004,134.2743833,30,'https://maps.app.goo.gl/NHtaYtW1XhJt9A2d8','戶外；日落前',hrs(m(7),m(17,15))),
  P('furusato','道之驛 小豆島ふるさと村','中西部',34.4709823,134.2360533,50,'https://maps.app.goo.gl/ARdVjEmJKi6frtiR9','11 月時段請再確認',hrs(m(8,30),m(17))),
  P('inoue','井上誠耕園','中西部',34.4864423,134.2342899,60,'https://maps.app.goo.gl/b43MwUSh55CC1f23A','09:00–17:00',hrs(m(9),m(17))),
  P('masago','真砂喜之助製麵所（購物）','中西部',34.4853667,134.23242,25,'https://maps.app.goo.gl/CpkN9na5AotK4LvVA','12:30–17:30',hrs(m(12,30),m(17,30))),
  P('ginshiro','銀四郎：生素麵','土庄',34.4884481,134.1710556,60,'https://maps.app.goo.gl/v2Dtb2kdasScjeCm9','10:00–16:00',hrs(m(10),m(16)),{choice:'somen'}),
  P('nakabuan','なかぶ庵：生素麵','東部',34.4827173,134.3225545,70,'https://maps.app.goo.gl/R9R1tSv5uq3s5Coj9','週四休；週五約 10:00–14:00',hrs(m(10),m(14),['d2','d3']),{choice:'somen'}),
  P('morikuni-sake','小豆島酒造／森國酒造','東部・醬之鄉',34.47226,134.3191045,45,'https://maps.app.goo.gl/47CHYBtbxPzaRHEd9','週四休；09:00–17:00',hrs(m(9),m(17),['d2','d3'])),
  P('georges','GEORGES gallery＋KOHIRA cafe','東部・醬之鄉',34.4745512,134.3184838,60,'https://maps.app.goo.gl/WRB33jcQVR3d1e7s9','約 10:00–16:00',hrs(m(10),m(16))),
  P('morikuni-bakery','森國ベーカリー','東部・醬之鄉',34.4724842,134.3189499,30,'https://maps.app.goo.gl/Q2HbuvWKCiwfeM876','週四休；09:00–17:00',hrs(m(9),m(17),['d2','d3'])),
  P('yamaroku','ヤマロク醬油','東部・醬之鄉',34.4862528,134.3207175,45,'https://maps.app.goo.gl/ST5pqEz31Ekd8Ldn8','09:00–17:00',hrs(m(9),m(17))),
  P('marushima','丸島醬油','東部・醬之鄉',34.4846579,134.3025438,35,'https://maps.app.goo.gl/4PSUsXkhQpWoeZSt8','08:00–17:00',hrs(m(8),m(17))),
  P('scoop','Scoop','土庄',34.4857111,134.1790362,35,'https://maps.app.goo.gl/qdKDPYbHfKD7AZU39','週四休；10:00–18:00',hrs(m(10),m(18),['d2','d3'])),
  P('yamada','山田橄欖園小店（喝咖啡）','中部・橄欖區',34.4740941,134.2739305,55,'https://www.google.com.tw/maps/place/%E5%B1%B1%E7%94%B0%E3%82%AA%E3%83%AA%E3%83%BC%E3%83%96%E5%9C%92+%E5%B0%8F%E3%81%95%E3%81%AA%E3%81%8A%E5%BA%97/','週五～日 10:00–17:00；11/6 必去',hrs(m(10),m(17),['d2','d3']),{onlyDay:'d2'}),
  P('rukiyu','Rukiyu 取生日蛋糕','土庄',34.4836267,134.1895216,20,'https://maps.app.goo.gl/sPn89SFsgqDU9top9','11:00–18:30；蛋糕須先確認',hrs(m(11),m(18,30)),{note:'尚未確認預約／冷藏'}),

  P('senken','千軒海灘','西南',34.4663946,134.149318,35,'https://maps.app.goo.gl/Vew4ewVkixG3D9wg9','戶外；日落前',hrs(m(7),m(17,15)),{required:false}),
  P('kankakei','寒霞溪纜車','山區',34.5082579,134.2963434,110,'https://www.kankakei.co.jp/ropeway/','紅葉期約 08:00–17:00',hrs(m(8),m(17)),{required:false,mountain:true}),
  P('hope','希望之道','東部',34.4917208,134.3519444,45,'https://maps.app.goo.gl/84zsoVdm5BNJfeP26','戶外；潮位與日照需確認',hrs(m(8),m(17)),{required:false})
];
const byId=Object.fromEntries(items.map(x=>[x.id,x]));
const initial={pool:items.filter(x=>!x.fixed&&x.id!=='yamada').map(x=>x.id),d1:['ferry-in','stay-checkin'],d2:['stay-morning','stay-out','yamada','kairo-checkin','angel','kairo-dinner'],d3:['kairo-out','port-buffer','ferry-out']};
let state=load(); let dragged=null;
function load(){try{const x=JSON.parse(localStorage.getItem(STORAGE));if(x&&DAYS.every(d=>Array.isArray(x.order[d])))return x}catch(e){}return{order:structuredClone(initial),durations:Object.fromEntries(items.map(x=>[x.id,x.duration]))}}
function save(){localStorage.setItem(STORAGE,JSON.stringify(state))}
const fmt=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
function hav(a,b){const R=6371,r=Math.PI/180,d1=(b.lat-a.lat)*r,d2=(b.lng-a.lng)*r;const q=Math.sin(d1/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(d2/2)**2;return 2*R*Math.asin(Math.sqrt(q))}
function drive(a,b){if(!a||!b)return 0;const d=hav(a,b);if(d<.18)return 0;if(d<1)return 5;const mountain=a.mountain||b.mountain;const raw=d*(mountain?1.75:1.42)/(mountain?26:34)*60+(mountain?8:3);return Math.max(5,Math.ceil(raw/5)*5)}
function schedule(day){let cur=day==='d1'?m(8,2):day==='d2'?m(8):m(9,30),prev=null;return state.order[day].map(id=>{const x=byId[id],travel=prev?drive(prev,x):0;let arrival=cur+travel,warn=[];if(x.fixed){if(arrival>x.fixedStart+1)warn.push(`前段超時 ${arrival-x.fixedStart} 分`);cur=x.fixedEnd}else{const win=x.hours?.[day];if(!win)warn.push('這天休業／不開放');else{if(arrival<win[0])arrival=win[0];if(arrival+(state.durations[id]||x.duration)>win[1])warn.push('會超過營業／開放時間')}if(x.onlyDay&&x.onlyDay!==day)warn.push(`限定排 ${DAY_NAMES[x.onlyDay]}`);cur=arrival+(state.durations[id]||x.duration)}prev=x;return{x,travel,start:x.fixed?x.fixedStart:arrival,end:x.fixed?x.fixedEnd:cur,warn}})}
function card(x,day,timing){const dur=state.durations[x.id]||x.duration;const warnings=timing?.warn||[];const moveOptions=DAYS.map(d=>`<option value="${d}" ${d===day?'selected':''}>${DAY_NAMES[d]}</option>`).join('');return `<article class="card ${x.fixed?'fixed':x.required?'must':''} ${warnings.length?'warning':''}" data-id="${x.id}" draggable="${!x.fixed}">
  ${day!=='pool'?`<div class="time">${fmt(timing.start)}–${fmt(timing.end)}</div>`:''}<h3>${x.name}</h3><div class="meta">${x.zone} · ${x.hoursText}</div>
  <div class="tags"><span class="tag ${x.fixed?'fixed':x.required?'must':''}">${x.fixed?'固定':x.required?'一定要去':'想去'}</span>${x.choice?'<span class="tag">生素麵二選一</span>':''}${x.note?`<span class="tag">${x.note}</span>`:''}</div>
  ${warnings.map(w=>`<div class="warning-text">⚠ ${w}</div>`).join('')}
  <div class="controls">${x.fixed?'<span class="locked">不可移動</span>':`<label>停留 <input type="number" min="5" max="300" step="5" value="${dur}" data-duration="${x.id}"> 分</label><select data-move="${x.id}" aria-label="移到日期">${moveOptions}</select>`}${x.map?`<a class="map" href="${x.map}" target="_blank" rel="noreferrer">地圖 ↗</a>`:''}</div></article>`}
function render(){DAYS.forEach(day=>{const el=document.getElementById(day);if(day==='pool')el.innerHTML=state.order.pool.map(id=>card(byId[id],day)).join('');else{const rows=schedule(day);el.innerHTML=rows.map(r=>(r.travel?`<div class="travel">約車程 ${r.travel} 分</div>`:'')+card(r.x,day,r)).join('');const last=rows.at(-1);document.getElementById(day+'Summary').textContent=last?`排到 ${fmt(last.end)}`:'空白'}});document.getElementById('poolCount').textContent=`${state.order.pool.length} 個`;bind();save()}
function bind(){document.querySelectorAll('.card[draggable="true"]').forEach(el=>{el.ondragstart=e=>{dragged=el.dataset.id;el.classList.add('dragging');e.dataTransfer.effectAllowed='move'};el.ondragend=()=>{dragged=null;el.classList.remove('dragging')}});document.querySelectorAll('.dropzone').forEach(z=>{z.ondragover=e=>{e.preventDefault();z.classList.add('dragover')};z.ondragleave=()=>z.classList.remove('dragover');z.ondrop=e=>{e.preventDefault();z.classList.remove('dragover');if(!dragged)return;const before=e.target.closest('.card')?.dataset.id;move(dragged,z.id,before)}});document.querySelectorAll('[data-duration]').forEach(i=>i.onchange=()=>{state.durations[i.dataset.duration]=Math.max(5,Number(i.value)||5);render()});document.querySelectorAll('[data-move]').forEach(s=>s.onchange=()=>move(s.dataset.move,s.value))}
function move(id,to,before){if(byId[id].fixed)return;DAYS.forEach(d=>state.order[d]=state.order[d].filter(x=>x!==id));const at=before?state.order[to].indexOf(before):-1;if(at>=0)state.order[to].splice(at,0,id);else state.order[to].push(id);render()}
function toast(t){const e=document.getElementById('toast');e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),1800)}
document.getElementById('resetBtn').onclick=()=>{if(confirm('要恢復最初配置嗎？')){localStorage.removeItem(STORAGE);state=load();render()}};
document.getElementById('copyBtn').onclick=async()=>{let text='小豆島行程（2026）\n';['d1','d2','d3'].forEach(d=>{text+=`\n${DAY_NAMES[d]}\n`;schedule(d).forEach(r=>{if(r.travel)text+=`  約車程 ${r.travel} 分\n`;text+=`${fmt(r.start)}–${fmt(r.end)} ${r.x.name}${r.warn.length?' ⚠ '+r.warn.join('、'):''}\n`})});await navigator.clipboard.writeText(text);toast('行程已複製')};
render();
