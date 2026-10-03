const STATUS_OPTIONS = [
  ["inquiry","Mới"],
  ["hold","Giữ chỗ"],
  ["confirmed","Đã chốt"],
  ["ready","Sẵn sàng"],
  ["running","Đang chạy"],
  ["completed","Hoàn thành"],
  ["cancelled","Đã hủy"]
];

let managementViewer = { role: "partner", actor: "" };
let managementRows = new Map();
let managementBusy = false;

function notifyManage(message){
  const toast=document.getElementById("toast");
  if(!toast)return;
  toast.textContent=message;
  toast.classList.remove("hidden");
  clearTimeout(notifyManage.timer);
  notifyManage.timer=setTimeout(()=>toast.classList.add("hidden"),2500);
}

async function manageApi(path, options={}){
  const response=await fetch(`/fishing/api${path}`,{
    cache:"no-store",
    ...options,
    headers:{"content-type":"application/json",...(options.headers||{})}
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);
  return data;
}

function statusOptions(current){
  return STATUS_OPTIONS.map(([value,label])=>`<option value="${value}" ${value===current?"selected":""}>${label}</option>`).join("");
}

function roleBadge(){
  const pill=document.getElementById("userPill");
  if(!pill||document.getElementById("roleBadge"))return;
  const badge=document.createElement("span");
  badge.id="roleBadge";
  badge.className=`role-badge ${managementViewer.role==='admin'?'admin':'partner'}`;
  badge.textContent=managementViewer.role==='admin'?"JoTrip Admin":"Đối tác";
  pill.insertAdjacentElement("afterend",badge);
}

function decorateCard(card){
  const id=card.dataset.bookingId;
  if(!id||card.querySelector(".manage-bar"))return;
  const row=managementRows.get(id);
  if(!row)return;
  card.dataset.status=row.status||"confirmed";
  const bar=document.createElement("div");
  bar.className="manage-bar";
  bar.innerHTML=`
    <div class="manage-status">
      <span class="manage-label">Trạng thái lịch</span>
      <select class="status-select" data-booking-status="${id}">${statusOptions(row.status)}</select>
      <button class="manage-save" data-save-status="${id}" type="button">Lưu trạng thái</button>
    </div>
    ${managementViewer.role==='admin'?`<button class="manage-delete" data-delete-booking="${id}" type="button">Xóa booking</button>`:""}
  `;
  card.appendChild(bar);
}

function decorateAll(){
  document.querySelectorAll("#scheduleAll .trip-card").forEach(decorateCard);
}

async function refreshManagementData(){
  try{
    const [me,schedule]=await Promise.all([manageApi("/me"),manageApi("/schedule")]);
    managementViewer=me||managementViewer;
    managementRows=new Map((schedule.results||[]).map(row=>[row.id,row]));
    roleBadge();
    decorateAll();
  }catch(e){
    console.warn("management controls unavailable",e);
  }
}

async function saveStatus(id, button){
  if(managementBusy)return;
  const select=document.querySelector(`[data-booking-status="${CSS.escape(id)}"]`);
  if(!select)return;
  managementBusy=true;
  const old=button.textContent;
  button.disabled=true;
  button.textContent="Đang lưu...";
  try{
    const result=await manageApi(`/bookings/${encodeURIComponent(id)}/status`,{method:"POST",body:JSON.stringify({status:select.value})});
    const row=managementRows.get(id);
    if(row)row.status=result.status;
    const card=button.closest(".trip-card");
    if(card)card.dataset.status=result.status;
    notifyManage("Đã cập nhật trạng thái lịch.");
    document.getElementById("refreshBtn")?.click();
  }catch(e){notifyManage(`Không lưu được: ${e.message}`)}
  finally{managementBusy=false;button.disabled=false;button.textContent=old}
}

async function deleteBooking(id, button){
  if(managementViewer.role!=="admin")return notifyManage("Chỉ JoTrip Admin mới được xóa booking.");
  const row=managementRows.get(id);
  const label=row?`${row.service_date} - ${row.representative||row.booking_code}`:"booking này";
  if(!window.confirm(`Xóa hẳn ${label}?\n\nĐối tác không có quyền này. Thao tác của JoTrip Admin sẽ được ghi vào lịch sử.`))return;
  if(managementBusy)return;
  managementBusy=true;
  const old=button.textContent;
  button.disabled=true;
  button.textContent="Đang xóa...";
  try{
    await manageApi(`/bookings/${encodeURIComponent(id)}`,{method:"DELETE"});
    managementRows.delete(id);
    button.closest(".trip-card")?.remove();
    notifyManage("JoTrip Admin đã xóa booking.");
    document.getElementById("refreshBtn")?.click();
  }catch(e){notifyManage(`Không xóa được: ${e.message}`)}
  finally{managementBusy=false;button.disabled=false;button.textContent=old}
}

document.addEventListener("click",event=>{
  const save=event.target.closest("[data-save-status]");
  if(save){saveStatus(save.dataset.saveStatus,save);return;}
  const del=event.target.closest("[data-delete-booking]");
  if(del)deleteBooking(del.dataset.deleteBooking,del);
});

const observer=new MutationObserver(()=>{
  clearTimeout(observer.timer);
  observer.timer=setTimeout(decorateAll,40);
});
const scheduleRoot=document.getElementById("scheduleAll");
if(scheduleRoot)observer.observe(scheduleRoot,{childList:true,subtree:true,attributes:true,attributeFilter:["data-booking-id"]});

refreshManagementData();
setTimeout(refreshManagementData,900);
