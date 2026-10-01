const MONTHS = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12"
};

function clean(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function field(text, labels) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp(`(?:^|\\n)\\s*[-•*]?\\s*${escaped}\\s*:\\s*([^\\n]+)`, "i"));
    if (match) return clean(match[1]);
  }
  return "";
}

function parseEnglishDate(value) {
  const m = String(value || "").match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})/i);
  if (!m) return "";
  return `${m[3]}-${MONTHS[m[1].toLowerCase()]}-${String(m[2]).padStart(2, "0")}`;
}

function parseNumericDate(value) {
  const m = String(value || "").match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/);
  if (!m) return "";
  return `${m[3]}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
}

function parseTimeRange(value) {
  const normalized = String(value || "").replace(/[–—]/g, "-");
  const range = normalized.match(/\b(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\b/);
  if (range) return { start_time: range[1], end_time: range[2] };
  return { start_time: "", end_time: "" };
}

function parseMoney(value) {
  const m = String(value || "").match(/([\d.,]+)\s*(VND|VNĐ|₫)?/i);
  if (!m) return null;
  const digits = m[1].replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

function parseRepresentative(value) {
  const phone = value.match(/\+?\d[\d\s()-]{7,}/)?.[0]?.replace(/[\s()-]/g, "") || "";
  const telegram = value.match(/@[A-Za-z0-9_]{4,}/)?.[0] || "";
  const name = clean(value.replace(/\([^)]*\)/g, "").replace(phone, "").replace(telegram, ""));
  return { representative: name, phone, telegram };
}

export function parseBookingText(input) {
  const text = String(input || "").replace(/\r/g, "");
  const type = field(text, ["Type", "Tour", "Loại tour", "Dịch vụ"]);
  const guestsRaw = field(text, ["Number of guests", "Guests", "Pax", "Số khách"]);
  const representativeRaw = field(text, ["Representative", "Lead guest", "Khách đại diện", "Khách"]);
  const timeRaw = field(text, ["Time", "Tour time", "Thời gian"]);
  const pickupRaw = field(text, ["Pick-up", "Pickup", "Đón khách", "Giờ đón"]);
  const totalRaw = field(text, ["Total cost", "Total", "Price", "Giá", "Tổng tiền"]);
  const inclusions = field(text, ["Inclusions", "Included", "Bao gồm"]);
  const note = field(text, ["Note", "Notes", "Ghi chú"]);
  const nationality = field(text, ["Nationality", "Quốc tịch"]);

  const rep = parseRepresentative(representativeRaw || text.match(/Representative\s*:\s*([^\n]+)/i)?.[1] || "");
  const time = parseTimeRange(timeRaw || text);
  const serviceDate = parseEnglishDate(timeRaw || text) || parseNumericDate(timeRaw || text);
  const pickupMatch = pickupRaw.match(/\b(\d{1,2}:\d{2})\b/);
  const pickupTime = pickupMatch?.[1] || "";
  const pickupLocation = clean(pickupRaw.replace(pickupMatch?.[0] || "", "").replace(/^\s*(at|tại)\s+/i, ""));
  const paymentMethod = /cash|tiền mặt/i.test(totalRaw) ? "cash" : /card|thẻ/i.test(totalRaw) ? "card" : "unknown";
  const whatsapp = text.match(/WhatsApp\s*:?\s*(\+?\d[\d\s()-]{7,})/i)?.[1]?.replace(/[\s()-]/g, "") || "";

  return {
    tour_type: type,
    guests: Number(guestsRaw.match(/\d+/)?.[0] || 0) || null,
    representative: rep.representative,
    phone: rep.phone,
    telegram: rep.telegram,
    whatsapp,
    nationality: nationality || (text.match(/\((Russia|Russian|Korea|Korean|Vietnam|Vietnamese|China|Chinese|Taiwan|Hong Kong)\)/i)?.[1] || ""),
    service_date: serviceDate,
    start_time: time.start_time,
    end_time: time.end_time,
    pickup_time: pickupTime,
    pickup_location: pickupLocation,
    total_amount: parseMoney(totalRaw),
    currency: /USD/i.test(totalRaw) ? "USD" : "VND",
    payment_method: paymentMethod,
    inclusions,
    notes: note,
    source_text: text.trim()
  };
}
