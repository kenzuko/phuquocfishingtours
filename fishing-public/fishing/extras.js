const API_BASE = "/fishing/api";
const WATCH_KEY = "jotrip_fishing_watched_v1";
let snapshot = { today: "", tomorrow: "", results: [] };
let viewer = { actor: "", company: "" };
let watched = new Set(JSON.parse(localStorage.getItem(WATCH_KEY) || "[]"));
let searchTerm = "";
let watchedOnly = false;
let decorating = false;

const escText = value => String(value ?? "");
const displayDate = iso => {
  if (!iso) return "";
  const [y,m,d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
const timeRange = row => row.start_time && row.end_time ? `${row.start_time} - ${row.end_time}` : row.start_time || row.pickup_time || "Chưa có giờ";
const datePlus = (iso, days) => {
  const d = new Date(`${iso}T00:00:00+07:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0,10);
};
const activeBaseFilter = () => document.querySelector("#scheduleFilters .filter.active")?.dataset.filter || "all";

async function getJson(path){
  const r = await fetch(`${API_BASE}${path}`, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function baseRows(){
  const rows = snapshot.results || [];
  const filter = activeBaseFilter();
  if (filter === "today") return rows.filter(x => x.service_date === snapshot.today);
  if (filter === "tomorrow") return rows.filter(x => x.service_date === snapshot.tomorrow);
  if (filter === "week") {
    const end = datePlus(snapshot.today, 7);
    return rows.filter(x => x.service_date >= snapshot.today && x.service_date < end);
  }
  if (filter === "mine") {
    const actor = (viewer.actor || "").toLowerCase();
    return rows.filter(x => (x.owner_name || "").toLowerCase() === actor || (x.boat_partner_name || "").toLowerCase().includes(actor));
  }
  return rows;
}

function rowSearchText(row){
  return [row.service_date,row.representative,row.phone,row.nationality,row.pickup_location,row.driver_name,row.vehicle_model,row.vehicle_plate,row.boat_partner_name,row.owner_name,row.tour_type].filter(Boolean).join(" ").toLowerCase();
}

function selectedRows(){
  return baseRows().filter(row => {
    if (watchedOnly && !watched.has(row.id)) return false;
    if (searchTerm && !rowSearchText(row).includes(searchTerm)) return false;
    return true;
  });
}

function saveWatched(){
  localStorage.setItem(WATCH_KEY, JSON.stringify([...watched]));
}

function showUtilityToast(message){
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(showUtilityToast.timer);
  showUtilityToast.timer = setTimeout(() => toast.classList.add("hidden"), 2400);
}

function injectStyles(){
  if (document.getElementById("fishingUtilityStyles")) return;
  const style = document.createElement("style");
  style.id = "fishingUtilityStyles";
  style.textContent = `
    .utility-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 12px;padding:10px;background:#f8fbfc;border:1px solid #dfe7ec;border-radius:7px}
    .utility-search{flex:1 1 220px;min-width:170px;position:relative}
    .utility-search input{height:38px;min-height:38px;padding:8px 10px 8px 32px;background:#fff;border:1px solid #d7e0e5;border-radius:5px;font-size:11px}
    .utility-search:before{content:'⌕';position:absolute;left:10px;top:7px;color:#607b90;font-size:17px}
    .utility-actions{display:flex;gap:6px;flex-wrap:wrap}
    .utility-btn{height:38px;border:1px solid #cbd8e0;border-radius:5px;background:#fff;color:#315270;padding:0 11px;font:inherit;font-size:10px;font-weight:750;cursor:pointer}
    .utility-btn:hover{background:#f4f8fa;border-color:#aac2d1}.utility-btn.active{background:#0b2f57;border-color:#0b2f57;color:#fff}
    .trip-main{position:relative}.trip-tools{display:flex;gap:5px;flex-wrap:wrap;margin-top:3px}
    .trip-tool{border:1px solid #d9e3e8;background:#fff;color:#536f84;border-radius:4px;padding:5px 7px;font:inherit;font-size:9px;font-weight:750;cursor:pointer}
    .trip-tool.active{background:#fff3dd;border-color:#f4d9aa;color:#8b5817}.trip-tool:hover{background:#f8fbfc}
    .utility-count{margin-left:auto;color:#758795;font-size:9px;white-space:nowrap}
    @media(max-width:640px){.utility-bar{padding:8px;gap:6px}.utility-search{flex-basis:100%}.utility-actions{width:100%;display:grid;grid-template-columns:repeat(3,1fr)}.utility-btn{padding:0 6px}.utility-count{width:100%;margin:0;text-align:right}.trip-tools{margin-top:5px}}
  `;
  document.head.appendChild(style);
}

function injectToolbar(){
  const filters = document.getElementById("scheduleFilters");
  if (!filters || document.getElementById("scheduleUtilityBar")) return;
  const bar = document.createElement("div");
  bar.className = "utility-bar";
  bar.id = "scheduleUtilityBar";
  bar.innerHTML = `
    <div class="utility-search"><input id="scheduleSearch" type="search" placeholder="Tìm khách, SĐT, khách sạn, tài xế..."></div>
    <div class="utility-actions">
      <button class="utility-btn" id="copyScheduleBtn" type="button">Copy lịch</button>
      <button class="utility-btn" id="exportScheduleBtn" type="button">Xuất ảnh</button>
      <button class="utility-btn" id="watchedOnlyBtn" type="button">★ Theo dõi</button>
    </div>
    <span class="utility-count" id="utilityCount"></span>`;
  filters.parentNode.insertBefore(bar, filters);

  bar.querySelector("#scheduleSearch").addEventListener("input", e => {
    searchTerm = e.target.value.trim().toLowerCase();
    applyVisibility();
  });
  bar.querySelector("#watchedOnlyBtn").addEventListener("click", e => {
    watchedOnly = !watchedOnly;
    e.currentTarget.classList.toggle("active", watchedOnly);
    e.currentTarget.textContent = watchedOnly ? "★ Đang theo dõi" : "★ Theo dõi";
    applyVisibility();
  });
  bar.querySelector("#copyScheduleBtn").addEventListener("click", copySchedule);
  bar.querySelector("#exportScheduleBtn").addEventListener("click", exportScheduleImage);
}

function decorateCards(){
  if (decorating) return;
  decorating = true;
  try {
    const cards = [...document.querySelectorAll("#scheduleAll .trip-card")];
    const rows = baseRows();
    cards.forEach((card, index) => {
      const row = rows[index];
      if (!row) return;
      card.dataset.bookingId = row.id;
      let tools = card.querySelector(".trip-tools");
      if (!tools) {
        tools = document.createElement("div");
        tools.className = "trip-tools";
        card.querySelector(".trip-main")?.appendChild(tools);
      }
      tools.innerHTML = `<button class="trip-tool ${watched.has(row.id) ? "active" : ""}" data-watch="${row.id}" type="button">${watched.has(row.id) ? "★ Đang theo dõi" : "☆ Theo dõi"}</button><button class="trip-tool" data-copy-trip="${row.id}" type="button">Copy tour</button>`;
    });
    applyVisibility();
  } finally {
    decorating = false;
  }
}

function applyVisibility(){
  const allowed = new Set(selectedRows().map(x => x.id));
  const cards = [...document.querySelectorAll("#scheduleAll .trip-card")];
  let shown = 0;
  cards.forEach(card => {
    const show = allowed.has(card.dataset.bookingId);
    card.style.display = show ? "" : "none";
    if (show) shown += 1;
  });
  const count = document.getElementById("utilityCount");
  if (count) count.textContent = `${shown} tour đang hiển thị`;
}

function formatRow(row){
  const pickup = [row.pickup_time, row.pickup_location].filter(Boolean).join(" · ") || "Chưa có điểm đón";
  const driver = [row.driver_name,row.vehicle_model,row.vehicle_plate].filter(Boolean).join(" · ") || "Chưa xếp tài xế";
  const boat = row.boat_partner_name || "Chưa xếp cano/tàu";
  return `${displayDate(row.service_date)} · ${timeRange(row)}\n${row.representative || "Khách"} · ${row.guests || "?"} khách${row.phone ? ` · ${row.phone}` : ""}\nĐón: ${pickup}\nTài xế: ${driver}\nCano/tàu: ${boat}`;
}

async function writeClipboard(text){
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy"); ta.remove(); return ok;
  }
}

async function copySchedule(){
  const rows = selectedRows();
  if (!rows.length) return showUtilityToast("Không có tour để copy.");
  const title = `JOTrip Fishing - lịch ${new Date().toLocaleDateString("vi-VN")}`;
  const text = `${title}\n\n${rows.map(formatRow).join("\n\n")}`;
  await writeClipboard(text);
  showUtilityToast(`Đã copy ${rows.length} tour.`);
}

function copyTrip(id){
  const row = (snapshot.results || []).find(x => x.id === id);
  if (!row) return;
  writeClipboard(formatRow(row)).then(() => showUtilityToast("Đã copy thông tin tour."));
}

function roundRect(ctx,x,y,w,h,r){
  const rr=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+rr,y);ctx.arcTo(x+w,y,x+w,y+h,rr);ctx.arcTo(x+w,y+h,x,y+h,rr);ctx.arcTo(x,y+h,x,y,rr);ctx.arcTo(x,y,x+w,y,rr);ctx.closePath();
}
function wrapText(ctx,text,x,y,maxWidth,lineHeight,maxLines=2){
  const words=String(text||"").split(/\s+/);let line="",lines=[];
  for(const word of words){const test=line?`${line} ${word}`:word;if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=word}else line=test}
  if(line)lines.push(line);if(lines.length>maxLines){lines=lines.slice(0,maxLines);lines[maxLines-1]=`${lines[maxLines-1].replace(/…$/,'')}…`}
  lines.forEach((l,i)=>ctx.fillText(l,x,y+i*lineHeight));return y+lines.length*lineHeight;
}

async function exportScheduleImage(){
  const rows = selectedRows();
  if (!rows.length) return showUtilityToast("Không có tour để xuất ảnh.");
  await document.fonts?.ready;
  const width = 1080, margin = 64, headerH = 190, rowH = 205, footerH = 76;
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = headerH + rows.length * rowH + footerH;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f5f7f7"; ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = "#0b2f57"; ctx.fillRect(0,0,width,10);
  ctx.font = '700 24px "Be Vietnam Pro", sans-serif'; ctx.fillStyle = "#0b7f82"; ctx.fillText("JOTRIP FISHING OPERATIONS",margin,58);
  ctx.font = '600 48px Lora, Georgia, serif'; ctx.fillStyle = "#0b2f57"; ctx.fillText("Lịch điều hành",margin,116);
  ctx.font = '500 20px "Be Vietnam Pro", sans-serif'; ctx.fillStyle = "#66798b";
  ctx.fillText(`${rows.length} tour · xuất lúc ${new Date().toLocaleString("vi-VN",{hour:"2-digit",minute:"2-digit",day:"2-digit",month:"2-digit",year:"numeric"})}`,margin,154);
  let y = headerH;
  rows.forEach((row,index)=>{
    const x=margin,w=width-margin*2,h=rowH-18;
    ctx.fillStyle="#fff";roundRect(ctx,x,y,w,h,10);ctx.fill();
    ctx.strokeStyle="#dfe7ec";ctx.lineWidth=2;roundRect(ctx,x,y,w,h,10);ctx.stroke();
    ctx.fillStyle = watched.has(row.id) ? "#d4a451" : "#0b7f82"; ctx.fillRect(x,y,7,h);
    ctx.font='800 22px "Be Vietnam Pro", sans-serif';ctx.fillStyle="#0b2f57";ctx.fillText(`${displayDate(row.service_date)} · ${timeRange(row)}`,x+30,y+38);
    ctx.font='800 27px "Be Vietnam Pro", sans-serif';ctx.fillStyle="#173956";wrapText(ctx,`${row.representative||"Khách"} · ${row.guests||"?"} khách`,x+30,y+78,w-60,34,1);
    ctx.font='500 18px "Be Vietnam Pro", sans-serif';ctx.fillStyle="#536f84";
    const pickup=[row.pickup_time,row.pickup_location].filter(Boolean).join(" · ")||"Chưa có điểm đón";
    const driver=[row.driver_name,row.vehicle_model,row.vehicle_plate].filter(Boolean).join(" · ")||"Chưa xếp tài xế";
    wrapText(ctx,`Đón: ${pickup}`,x+30,y+116,w-60,25,1);
    wrapText(ctx,`Tài xế: ${driver}`,x+30,y+145,w-60,25,1);
    wrapText(ctx,`Cano/tàu: ${row.boat_partner_name||"Chưa xếp"}`,x+30,y+174,w-60,25,1);
    y += rowH;
  });
  ctx.font='500 17px "Be Vietnam Pro", sans-serif';ctx.fillStyle="#7d8d99";ctx.fillText("fishing.jotrip.vn · JoTrip internal operations",margin,canvas.height-30);
  const blob = await new Promise(resolve => canvas.toBlob(resolve,"image/png",0.95));
  if (!blob) return showUtilityToast("Không tạo được ảnh.");
  const fileName = `jotrip-fishing-${snapshot.today || new Date().toISOString().slice(0,10)}.png`;
  const file = new File([blob],fileName,{type:"image/png"});
  if (navigator.canShare?.({files:[file]})) {
    try { await navigator.share({title:"JoTrip Fishing - Lịch điều hành",files:[file]}); showUtilityToast("Đã tạo ảnh lịch."); return; }
    catch (e) { if (e?.name === "AbortError") return; }
  }
  const url = URL.createObjectURL(blob); const a=document.createElement("a");a.href=url;a.download=fileName;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);showUtilityToast("Đã xuất ảnh lịch.");
}

document.addEventListener("click", e => {
  const watchBtn = e.target.closest("[data-watch]");
  if (watchBtn) {
    const id = watchBtn.dataset.watch;
    watched.has(id) ? watched.delete(id) : watched.add(id);
    saveWatched(); decorateCards(); showUtilityToast(watched.has(id) ? "Đã thêm vào theo dõi." : "Đã bỏ theo dõi.");
    return;
  }
  const copyBtn = e.target.closest("[data-copy-trip]");
  if (copyBtn) copyTrip(copyBtn.dataset.copyTrip);
});

async function refreshSnapshot(){
  try {
    [snapshot,viewer] = await Promise.all([getJson("/schedule"),getJson("/me")]);
    decorateCards();
  } catch {}
}

function bootstrapUtilities(){
  injectStyles(); injectToolbar(); refreshSnapshot();
  const scheduleList = document.getElementById("scheduleAll");
  if (scheduleList) new MutationObserver(() => { if (!decorating) refreshSnapshot(); }).observe(scheduleList,{childList:true});
  document.getElementById("scheduleFilters")?.addEventListener("click",()=>setTimeout(refreshSnapshot,50));
  document.getElementById("refreshBtn")?.addEventListener("click",()=>setTimeout(refreshSnapshot,200));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",bootstrapUtilities); else bootstrapUtilities();
