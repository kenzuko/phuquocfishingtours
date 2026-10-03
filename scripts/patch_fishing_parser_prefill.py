from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"marker missing: {label}")
    return text.replace(old, new, 1)


worker_path = Path("fishing-worker.js")
worker = worker_path.read_text(encoding="utf-8")

# 1) Understand short partner language such as "Sáng ngày 5 ... 3 khách của phong".
worker = replace_once(
    worker,
    '  const dateMatch = normalized.match(/\\b(\\d{1,2})[\\/-](\\d{1,2})[\\/-](\\d{4})\\b/);\n  const serviceDate = base.service_date || (dateMatch ? `${dateMatch[3]}-${String(dateMatch[2]).padStart(2,"0")}-${String(dateMatch[1]).padStart(2,"0")}` : "");',
    '  const dateMatch = normalized.match(/\\b(\\d{1,2})[\\/-](\\d{1,2})[\\/-](\\d{4})\\b/);\n  const dayOnlyMatch = normalized.match(/\\bngày\\s*(\\d{1,2})\\b/i);\n  const dayHint = dateMatch ? Number(dateMatch[1]) : Number(dayOnlyMatch?.[1] || 0) || null;\n  const serviceDate = base.service_date || (dateMatch ? `${dateMatch[3]}-${String(dateMatch[2]).padStart(2,"0")}-${String(dateMatch[1]).padStart(2,"0")}` : "");',
    "day hint",
)
worker = replace_once(
    worker,
    '  const guests = base.guests || Number(normalized.match(/\\b(\\d{1,2})\\s*(?:NL|khách|khach|pax)\\b/i)?.[1] || 0) || null;',
    '  const guests = base.guests || Number(normalized.match(/\\b(\\d{1,2})\\s*(?:NL|khách|khach|pax|người|nguoi)\\b/i)?.[1] || 0) || null;',
    "guest variants",
)
worker = replace_once(
    worker,
    '  if (!representative && dateMatch) {\n    const afterDate = normalized.slice((dateMatch.index || 0) + dateMatch[0].length);\n    const m = afterDate.match(/(?:sáng|chiều|morning|afternoon|am|pm)?\\s*-\\s*([^/(\\n-]{2,50})/i);\n    if (m) representative = m[1].trim();\n  }\n  let nationality = base.nationality;',
    '  if (!representative && dateMatch) {\n    const afterDate = normalized.slice((dateMatch.index || 0) + dateMatch[0].length);\n    const m = afterDate.match(/(?:sáng|chiều|morning|afternoon|am|pm)?\\s*-\\s*([^/(\\n-]{2,50})/i);\n    if (m) representative = m[1].trim();\n  }\n  if (!representative) {\n    const m = normalized.match(/\\b(?:của|khách(?:\\s+tên)?|guest)\\s+([A-Za-zÀ-ỹ][A-Za-zÀ-ỹ\' .-]{1,40})(?=$|[\\n,;])/i);\n    if (m) representative = m[1].trim();\n  }\n  let nationality = base.nationality;',
    "representative shorthand",
)
worker = replace_once(
    worker,
    '    service_date: serviceDate,\n    tour_type: base.tour_type || "Big Fishing",',
    '    service_date: serviceDate,\n    day_hint: dayHint,\n    tour_type: base.tour_type || "Big Fishing",',
    "day hint return",
)

