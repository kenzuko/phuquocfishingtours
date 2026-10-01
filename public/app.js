const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
let contacts=[];

const STATUS_LABELS={
  inquiry:"Inquiry",hold:"Hold",confirmed:"Đã xác nhận",ready:"Sẵn sàng",running:"Đang chạy",completed:"Hoàn tất",cancelled:"Đã hủy",
  assigned:"Đã gán",notified:"Đã nhắc",sent:"Đã gửi",open:"Cần nhắc"
};
const ROLE_LABELS={
  boat_partner:"Đối tác tàu",driver_outbound:"Tài xế đón",driver_return:"Tài xế về",cash_collector:"Người thu tiền",captain:"Thuyền trưởng",host:"Host"
};

function fmtDate(v){
  if(!v)return "-";
  const [y,m,d]=v.split("-");
  return `${d}/${m}/${y}`;
}
function money(v,c="VND"){ return v ? `${Number(v).toLocaleString("vi-VN")} ${c}` : "-"; }
function badge(v){ return `<span class="badge ${esc(v)}">${esc(STATUS_LABELS[v]||v||"-")}</span>`; }
function empty(root,text="Chưa có dữ liệu."){ root.innerHTML=`<div class="empty">${esc(text)}</div>`; }
async function api(url, opts={}){
  const r=await fetch(url,{cache:"no-store",headers:{"content-type":"application/json",...(opts.headers||{})},...opts});
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error||`HTTP ${r.status}`);
  return data;
}
async function copyText(value, button){
  try{
    await navigator.clipboard.writeText(value);
    if(button){
      const old=button.textContent;
      button.textContent="Đã copy";
      setTimeout(()=>button.textContent=old,1200);
    }
  }catch{
    const t=document.createElement("textarea");
    t.value=value; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove();
  }
}
function setView(view,title){
  $$('.nav').forEach(x=>x.classList.toggle('active',x.dataset.view===view));
  $$('.view').forEach(x=>x.classList.remove('active'));
  const target=$(`#view-${view}`);
  if(target) target.classList.add('active');
  $('#page-title').textContent=title||($('.nav[data-view="'+view+'"] span:last-child')?.textContent||"Fishing Desk");
  if(view==='contacts') loadContacts();
  if(view==='dispatch') loadDashboard();
  if(view==='search') search();
  window.scrollTo({top:0,behavior:'smooth'});
}

$$('.nav').forEach(btn=>btn.addEventListener('click',()=>setView(btn.dataset.view)));
$('.jump-new')?.addEventListener('click',()=>setView('new','Tạo booking'));

function updateClock(){
  $('#clock').textContent=new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date());
}
updateClock(); setInterval(updateClock,30000);

function fillForm(data){
  const form=$('#booking-form');
  for(const [k,v] of Object.entries(data||{})){
    const el=form.elements[k];
    if(el && v!=null) el.value=v;
  }
}
$('#parse-btn').addEventListener('click',async()=>{
  const text=$('#paste-source').value.trim();
  if(!text)return;
  const btn=$('#parse-btn'); btn.disabled=true; btn.textContent='Đang đọc...';
  try{
    const data=await api('/api/v1/parse',{method:'POST',body:JSON.stringify({text})});
    const parsed={...data.result,public_notes:data.result?.notes||""};
    delete parsed.notes;
    fillForm(parsed);
  }catch(e){ alert('Không parse được: '+e.message); }
  finally{ btn.disabled=false; btn.textContent='Tự điền thông tin'; }
});
$('#clear-btn').addEventListener('click',()=>{
  $('#paste-source').value='';
  $('#booking-form').reset();
  $('#create-success').classList.add('hidden');
});
$$('.tour-preset').forEach(card=>card.addEventListener('click',()=>{
  $$('.tour-preset').forEach(x=>x.classList.remove('selected'));
  card.classList.add('selected');
  const form=$('#booking-form');
  form.elements.tour_type.value=card.dataset.tour||'';
  form.elements.start_time.value=card.dataset.start||'';
  form.elements.end_time.value=card.dataset.end||'';
  form.scrollIntoView({behavior:'smooth',block:'start'});
}));

