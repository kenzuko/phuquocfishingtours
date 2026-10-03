const $ = id => document.getElementById(id);

const sourceText = $("sourceText");
const parseBtn = $("parseBtn");
const clearBtn = $("clearBtn");
const previewCard = $("previewCard");
const duplicateBox = $("duplicateBox");
const matchState = $("matchState");
const confirmBtn = $("confirmBtn");
const refreshBtn = $("refreshBtn");
const toast = $("toast");

const fieldIds = [
  "service_date","tour_type","representative","guests","nationality","phone",
  "start_time","end_time","pickup_time","pickup_location","notes"
];

let duplicateBooking = null;

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add("hidden"), 2600);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  if (response.status === 401) {
    window.location.href = "/fishing";
    throw new Error("Phiên đăng nhập đã hết hạn.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function setBusy(button, busy, busyText = "Đang xử lý...") {
  if (!button.dataset.label) button.dataset.label = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? busyText : button.dataset.label;
}

function fillPreview(result) {
  for (const id of fieldIds) {
    const node = $(id);
    if (!node) continue;
    node.value = result[id] ?? "";
  }
  previewCard.classList.remove("hidden");
  previewCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setDuplicate(duplicate) {
  duplicateBooking = duplicate || null;
  if (!duplicate) {
    duplicateBox.classList.add("hidden");
    duplicateBox.textContent = "";
    matchState.textContent = "Booking mới";
    $("confirmTitle").textContent = "Kiểm tra lại trước khi lưu";
    $("confirmSubtitle").textContent = "Có thể sửa trực tiếp các ô bên trên.";
    return;
  }
  duplicateBox.classList.remove("hidden");
  duplicateBox.textContent = `Đã có booking ${duplicate.booking_code} cùng ngày cho ${duplicate.representative || duplicate.phone || "khách này"}. Xác nhận sẽ cập nhật booking hiện có, không tạo dòng trùng.`;
  matchState.textContent = "Sẽ cập nhật";
  $("confirmTitle").textContent = "Đã tìm thấy booking hiện có";
  $("confirmSubtitle").textContent = "Kiểm tra thông tin rồi xác nhận để cập nhật đúng dòng này.";
}

parseBtn.addEventListener("click", async () => {
  const text = sourceText.value.trim();
  if (!text) return showToast("Dán nội dung booking trước.");
  setBusy(parseBtn, true, "Đang đọc...");
  try {
    const data = await api("/fishing/api/parse", {
      method: "POST",
      body: JSON.stringify({ text })
    });
    fillPreview(data.result || {});
    setDuplicate(data.duplicate);
  } catch (error) {
    showToast(error.message);
  } finally {
    setBusy(parseBtn, false);
  }
});

clearBtn.addEventListener("click", () => {
  sourceText.value = "";
  duplicateBooking = null;
  previewCard.classList.add("hidden");
  sourceText.focus();
});

confirmBtn.addEventListener("click", async () => {
  const payload = {};
  for (const id of fieldIds) payload[id] = $(id).value.trim();
  payload.guests = Number(payload.guests || 0) || null;
  payload.source_text = sourceText.value.trim();
  if (duplicateBooking?.id) payload.booking_id = duplicateBooking.id;

  if (!payload.service_date) return showToast("Thiếu ngày tour.");
  if (!payload.representative && !payload.phone) return showToast("Cần tên khách hoặc số điện thoại.");

  setBusy(confirmBtn, true, "Đang lưu...");
  try {
    const result = await api("/fishing/api/confirm", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    showToast(result.action === "updated" ? "Đã cập nhật booking." : "Đã thêm booking.");
    sourceText.value = "";
    previewCard.classList.add("hidden");
    duplicateBooking = null;
    await loadSchedule();
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  } catch (error) {
    showToast(error.message);
  } finally {
    setBusy(confirmBtn, false);
  }
});

function displayDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function timeRange(row) {
  if (row.start_time && row.end_time) return `${row.start_time} - ${row.end_time}`;
  return row.start_time || row.pickup_time || "Chưa có giờ";
}

function statusLabel(status) {
  const labels = {
    inquiry: "Mới",
    hold: "Giữ chỗ",
    confirmed: "Đã chốt",
    ready: "Sẵn sàng",
    running: "Đang chạy",
    completed: "Hoàn thành"
  };
  return labels[status] || status || "-";
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function tripCard(row) {
  const driver = row.driver_name
    ? `${esc(row.driver_name)}${row.vehicle_model ? ` · ${esc(row.vehicle_model)}` : ""}${row.vehicle_plate ? ` · ${esc(row.vehicle_plate)}` : ""}`
    : `<span class="missing">Chưa xếp tài xế</span>`;
  const boat = row.boat_partner_name ? esc(row.boat_partner_name) : `<span class="missing">Chưa xếp cano/tàu</span>`;
  const pickup = row.pickup_time || row.pickup_location
    ? `${esc(row.pickup_time || "")}${row.pickup_time && row.pickup_location ? " · " : ""}${esc(row.pickup_location || "")}`
    : `<span class="missing">Chưa có điểm đón</span>`;
  const returnDriver = row.return_driver_name ? esc(row.return_driver_name) : "Theo tài xế đi / cập nhật sau";
  const ready = Boolean(row.driver_name && row.boat_partner_name && row.pickup_time);

  return `
    <article class="trip-card">
      <div class="trip-main">
        <div class="trip-date">
          <strong>${esc(displayDate(row.service_date))} · ${esc(timeRange(row))}</strong>
          <span class="pill ${ready ? "ready" : "warn"}">${ready ? "Đủ vận hành" : "Cần bổ sung"}</span>
          <span class="pill">${esc(statusLabel(row.status))}</span>
        </div>
        <div class="guest">${esc(row.representative || "Khách chưa đặt tên")} · ${esc(row.guests || "?")} khách</div>
        <div class="meta">${esc(row.nationality || "Chưa rõ quốc tịch")} · ${esc(row.tour_type || "Big Fishing")}${row.phone ? ` · ${esc(row.phone)}` : ""}</div>
      </div>
      <div class="ops">
        <div class="ops-line"><span>Đón khách</span><span>${pickup}</span></div>
        <div class="ops-line"><span>Tài xế đi</span><span>${driver}</span></div>
        <div class="ops-line"><span>Cano / tàu</span><span>${boat}</span></div>
        <div class="ops-line"><span>Tài xế về</span><span>${returnDriver}</span></div>
      </div>
    </article>`;
}

function renderList(target, rows, emptyText) {
  target.innerHTML = rows.length ? rows.map(tripCard).join("") : `<div class="empty">${esc(emptyText)}</div>`;
}

async function loadSchedule() {
  const loading = $("scheduleLoading");
  const errorBox = $("scheduleError");
  const sections = $("scheduleSections");
  loading.classList.remove("hidden");
  errorBox.classList.add("hidden");
  sections.classList.add("hidden");

  try {
    const data = await api("/fishing/api/schedule");
    const rows = data.results || [];
    const today = rows.filter(x => x.service_date === data.today);
    const tomorrow = rows.filter(x => x.service_date === data.tomorrow);
    const upcoming = rows.filter(x => x.service_date > data.tomorrow);

    $("todayDate").textContent = displayDate(data.today);
    $("tomorrowDate").textContent = displayDate(data.tomorrow);
    renderList($("todayTrips"), today, "Hôm nay chưa có tour.");
    renderList($("tomorrowTrips"), tomorrow, "Ngày mai chưa có tour.");
    renderList($("upcomingTrips"), upcoming, "Chưa có lịch sắp tới.");
    $("lastUpdated").textContent = `Cập nhật ${new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`;
    loading.classList.add("hidden");
    sections.classList.remove("hidden");
  } catch (error) {
    loading.classList.add("hidden");
    errorBox.textContent = `Không tải được lịch: ${error.message}`;
    errorBox.classList.remove("hidden");
  }
}

refreshBtn.addEventListener("click", async () => {
  setBusy(refreshBtn, true, "Đang tải...");
  await loadSchedule();
  setBusy(refreshBtn, false);
});

loadSchedule();