# 2) Match the terse message to the booking that already exists in D1 and pull its full data.
find_start = worker.index("async function findDuplicate(db, data) {")
find_end = worker.index("\n\nasync function addAudit", find_start)
new_find = r'''async function bookingDetailForPortal(db, bookingId) {
  return await queryOne(db, `SELECT b.*,
    COALESCE(
      (SELECT c.name FROM assignments a JOIN contacts c ON c.id=a.contact_id WHERE a.booking_id=b.id AND a.role='cash_collector' AND a.status!='cancelled' ORDER BY a.created_at DESC LIMIT 1),
      (SELECT c.name FROM contacts c WHERE c.id=b.cash_collector_contact_id LIMIT 1)
    ) AS cash_collector_name
    FROM bookings b WHERE b.id=? LIMIT 1`, [bookingId]);
}

function mergeExistingBooking(parsed, existing) {
  if (!existing) return parsed;
  const out = { ...parsed };
  const fields = ["service_date","tour_type","representative","guests","nationality","phone","start_time","end_time","pickup_time","pickup_location","notes"];
  for (const key of fields) {
    if (out[key] === "" || out[key] === null || out[key] === undefined || (key === "guests" && !out[key])) out[key] = existing[key] ?? out[key];
  }
  if (out.total_amount === null || out.total_amount === undefined) out.total_amount = existing.total_amount ?? null;
  if (!parsed.total_amount && existing.currency) out.currency = existing.currency;
  if (!out.payment_method || out.payment_method === "unknown") out.payment_method = existing.payment_method || "unknown";
  out.payment_status = existing.payment_status || "due";
  out.cash_collector_name = existing.cash_collector_name || "";
  out.matched_existing = true;
  return out;
}

async function findDuplicate(db, data) {
  let row = null;
  if (data.service_date && data.phone) {
    row = await queryOne(db, `SELECT id FROM bookings WHERE service_date=? AND status!='cancelled' AND phone=? ORDER BY updated_at DESC LIMIT 1`, [data.service_date, data.phone]);
  }
  if (!row && data.service_date && data.representative) {
    row = await queryOne(db, `SELECT id FROM bookings WHERE service_date=? AND status!='cancelled' AND lower(representative)=lower(?) ORDER BY updated_at DESC LIMIT 1`, [data.service_date, data.representative]);
  }
  if (!row && data.service_date && data.guests) {
    const rows = await queryAll(db, `SELECT id FROM bookings WHERE service_date=? AND status!='cancelled' AND guests=? ORDER BY updated_at DESC LIMIT 2`, [data.service_date, data.guests]);
    if (rows.length === 1) row = rows[0];
  }
  if (!row && data.day_hint) {
    const candidates = await queryAll(db, `SELECT id,service_date,representative,guests,start_time FROM bookings WHERE service_date>=? AND status!='cancelled' AND substr(service_date,9,2)=? ORDER BY service_date ASC,updated_at DESC LIMIT 60`, [localDate(-1), String(data.day_hint).padStart(2,"0")]);
    const rep = String(data.representative || "").trim().toLowerCase();
    let best = null;
    let bestScore = -1;
    for (const candidate of candidates) {
      let score = 0;
      const candidateRep = String(candidate.representative || "").trim().toLowerCase();
      if (rep && candidateRep === rep) score += 8;
      else if (rep && candidateRep && (candidateRep.includes(rep) || rep.includes(candidateRep))) score += 4;
      if (data.guests && Number(candidate.guests) === Number(data.guests)) score += 5;
      if (data.start_time && candidate.start_time === data.start_time) score += 2;
      if (score > bestScore) { best = candidate; bestScore = score; }
    }
    if (best && bestScore >= 8) row = best;
  }
  return row ? await bookingDetailForPortal(db, row.id) : null;
}'''
worker = worker[:find_start] + new_find + worker[find_end:]

worker = replace_once(
    worker,
    '    const result = parseQuickBooking(body.text);\n    const duplicate = await findDuplicate(db, result);\n    return json({ result, duplicate });',
    '    const parsed = parseQuickBooking(body.text);\n    const duplicate = await findDuplicate(db, parsed);\n    const result = mergeExistingBooking(parsed, duplicate);\n    return json({ result, duplicate });',
    "parse endpoint enrichment",
)

# 3) Expose existing hotel/payment/collector data to the operating portal.
worker = replace_once(
    worker,
    'b.pickup_time,b.pickup_location,b.weather_status,b.owner_name,b.updated_at,',
    'b.pickup_time,b.pickup_location,b.total_amount,b.currency,b.payment_status,b.weather_status,b.owner_name,b.updated_at,',
    "schedule payment columns",
)
worker = replace_once(
    worker,
    "  (SELECT c.name FROM assignments a JOIN contacts c ON c.id=a.contact_id WHERE a.booking_id=b.id AND a.role='driver_return' AND a.status!='cancelled' ORDER BY a.created_at DESC LIMIT 1) AS return_driver_name\n  FROM bookings b",
    "  (SELECT c.name FROM assignments a JOIN contacts c ON c.id=a.contact_id WHERE a.booking_id=b.id AND a.role='driver_return' AND a.status!='cancelled' ORDER BY a.created_at DESC LIMIT 1) AS return_driver_name,\n  COALESCE((SELECT c.name FROM assignments a JOIN contacts c ON c.id=a.contact_id WHERE a.booking_id=b.id AND a.role='cash_collector' AND a.status!='cancelled' ORDER BY a.created_at DESC LIMIT 1),(SELECT c.name FROM contacts c WHERE c.id=b.cash_collector_contact_id LIMIT 1)) AS cash_collector_name\n  FROM bookings b",
    "schedule collector",
)