$('#booking-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const form=e.currentTarget;
  const body=Object.fromEntries(new FormData(form).entries());
  body.guests=body.guests?Number(body.guests):null;
  body.total_amount=body.total_amount?Number(body.total_amount):null;
  body.source_text=$('#paste-source').value.trim();
  $('#save-status').textContent='Đang lưu...';
  try{
    const r=await api('/api/v1/bookings',{method:'POST',body:JSON.stringify(body)});
    $('#save-status').textContent='Đã lưu';
    $('#created-code').textContent=r.booking_code;
    $('#created-link').value=r.customer_trip_url;
    $('#open-created-link').href=r.customer_trip_url;
    $('#create-success').classList.remove('hidden');
    $('#copy-created-link').onclick=()=>copyText(r.customer_trip_url,$('#copy-created-link'));
    form.reset(); $('#paste-source').value=''; $$('.tour-preset').forEach(x=>x.classList.remove('selected'));
    $('#create-success').scrollIntoView({behavior:'smooth',block:'center'});
    loadDashboard();
  }catch(err){ $('#save-status').textContent='Lỗi: '+err.message; }
});

function dispatchRows(rows){
  if(!rows?.length)return '<div class="empty">Chưa có booking.</div>';
  return `<div class="dispatch-head"><span>Thời gian</span><span>Khách hàng</span><span>Tour</span><span>Tàu</span><span>Tài xế</span><span>Trạng thái</span></div>`+
    rows.map(b=>`<button class="dispatch-row" data-booking="${esc(b.id)}">
      <span class="time-cell"><strong>${esc(b.pickup_time||b.start_time||'-')}</strong><small>${esc(b.start_time&&b.end_time?`${b.start_time}-${b.end_time}`:'')}</small></span>
      <span class="guest-cell"><strong>${esc(b.representative||b.booking_code)}</strong><small>${esc(b.pickup_location||b.booking_code)}</small></span>
      <span><strong>${esc(b.tour_type||'-')}</strong><small>${esc(b.guests?b.guests+' khách':'')}</small></span>
      <span>${b.has_boat?'<span class="mini ok">✓ Đã gán</span>':'<span class="mini warn">Chưa gán</span>'}</span>
      <span>${b.has_driver?'<span class="mini ok">✓ Đã gán</span>':'<span class="mini warn">Chưa gán</span>'}</span>
      <span>${badge(b.status)}</span>
    </button>`).join('');
}
function searchRows(rows){
  if(!rows?.length)return '<div class="empty">Chưa có booking.</div>';
  return `<div class="search-result-head"><span>Khách</span><span>Ngày</span><span>Giờ đón</span><span>Tour</span><span>Trạng thái</span></div>`+
    rows.map(b=>`<button class="search-result-row" data-booking="${esc(b.id)}"><span><strong>${esc(b.representative||b.booking_code)}</strong><small>${esc(b.booking_code)}</small></span><span>${fmtDate(b.service_date)}</span><span>${esc(b.pickup_time||'-')}</span><span>${esc(b.tour_type||'-')}</span><span>${badge(b.status)}</span></button>`).join('');
}
function bindBookingClicks(root){ root.querySelectorAll('[data-booking]').forEach(x=>x.addEventListener('click',()=>openBooking(x.dataset.booking))); }

async function loadDashboard(){
  try{
    const d=await api('/api/v1/dashboard');
    $('#today-count').textContent=d.today_bookings.length;
    $('#tomorrow-count').textContent=d.tomorrow_bookings.length;
    $('#reminder-count').textContent=d.due_reminders.length;
    $('#driver-count').textContent=d.missing_driver;
    $('#boat-count').textContent=d.missing_boat;

    const today=$('#today-list');
    today.innerHTML=dispatchRows(d.today_bookings); bindBookingClicks(today);
    const tomorrow=$('#tomorrow-list');
    tomorrow.innerHTML=dispatchRows(d.tomorrow_bookings); bindBookingClicks(tomorrow);

    const reminders=$('#reminder-list');
    if(!d.due_reminders.length) empty(reminders,'Không có việc cần nhắc trong 36 giờ tới.');
    else reminders.innerHTML=d.due_reminders.map(x=>`<article class="reminder-card">
      <div class="reminder-top"><div><strong>${esc(x.contact_name||ROLE_LABELS[x.role]||'Chưa rõ')}</strong><small>${fmtDate(x.service_date)} · ${esc(x.representative||x.booking_code)}</small></div>${badge(x.status)}</div>
      <div class="message-box">${esc(x.message||'')}</div>
      <div class="actions"><button class="copy-reminder" data-msg="${encodeURIComponent(x.message||'')}">Copy tin Zalo</button><button class="secondary mark-sent" data-id="${x.id}">Đã gửi</button></div>
    </article>`).join('');
    reminders.querySelectorAll('.copy-reminder').forEach(b=>b.addEventListener('click',()=>copyText(decodeURIComponent(b.dataset.msg),b)));
    reminders.querySelectorAll('.mark-sent').forEach(b=>b.addEventListener('click',async()=>{ await api(`/api/v1/reminders/${b.dataset.id}/sent`,{method:'POST',body:'{}'}); loadDashboard(); }));
  }catch(e){
    empty($('#today-list'),'Không tải được dashboard: '+e.message);
    empty($('#reminder-list'),'Không tải được reminder.');
  }
}
$('#refresh-dashboard').addEventListener('click',loadDashboard);

