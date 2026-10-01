const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
let contacts=[];

function fmtDate(v){ if(!v)return "-"; const [y,m,d]=v.split("-"); return `${d}/${m}/${y}`; }
function money(v,c="VND"){ return v ? `${Number(v).toLocaleString("vi-VN")} ${c}` : "-"; }
function badge(v){ return `<span class="badge ${esc(v)}">${esc(v||"-")}</span>`; }
async function api(url, opts={}){ const r=await fetch(url,{cache:"no-store",headers:{"content-type":"application/json",...(opts.headers||{})},...opts}); const data=await r.json().catch(()=>({})); if(!r.ok) throw new Error(data.error||`HTTP ${r.status}`); return data; }
function empty(root,text="Chưa có dữ liệu."){ root.innerHTML=`<div class="empty">${esc(text)}</div>`; }

$$('.nav').forEach(btn=>btn.addEventListener('click',()=>{
  $$('.nav').forEach(x=>x.classList.remove('active')); btn.classList.add('active');
  $$('.view').forEach(x=>x.classList.remove('active')); $(`#view-${btn.dataset.view}`).classList.add('active');
  $('#page-title').textContent=btn.textContent.trim();
  if(btn.dataset.view==='contacts') loadContacts();
  if(btn.dataset.view==='dispatch') loadDashboard();
}));
setInterval(()=>$('#clock').textContent=new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',dateStyle:'medium',timeStyle:'short'}).format(new Date()),1000);

function fillForm(data){
  const f=$('#booking-form');
  for(const [k,v] of Object.entries(data||{})){ const el=f.elements[k]; if(el && v!=null) el.value=v; }
}
$('#parse-btn').addEventListener('click',async()=>{
  const text=$('#paste-source').value.trim(); if(!text)return;
  try{ const data=await api('/api/v1/parse',{method:'POST',body:JSON.stringify({text})}); fillForm(data.result); }
  catch(e){ alert('Không parse được: '+e.message); }
});
$('#clear-btn').addEventListener('click',()=>{ $('#paste-source').value=''; $('#booking-form').reset(); });
$('#booking-form').addEventListener('submit',async e=>{
  e.preventDefault(); const f=e.currentTarget; const body=Object.fromEntries(new FormData(f).entries());
  body.guests=body.guests?Number(body.guests):null; body.total_amount=body.total_amount?Number(body.total_amount):null; body.source_text=$('#paste-source').value.trim();
  $('#save-status').textContent='Đang lưu...';
  try{ const r=await api('/api/v1/bookings',{method:'POST',body:JSON.stringify(body)}); $('#save-status').textContent=`Đã lưu ${r.booking_code}`; f.reset(); $('#paste-source').value=''; loadDashboard(); }
  catch(err){ $('#save-status').textContent='Lỗi: '+err.message; }
});

function bookingRows(rows){
  if(!rows.length)return '<div class="empty">Chưa có booking.</div>';
  return `<div class="row head"><span>Khách</span><span>Giờ</span><span>Tour</span><span>Trạng thái</span><span>Pickup</span></div>`+rows.map(b=>`<div class="row clickable" data-booking="${b.id}"><span><strong>${esc(b.representative||b.booking_code)}</strong><br><small>${esc(b.booking_code)}</small></span><span>${esc(b.pickup_time||b.start_time||'-')}</span><span>${esc(b.tour_type||'-')}</span><span>${badge(b.status)}</span><span>${esc(b.pickup_location||'-')}</span></div>`).join('');
}
function bindBookingClicks(root){ root.querySelectorAll('[data-booking]').forEach(x=>x.addEventListener('click',()=>openBooking(x.dataset.booking))); }

async function loadDashboard(){
  try{
    const d=await api('/api/v1/dashboard');
    $('#today-count').textContent=d.today_bookings.length; $('#tomorrow-count').textContent=d.tomorrow_bookings.length; $('#reminder-count').textContent=d.due_reminders.length;
    const t=$('#tomorrow-list'); t.innerHTML=bookingRows(d.tomorrow_bookings); bindBookingClicks(t);
    const r=$('#reminder-list');
    if(!d.due_reminders.length) empty(r,'Không có việc cần nhắc trong 36 giờ tới.');
    else r.innerHTML=d.due_reminders.map(x=>`<div class="panel" style="box-shadow:none;margin:10px 0;padding:14px"><div class="panel-head"><div><strong>${esc(x.contact_name||x.role||'Chưa rõ')}</strong> · ${esc(x.booking_code)}<div class="muted">${fmtDate(x.service_date)} · ${esc(x.representative||'-')}</div></div>${badge(x.status)}</div><div class="message-box">${esc(x.message||'')}</div><div class="actions"><button class="copy-reminder" data-msg="${encodeURIComponent(x.message||'')}">Copy tin Zalo</button><button class="secondary mark-sent" data-id="${x.id}">Đã gửi</button></div></div>`).join('');
    r.querySelectorAll('.copy-reminder').forEach(b=>b.addEventListener('click',()=>navigator.clipboard.writeText(decodeURIComponent(b.dataset.msg))));
    r.querySelectorAll('.mark-sent').forEach(b=>b.addEventListener('click',async()=>{ await api(`/api/v1/reminders/${b.dataset.id}/sent`,{method:'POST',body:'{}'}); loadDashboard(); }));
  }catch(e){ empty($('#reminder-list'),'Không tải được dashboard: '+e.message); }
}
$('#refresh-dashboard').addEventListener('click',loadDashboard);

async function search(){
  const q=$('#search-q').value.trim(); try{ const d=await api('/api/v1/bookings?q='+encodeURIComponent(q)); const root=$('#search-results'); root.innerHTML=bookingRows(d.results); bindBookingClicks(root); }
  catch(e){ empty($('#search-results'),'Lỗi: '+e.message); }
}
$('#search-btn').addEventListener('click',search); $('#search-q').addEventListener('keydown',e=>{if(e.key==='Enter')search();});

async function loadContacts(){
  try{ const d=await api('/api/v1/contacts'); contacts=d.results; const root=$('#contacts-list'); if(!contacts.length)return empty(root);
    root.innerHTML=`<div class="row head"><span>Tên</span><span>Loại</span><span>Zalo</span><span>Thu hộ</span><span>Ghi chú</span></div>`+contacts.map(c=>`<div class="row"><span><strong>${esc(c.name)}</strong><br><small>${esc(c.company||'')}</small></span><span>${esc(c.kind)}</span><span>${esc(c.zalo_phone||c.phone||'-')}</span><span>${c.can_collect_cash?'Có':'-'}</span><span>${esc(c.notes||'-')}</span></div>`).join('');
  }catch(e){ empty($('#contacts-list'),'Lỗi: '+e.message); }
}
$('#refresh-contacts').addEventListener('click',loadContacts);
$('#contact-form').addEventListener('submit',async e=>{
  e.preventDefault(); const body=Object.fromEntries(new FormData(e.currentTarget).entries()); body.can_collect_cash=e.currentTarget.elements.can_collect_cash.checked;
  try{ await api('/api/v1/contacts',{method:'POST',body:JSON.stringify(body)}); $('#contact-status').textContent='Đã lưu'; e.currentTarget.reset(); loadContacts(); }
  catch(err){ $('#contact-status').textContent='Lỗi: '+err.message; }
});

function assignmentOptions(role){
  const accepted = role.startsWith('driver') ? ['driver'] : role==='boat_partner' ? ['partner','captain'] : role==='cash_collector' ? ['partner','driver','captain','host','other'] : ['partner','driver','captain','host','other'];
  return contacts.filter(c=>accepted.includes(c.kind)).map(c=>`<option value="${c.id}">${esc(c.name)}${c.company?` - ${esc(c.company)}`:''}</option>`).join('');
}
async function openBooking(id){
  await loadContacts(); const b=await api('/api/v1/bookings/'+id); const root=$('#booking-detail'); root.classList.remove('hidden');
  $$('.nav').forEach(x=>x.classList.remove('active')); $('.nav[data-view="search"]').classList.add('active'); $$('.view').forEach(x=>x.classList.remove('active')); $('#view-search').classList.add('active'); $('#page-title').textContent='Booking detail';
  const activeByRole=Object.fromEntries((b.assignments||[]).map(a=>[a.role,a]));
  root.innerHTML=`
    <div class="panel-head"><div><div class="eyebrow">${esc(b.booking_code)}</div><h2>${esc(b.representative||'Chưa có tên khách')}</h2></div>${badge(b.status)}</div>
    <div class="detail-grid">
      <div><small>Ngày</small><strong>${fmtDate(b.service_date)}</strong></div><div><small>Pickup</small><strong>${esc(b.pickup_time||'-')}</strong></div><div><small>Điểm đón</small><strong>${esc(b.pickup_location||'-')}</strong></div>
      <div><small>Tour</small><strong>${esc(b.tour_type||'-')}</strong></div><div><small>Khách</small><strong>${esc(b.guests||'-')}</strong></div><div><small>Giá</small><strong>${money(b.total_amount,b.currency)}</strong></div>
      <div><small>Weather</small><strong>${esc(b.weather_status)}</strong></div><div><small>Payment</small><strong>${esc(b.payment_status)}</strong></div><div><small>Thu hộ bởi</small><strong>${esc(b.cash_collector_name||'-')}</strong></div>
    </div>
    <h2 style="margin-top:22px">Phân công</h2>
    ${['boat_partner','driver_outbound','driver_return','cash_collector'].map(role=>`<div class="assignment-grid" style="margin:10px 0"><div><small class="muted">${role}</small><div>${activeByRole[role]?`<strong>${esc(activeByRole[role].contact_name)}</strong> ${badge(activeByRole[role].status)}`:'<span class="muted">Chưa gán</span>'}</div></div><select data-role="${role}"><option value="">Chọn...</option>${assignmentOptions(role)}</select><button class="assign-btn" data-role="${role}">Gán</button></div>`).join('')}
    <h2 style="margin-top:22px">Lịch sử</h2><div class="timeline">${(b.events||[]).map(e=>`<div class="event"><strong>${esc(e.summary)}</strong><br><small>${esc(e.occurred_at)} · ${esc(e.event_type)}</small></div>`).join('')||'<div class="empty">Chưa có lịch sử.</div>'}</div>`;
  root.querySelectorAll('.assign-btn').forEach(btn=>btn.addEventListener('click',async()=>{ const role=btn.dataset.role; const select=root.querySelector(`select[data-role="${role}"]`); if(!select.value)return; await api(`/api/v1/bookings/${id}/assignments`,{method:'POST',body:JSON.stringify({role,contact_id:select.value})}); openBooking(id); loadDashboard(); }));
}

loadDashboard();