# 4) Keep amount/currency if the partner reviews and confirms from this portal.
worker = replace_once(
    worker,
    '      pickup_location:String(body.pickup_location||"").trim()||null,\n      notes:String(body.notes||"").trim()||null,',
    '      pickup_location:String(body.pickup_location||"").trim()||null,\n      total_amount:Number(body.total_amount||0)||null,\n      currency:String(body.currency||"VND").trim()||"VND",\n      notes:String(body.notes||"").trim()||null,',
    "confirm payment values",
)
worker = replace_once(
    worker,
    "UPDATE bookings SET service_date=?,tour_type=?,guests=?,representative=?,phone=?,nationality=?,start_time=?,end_time=?,pickup_time=?,pickup_location=?,notes=?,source_text=?,status=CASE WHEN status IN ('inquiry','hold') THEN 'confirmed' ELSE status END,updated_at=CURRENT_TIMESTAMP WHERE id=?",
    "UPDATE bookings SET service_date=?,tour_type=?,guests=?,representative=?,phone=?,nationality=?,start_time=?,end_time=?,pickup_time=?,pickup_location=?,total_amount=?,currency=?,notes=?,source_text=?,status=CASE WHEN status IN ('inquiry','hold') THEN 'confirmed' ELSE status END,updated_at=CURRENT_TIMESTAMP WHERE id=?",
    "update SQL",
)
worker = replace_once(
    worker,
    'values.pickup_time,values.pickup_location,values.notes,values.source_text,bookingId).run();',
    'values.pickup_time,values.pickup_location,values.total_amount,values.currency,values.notes,values.source_text,bookingId).run();',
    "update bind",
)
worker = replace_once(
    worker,
    "INSERT INTO bookings(id,booking_code,status,service_date,tour_type,guests,representative,phone,nationality,start_time,end_time,pickup_time,pickup_location,notes,source_text,owner_name) VALUES(?,?,'confirmed',?,?,?,?,?,?,?,?,?,?,?,?,?)",
    "INSERT INTO bookings(id,booking_code,status,service_date,tour_type,guests,representative,phone,nationality,start_time,end_time,pickup_time,pickup_location,total_amount,currency,notes,source_text,owner_name) VALUES(?,?,'confirmed',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    "insert SQL",
)
worker = replace_once(
    worker,
    'values.pickup_time,values.pickup_location,values.notes,values.source_text,actor).run();',
    'values.pickup_time,values.pickup_location,values.total_amount,values.currency,values.notes,values.source_text,actor).run();',
    "insert bind",
)
worker_path.write_text(worker, encoding="utf-8")

# Portal JavaScript.
app_path = Path("fishing-public/fishing/app.js")
app = app_path.read_text(encoding="utf-8")
app = replace_once(
    app,
    'const fieldIds=["service_date","tour_type","representative","guests","nationality","phone","start_time","end_time","pickup_time","pickup_location","notes"];',
    'const fieldIds=["service_date","tour_type","representative","guests","nationality","phone","start_time","end_time","pickup_time","pickup_location","total_amount","currency","cash_collector_name","payment_status","notes"];',
    "portal field list",
)
app = replace_once(
    app,
    'payload.guests=Number(payload.guests||0)||null;payload.source_text=sourceText.value.trim();',
    'payload.guests=Number(payload.guests||0)||null;payload.total_amount=Number(payload.total_amount||0)||null;payload.source_text=sourceText.value.trim();',
    "amount payload",
)
app = replace_once(
    app,
    'const returnDriver=row.return_driver_name?esc(row.return_driver_name):"Theo tài xế đi / cập nhật sau";const isReady=ready(row);',
    'const returnDriver=row.return_driver_name?esc(row.return_driver_name):"Theo tài xế đi / cập nhật sau";const collectAmount=row.total_amount?`${Number(row.total_amount).toLocaleString("vi-VN")} ${esc(row.currency||"VND")}`:"Chưa có giá thu";const collector=row.cash_collector_name?esc(row.cash_collector_name):"Chưa chỉ định";const isReady=ready(row);',
    "trip collection data",
)
app = replace_once(
    app,
    '<div class="ops"><div class="ops-line"><span>Đón khách</span><span>${pickup}</span></div><div class="ops-line"><span>Tài xế đi</span><span>${driver}</span></div>',
    '<div class="ops"><div class="ops-line"><span>Đón khách</span><span>${pickup}</span></div><div class="ops-line"><span>Thu tiền</span><span>${collectAmount} · ${collector}</span></div><div class="ops-line"><span>Tài xế đi</span><span>${driver}</span></div>',
    "trip collection row",
)
app_path.write_text(app, encoding="utf-8")

# Preview form.
index_path = Path("fishing-public/fishing/index.html")
index = index_path.read_text(encoding="utf-8")
index = replace_once(
    index,
    '            <label>Điểm đón<input id="pickup_location" placeholder="Khách sạn / địa điểm"></label>\n            <label class="wide">Ghi chú<textarea id="notes" rows="3" placeholder="Yêu cầu đặc biệt nếu có"></textarea></label>',
    '            <label>Khách sạn / điểm đón<input id="pickup_location" placeholder="Khách sạn / địa điểm"></label>\n            <label>Tiền cần thu<input id="total_amount" type="number" min="0" step="1000" inputmode="numeric" placeholder="0"></label>\n            <label>Tiền tệ<input id="currency" value="VND" placeholder="VND"></label>\n            <label>Người thu<input id="cash_collector_name" readonly placeholder="Chưa chỉ định"></label>\n            <label>Trạng thái thu<input id="payment_status" readonly placeholder="Chưa thu"></label>\n            <label class="wide">Ghi chú<textarea id="notes" rows="3" placeholder="Yêu cầu đặc biệt nếu có"></textarea></label>',
    "preview payment fields",
)
index_path.write_text(index, encoding="utf-8")

print("Fishing parser/data prefill patch applied.")