async function search(){
  const q=$('#search-q').value.trim();
  try{
    const d=await api('/api/v1/bookings?q='+encodeURIComponent(q));
    const root=$('#search-results'); root.innerHTML=searchRows(d.results); bindBookingClicks(root);
  }catch(e){ empty($('#search-results'),'Lỗi: '+e.message); }
}
$('#search-btn').addEventListener('click',search);
$('#search-q').addEventListener('keydown',e=>{if(e.key==='Enter')search();});

async function loadContacts(){
  try{
    const d=await api('/api/v1/contacts'); contacts=d.results;
    const root=$('#contacts-list'); if(!contacts.length)return empty(root);
    root.innerHTML=`<div class="contact-head"><span>Tên</span><span>Loại</span><span>Liên hệ</span><span>Xe / tàu</span><span>Ghi chú</span></div>`+
      contacts.map(c=>`<div class="contact-row"><span><strong>${esc(c.name)}</strong><small>${esc(c.company||'')}</small></span><span>${esc(ROLE_LABELS[c.kind]||c.kind)}</span><span>${esc(c.zalo_phone||c.phone||'-')}</span><span>${esc([c.vehicle_model,c.vehicle_plate].filter(Boolean).join(' · ')||'-')}</span><span>${esc(c.notes||'-')}</span></div>`).join('');
  }catch(e){ empty($('#contacts-list'),'Lỗi: '+e.message); }
}
$('#refresh-contacts').addEventListener('click',loadContacts);
$('#contact-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const body=Object.fromEntries(new FormData(e.currentTarget).entries());
  body.can_collect_cash=e.currentTarget.elements.can_collect_cash.checked;
  try{
    await api('/api/v1/contacts',{method:'POST',body:JSON.stringify(body)});
    $('#contact-status').textContent='Đã lưu';
    e.currentTarget.reset(); loadContacts();
  }catch(err){ $('#contact-status').textContent='Lỗi: '+err.message; }
});

