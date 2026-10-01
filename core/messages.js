function dmy(date) {
  const [y,m,d] = String(date || "").split("-");
  return y && m && d ? `${d}/${m}/${y}` : "-";
}

function money(value, currency = "VND") {
  const n = Number(value || 0);
  return n ? `${n.toLocaleString("vi-VN")} ${currency}` : "-";
}

export function driverMessage(booking) {
  return [
    "JoTrip - LỊCH ĐÓN KHÁCH",
    `Ngày: ${dmy(booking.service_date)}`,
    `Giờ đón: ${booking.pickup_time || "-"}`,
    `Điểm đón: ${booking.pickup_location || "-"}`,
    `Khách: ${booking.representative || "-"} - ${booking.guests || "-"} khách`,
    booking.phone ? `SĐT khách: ${booking.phone}` : null,
    `Dịch vụ: ${booking.tour_type || "Fishing tour"}`,
    booking.start_time ? `Tour: ${booking.start_time}${booking.end_time ? `-${booking.end_time}` : ""}` : null,
    "Có thay đổi JoTrip sẽ báo lại. Cảm ơn anh/chị."
  ].filter(Boolean).join("\n");
}

export function partnerMessage(booking, options = {}) {
  const lines = [
    "JoTrip - LỊCH TOUR",
    `Ngày: ${dmy(booking.service_date)}`,
    booking.start_time ? `Thời gian: ${booking.start_time}${booking.end_time ? `-${booking.end_time}` : ""}` : null,
    `Khách: ${booking.representative || "-"} - ${booking.guests || "-"} khách`,
    `Dịch vụ: ${booking.tour_type || "Fishing tour"}`,
    booking.notes ? `Lưu ý: ${booking.notes}` : null
  ];
  if (options.collectCash) {
    lines.push(`Thu hộ khách: ${money(booking.total_amount, booking.currency)} (${booking.payment_method === "cash" ? "tiền mặt" : booking.payment_method || ""})`);
    lines.push("Sau khi thu tiền vui lòng báo lại JoTrip.");
  }
  lines.push("Có thay đổi JoTrip sẽ báo lại. Cảm ơn anh/chị.");
  return lines.filter(Boolean).join("\n");
}

export function customerConfirmation(booking) {
  return [
    "Tour Confirmation",
    `Type: ${booking.tour_type || "Fishing tour"}`,
    `Guests: ${booking.guests || "-"}`,
    `Representative: ${booking.representative || "-"}`,
    `Date: ${dmy(booking.service_date)}`,
    `Time: ${booking.start_time || "-"}${booking.end_time ? ` - ${booking.end_time}` : ""}`,
    `Pick-up: ${booking.pickup_time || "-"} at ${booking.pickup_location || "-"}`,
    `Total: ${money(booking.total_amount, booking.currency)}`,
    booking.inclusions ? `Inclusions: ${booking.inclusions}` : null,
    booking.notes ? `Note: ${booking.notes}` : null
  ].filter(Boolean).join("\n");
}