function assignmentOptions(role){
  const accepted = role.startsWith('driver') ? ['driver'] : role==='boat_partner' ? ['partner','captain'] : role==='cash_collector' ? ['partner','driver','captain','host','other'] : ['partner','driver','captain','host','other'];
  return contacts.filter(c=>accepted.includes(c.kind)).map(c=>`<option value="${c.id}">${esc(c.name)}${c.company?` - ${esc(c.company)}`:''}</option>`).join('');
}
function assignmentCard(role,a){
  return `<div class="assignment-card">
    <div><small>${ROLE_LABELS[role]||role}</small>${a?`<strong>${esc(a.contact_name)}</strong><span>${badge(a.status)}</span>`:'<strong class="muted">Chưa gán</strong>'}</div>
    <select data-role="${role}"><option value="">Chọn...</option>${assignmentOptions(role)}</select>
    <button class="assign-btn" data-role="${role}">Gán</button>
  </div>`;
}
async function openBooking(id){
  await loadContacts();
  const b=await api('/api/v1/bookings/'+id);
  const root=$('#booking-detail'); root.classList.remove('hidden');
  setView('search','Booking detail');
  const activeByRole=Object.fromEntries((b.assignments||[]).map(a=>[a.role,a]));
  root.innerHTML=`
    <div class="booking-visual">
      <div><span class="eyebrow">${esc(b.booking_code)}</span><h2>${esc(b.representative||'Chưa có tên khách')}</h2><p>${esc(b.tour_type||'Fishing tour')} · ${fmtDate(b.service_date)} · ${esc(b.guests||'-')} khách</p></div>
      <div class="status-edit"><select id="booking-status">
        ${['inquiry','hold','confirmed','ready','running','completed','cancelled'].map(s=>`<option value="${s}" ${b.status===s?'selected':''}>${STATUS_LABELS[s]}</option>`).join('')}
      </select><button id="save-status">Lưu trạng thái</button></div>
    </div>

    <div class="customer-link-panel">
      <div><span class="link-icon">↗</span><div><small>CUSTOMER TRIP LINK</small><strong>Trang theo dõi dành cho khách</strong><p>Khách chỉ thấy lịch trình, tài xế, trạng thái tàu và thông tin chuyến đi cần thiết.</p></div></div>
      <div class="trip-link-box"><input id="detail-trip-link" value="${esc(b.customer_trip_url||'')}" readonly><button id="copy-detail-link">Copy link</button><a href="${esc(b.customer_trip_url||'#')}" target="_blank" rel="noopener">Mở trang khách</a><button id="regen-link" class="secondary">Tạo link mới</button></div>
    </div>

    <div class="detail-grid">
      <div><small>Ngày</small><strong>${fmtDate(b.service_date)}</strong></div>
      <div><small>Pickup</small><strong>${esc(b.pickup_time||'-')}</strong></div>
      <div><small>Điểm đón</small><strong>${esc(b.pickup_location||'-')}</strong></div>
      <div><small>Tour</small><strong>${esc(b.start_time||'-')}${b.end_time?' - '+esc(b.end_time):''}</strong></div>
      <div><small>Giá khách</small><strong>${money(b.total_amount,b.currency)}</strong></div>
      <div><small>Weather</small><strong>${esc(b.weather_status)}</strong></div>
      <div><small>Payment</small><strong>${esc(b.payment_status)}</strong></div>
      <div><small>Thu hộ bởi</small><strong>${esc(b.cash_collector_name||'-')}</strong></div>
      <div><small>Booking owner</small><strong>${esc(b.owner_name||'-')}</strong></div>
    </div>

    <div class="detail-section">
      <div class="panel-head"><div><div class="eyebrow">ASSIGNMENTS</div><h2>Phân công vận hành</h2></div></div>
      <div class="assignment-cards">
        ${assignmentCard('boat_partner',activeByRole.boat_partner)}
        ${assignmentCard('driver_outbound',activeByRole.driver_outbound)}
        ${assignmentCard('driver_return',activeByRole.driver_return)}
        ${assignmentCard('cash_collector',activeByRole.cash_collector)}
      </div>
    </div>

    <div class="notes-grid">
      <div class="note-card"><small>Khách sẽ thấy</small><strong>Yêu cầu / ghi chú chuyến đi</strong><p>${esc(b.public_notes||'Chưa có.')}</p></div>
      <div class="note-card private"><small>INTERNAL ONLY</small><strong>Ghi chú nội bộ</strong><p>${esc(b.notes||'Chưa có.')}</p></div>
    </div>

    <div class="detail-section">
      <div class="panel-head"><div><div class="eyebrow">HISTORY</div><h2>Lịch sử booking</h2></div></div>
      <div class="timeline">${(b.events||[]).map(e=>`<div class="event"><span></span><div><strong>${esc(e.summary)}</strong><small>${esc(e.occurred_at)} · ${esc(e.event_type)}</small></div></div>`).join('')||'<div class="empty">Chưa có lịch sử.</div>'}</div>
    </div>`;

  $('#save-status').onclick=async()=>{
    const status=$('#booking-status').value;
    await api('/api/v1/bookings/'+id,{method:'PATCH',body:JSON.stringify({status})});
    openBooking(id); loadDashboard();
  };
  $('#copy-detail-link').onclick=()=>copyText($('#detail-trip-link').value,$('#copy-detail-link'));
  $('#regen-link').onclick=async()=>{
    if(!confirm('Tạo link mới? Link cũ sẽ không còn dùng được.'))return;
    const r=await api(`/api/v1/bookings/${id}/public-link/regenerate`,{method:'POST',body:'{}'});
    $('#detail-trip-link').value=r.customer_trip_url;
    root.querySelector('.trip-link-box a').href=r.customer_trip_url;
  };
  root.querySelectorAll('.assign-btn').forEach(btn=>btn.addEventListener('click',async()=>{
    const role=btn.dataset.role;
    const select=root.querySelector(`select[data-role="${role}"]`);
    if(!select.value)return;
    await api(`/api/v1/bookings/${id}/assignments`,{method:'POST',body:JSON.stringify({role,contact_id:select.value})});
    openBooking(id); loadDashboard();
  }));
}

loadDashboard();
