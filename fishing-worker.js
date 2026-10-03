import { parseBookingText } from "./core/parser.js";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow, noarchive"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function html(body, status = 200, extra = {}) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow, noarchive",
      ...extra
    }
  });
}

function redirect(location, extra = {}) {
  return new Response(null, {
    status: 303,
    headers: {
      location,
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow, noarchive",
      ...extra
    }
  });
}

function id(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function bookingCode() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const tail = crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `FISH-${y}${m}${d}-${tail}`;
}

function localDate(offsetDays = 0) {
  const base = new Date(Date.now() + 7 * 3600000 + offsetDays * 86400000);
  return base.toISOString().slice(0, 10);
}

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return origin === new URL(request.url).origin;
}

function b64urlEncode(bytes) {
  let raw = "";
  for (const b of bytes) raw += String.fromCharCode(b);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecode(value) {
  const padded = String(value).replace(/-/g, "+").replace(/_/g, "/") + "===".slice((String(value).length + 3) % 4);
  const raw = atob(padded);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function makeSession(env, actor) {
  const payload = JSON.stringify({ actor: String(actor || "Team").slice(0, 60), exp: Date.now() + 7 * 86400000 });
  const payloadToken = b64urlEncode(new TextEncoder().encode(payload));
  const sig = b64urlEncode(await hmac(env.SESSION_SECRET, payloadToken));
  return `${payloadToken}.${sig}`;
}

async function readSession(request, env) {
  if (!env.SESSION_SECRET) return null;
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)fishing_portal_session=([^;]+)/);
  if (!match) return null;
  const [payloadToken, sigToken] = match[1].split(".");
  if (!payloadToken || !sigToken) return null;
  let expected;
  let actual;
  try {
    expected = await hmac(env.SESSION_SECRET, payloadToken);
    actual = b64urlDecode(sigToken);
  } catch {
    return null;
  }
  if (!safeEqual(expected, actual)) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadToken)));
    if (!payload?.actor || !payload?.exp || Number(payload.exp) < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function sessionCookie(value) {
  return `fishing_portal_session=${value}; Path=/fishing; HttpOnly; Secure; SameSite=Lax; Max-Age=${7 * 86400}`;
}

function clearCookie() {
  return "fishing_portal_session=; Path=/fishing; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}

async function pbkdf2(password, saltBytes) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations: 120000 },
    key,
    256
  );
  return new Uint8Array(bits);
}

async function queryOne(db, sql, binds = []) {
  let s = db.prepare(sql);
  if (binds.length) s = s.bind(...binds);
  return await s.first();
}

async function queryAll(db, sql, binds = []) {
  let s = db.prepare(sql);
  if (binds.length) s = s.bind(...binds);
  const result = await s.all();
  return result.results || [];
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function getSetting(db, key) {
  const row = await queryOne(db, "SELECT value FROM fishing_portal_settings WHERE key=?", [key]);
  return row?.value || "";
}

async function setSetting(db, key, value) {
  await db.prepare(`
    INSERT INTO fishing_portal_settings(key,value,updated_at)
    VALUES(?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP
  `).bind(key, value).run();
}

async function portalConfigured(db) {
  const [salt, hash] = await Promise.all([
    getSetting(db, "password_salt"),
    getSetting(db, "password_hash")
  ]);
  return Boolean(salt && hash);
}

async function setPortalPassword(db, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt);
  await setSetting(db, "password_salt", b64urlEncode(salt));
  await setSetting(db, "password_hash", b64urlEncode(hash));
}

async function validPortalPassword(db, password) {
  const saltToken = await getSetting(db, "password_salt");
  const hashToken = await getSetting(db, "password_hash");
  if (!saltToken || !hashToken) return false;
  try {
    const actual = await pbkdf2(password, b64urlDecode(saltToken));
    return safeEqual(actual, b64urlDecode(hashToken));
  } catch {
    return false;
  }
}

function shell(title, body) {
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>${title}</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172033;background:#f4f5f7}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px}.card{width:min(460px,100%);background:#fff;border:1px solid #e1e5ea;border-radius:22px;padding:28px;box-shadow:0 16px 50px rgba(23,32,51,.08)}h1{font-size:25px;margin:0 0 8px}.muted{color:#667085;line-height:1.55;margin:0 0 22px}label{display:block;font-size:13px;font-weight:700;margin:14px 0 6px}input{width:100%;padding:13px 14px;border:1px solid #ccd2da;border-radius:12px;font:inherit}button{width:100%;margin-top:18px;border:0;border-radius:12px;padding:13px 16px;background:#172033;color:#fff;font:inherit;font-weight:800;cursor:pointer}.error{padding:10px 12px;background:#fff1f1;color:#a11;border-radius:10px;margin:12px 0}.small{font-size:12px;color:#8a93a3;margin-top:16px}.brand{font-size:12px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:#637083;margin-bottom:10px}
</style>
</head>
<body><main class="card"><div class="brand">Phu Quoc Fishing Tours</div>${body}</main></body>
</html>`;
}

function loginPage(message = "") {
  return shell("Fishing Ops", `
    <h1>Fishing Ops</h1>
    <p class="muted">Dán booking, kiểm tra thông tin và theo dõi lịch vận hành. Trang này dành cho đội nội bộ.</p>
    ${message ? `<div class="error">${message}</div>` : ""}
    <form method="post" action="/fishing/auth/login">
      <label>Tên của bạn</label>
      <input name="actor" autocomplete="name" placeholder="Ví dụ: Phương" required maxlength="60">
      <label>Mật khẩu</label>
      <input type="password" name="password" autocomplete="current-password" required>
      <button type="submit">Vào lịch Fishing</button>
    </form>
    <div class="small">Không hiển thị trên Google. Phiên đăng nhập được lưu 7 ngày trên thiết bị này.</div>
  `);
}

function setupPage(message = "") {
  return shell("Kích hoạt Fishing Ops", `
    <h1>Kích hoạt Fishing Ops</h1>
    <p class="muted">Bước này chỉ làm một lần. Dùng tài khoản quản trị hiện tại để đặt mật khẩu riêng cho đội Fishing.</p>
    ${message ? `<div class="error">${message}</div>` : ""}
    <form method="post" action="/fishing/setup">
      <label>Tài khoản quản trị</label>
      <input name="admin_user" autocomplete="username" required>
      <label>Mật khẩu quản trị</label>
      <input type="password" name="admin_password" autocomplete="current-password" required>
      <label>Mật khẩu mới cho /fishing</label>
      <input type="password" name="portal_password" autocomplete="new-password" minlength="8" required>
      <button type="submit">Lưu mật khẩu Fishing</button>
    </form>
    <div class="small">Mật khẩu Fishing được băm trước khi lưu xuống D1, không lưu dạng chữ thường.</div>
  `);
}

function normalizePhone(text) {
  const match = String(text || "").match(/\+?\d[\d\s().-]{7,}/);
  return match ? match[0].replace(/[\s().-]/g, "") : "";
}

function parseQuickBooking(input) {
  const text = String(input || "").replace(/\r/g, "").trim();
  const base = parseBookingText(text);
  const normalized = text.replace(/[–—]/g, "-");
  const dateMatch = normalized.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/);
  const serviceDate = base.service_date || (dateMatch ? `${dateMatch[3]}-${String(dateMatch[2]).padStart(2,"0")}-${String(dateMatch[1]).padStart(2,"0")}` : "");
  const session = /\b(chiều|afternoon|pm)\b/i.test(normalized) ? "afternoon" : /\b(sáng|morning|am)\b/i.test(normalized) ? "morning" : "";
  const guests = base.guests || Number(normalized.match(/\b(\d{1,2})\s*(?:NL|khách|khach|pax)\b/i)?.[1] || 0) || null;

  let representative = base.representative;
  if (!representative && dateMatch) {
    const afterDate = normalized.slice((dateMatch.index || 0) + dateMatch[0].length);
    const m = afterDate.match(/(?:sáng|chiều|morning|afternoon|am|pm)?\s*-\s*([^/(\n-]{2,50})/i);
    if (m) representative = m[1].trim();
  }

  let nationality = base.nationality;
  if (!nationality) {
    if (/\b(Nga|Russia|Russian)\b/i.test(normalized)) nationality = "Russia";
    else if (/\b(Hàn|Korea|Korean)\b/i.test(normalized)) nationality = "Korea";
    else if (/\b(Trung Quốc|China|Chinese)\b/i.test(normalized)) nationality = "China";
    else if (/\b(Taiwan|Đài Loan)\b/i.test(normalized)) nationality = "Taiwan";
    else if (/\b(Việt Nam|Vietnam|Vietnamese)\b/i.test(normalized)) nationality = "Vietnam";
  }

  const pickup = normalized.match(/(?:đón|don|pickup|pick-up)\s*(?:lúc|at|:)?\s*(\d{1,2}:\d{2})?\s*(?:tại|at)?\s*([^\n;]+)?/i);
  const phone = base.phone || base.whatsapp || normalizePhone(normalized);

  return {
    ...base,
    service_date: serviceDate,
    tour_type: base.tour_type || "Big Fishing",
    guests,
    representative: representative || "",
    phone,
    nationality: nationality || "",
    start_time: base.start_time || (session === "morning" ? "05:00" : session === "afternoon" ? "14:00" : ""),
    end_time: base.end_time || (session === "morning" ? "14:00" : session === "afternoon" ? "21:00" : ""),
    pickup_time: base.pickup_time || pickup?.[1] || "",
    pickup_location: base.pickup_location || String(pickup?.[2] || "").trim(),
    session,
    source_text: text
  };
}

async function findDuplicate(db, data) {
  if (!data.service_date) return null;
  if (data.phone) {
    const row = await queryOne(db, `SELECT id,booking_code,status,service_date,representative,guests,phone FROM bookings WHERE service_date=? AND status!='cancelled' AND phone=? ORDER BY updated_at DESC LIMIT 1`, [data.service_date, data.phone]);
    if (row) return row;
  }
  if (data.representative) {
    return await queryOne(db, `SELECT id,booking_code,status,service_date,representative,guests,phone FROM bookings WHERE service_date=? AND status!='cancelled' AND lower(representative)=lower(?) ORDER BY updated_at DESC LIMIT 1`, [data.service_date, data.representative]);
  }
  return null;
}

async function addAudit(db, bookingId, actor, action, summary, sourceText = "") {
  await db.prepare(`INSERT INTO fishing_portal_audit(id,booking_id,actor_name,action,summary,source_text) VALUES(?,?,?,?,?,?)`)
    .bind(id("fpa"), bookingId || null, actor, action, summary, sourceText || null).run();
}

async function addBookingEvent(db, bookingId, actor, type, summary) {
  await db.prepare(`INSERT INTO booking_events(id,booking_id,event_type,summary,metadata_json,occurred_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)`)
    .bind(id("evt"), bookingId, type, `[Fishing Ops - ${actor}] ${summary}`, JSON.stringify({ actor, source: "fishing_portal" })).run();
}

async function schedule(db) {
  const from = localDate(-1);
  const rows = await queryAll(db, `
    SELECT b.id,b.booking_code,b.status,b.service_date,b.tour_type,b.guests,b.representative,b.phone,b.nationality,
           b.start_time,b.end_time,b.pickup_time,b.pickup_location,b.weather_status,b.updated_at,
           (SELECT c.name FROM assignments a JOIN contacts c ON c.id=a.contact_id WHERE a.booking_id=b.id AND a.role='boat_partner' AND a.status!='cancelled' ORDER BY a.created_at DESC LIMIT 1) AS boat_partner_name,
           (SELECT c.name FROM assignments a JOIN contacts c ON c.id=a.contact_id WHERE a.booking_id=b.id AND a.role='driver_outbound' AND a.status!='cancelled' ORDER BY a.created_at DESC LIMIT 1) AS driver_name,
           (SELECT c.phone FROM assignments a JOIN contacts c ON c.id=a.contact_id WHERE a.booking_id=b.id AND a.role='driver_outbound' AND a.status!='cancelled' ORDER BY a.created_at DESC LIMIT 1) AS driver_phone,
           (SELECT c.vehicle_model FROM assignments a JOIN contacts c ON c.id=a.contact_id WHERE a.booking_id=b.id AND a.role='driver_outbound' AND a.status!='cancelled' ORDER BY a.created_at DESC LIMIT 1) AS vehicle_model,
           (SELECT c.vehicle_plate FROM assignments a JOIN contacts c ON c.id=a.contact_id WHERE a.booking_id=b.id AND a.role='driver_outbound' AND a.status!='cancelled' ORDER BY a.created_at DESC LIMIT 1) AS vehicle_plate,
           (SELECT c.name FROM assignments a JOIN contacts c ON c.id=a.contact_id WHERE a.booking_id=b.id AND a.role='driver_return' AND a.status!='cancelled' ORDER BY a.created_at DESC LIMIT 1) AS return_driver_name
    FROM bookings b
    WHERE b.service_date>=? AND b.status!='cancelled'
    ORDER BY b.service_date ASC,COALESCE(b.pickup_time,b.start_time,'99:99') ASC,b.created_at ASC
    LIMIT 250
  `, [from]);
  return { today: localDate(0), tomorrow: localDate(1), results: rows };
}

async function portalApi(request, env, session) {
  const db = env.BOOKING_DB;
  const url = new URL(request.url);
  if (!["GET", "HEAD"].includes(request.method) && !sameOrigin(request)) return json({ error: "origin_rejected" }, 403);

  if (url.pathname === "/fishing/api/schedule" && request.method === "GET") {
    return json(await schedule(db));
  }

  if (url.pathname === "/fishing/api/parse" && request.method === "POST") {
    const body = await readJson(request);
    if (!body?.text) return json({ error: "text_required" }, 400);
    const result = parseQuickBooking(body.text);
    const duplicate = await findDuplicate(db, result);
    return json({ result, duplicate });
  }

  if (url.pathname === "/fishing/api/confirm" && request.method === "POST") {
    const body = await readJson(request);
    if (!body?.service_date) return json({ error: "service_date_required" }, 400);
    if (!body?.representative && !body?.phone) return json({ error: "guest_or_phone_required" }, 400);

    const actor = session.actor;
    const existing = body.booking_id ? await queryOne(db, "SELECT * FROM bookings WHERE id=?", [body.booking_id]) : null;
    const values = {
      service_date: String(body.service_date),
      tour_type: String(body.tour_type || "Big Fishing"),
      guests: Number(body.guests || 0) || null,
      representative: String(body.representative || "").trim() || null,
      phone: String(body.phone || "").trim() || null,
      nationality: String(body.nationality || "").trim() || null,
      start_time: String(body.start_time || "").trim() || null,
      end_time: String(body.end_time || "").trim() || null,
      pickup_time: String(body.pickup_time || "").trim() || null,
      pickup_location: String(body.pickup_location || "").trim() || null,
      notes: String(body.notes || "").trim() || null,
      source_text: String(body.source_text || "").trim() || null
    };

    let bookingId;
    let action;
    if (existing) {
      bookingId = existing.id;
      await db.prepare(`
        UPDATE bookings SET
          service_date=?,tour_type=?,guests=?,representative=?,phone=?,nationality=?,start_time=?,end_time=?,
          pickup_time=?,pickup_location=?,notes=?,source_text=?,
          status=CASE WHEN status IN ('inquiry','hold') THEN 'confirmed' ELSE status END,
          updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).bind(
        values.service_date, values.tour_type, values.guests, values.representative, values.phone, values.nationality,
        values.start_time, values.end_time, values.pickup_time, values.pickup_location, values.notes, values.source_text, bookingId
      ).run();
      action = "updated";
      await addBookingEvent(db, bookingId, actor, "portal_updated", "Booking được cập nhật từ nội dung dán vào.");
    } else {
      bookingId = id("bk");
      await db.prepare(`
        INSERT INTO bookings(
          id,booking_code,status,service_date,tour_type,guests,representative,phone,nationality,start_time,end_time,
          pickup_time,pickup_location,notes,source_text,owner_name
        ) VALUES(?,?,'confirmed',?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(
        bookingId, bookingCode(), values.service_date, values.tour_type, values.guests, values.representative, values.phone,
        values.nationality, values.start_time, values.end_time, values.pickup_time, values.pickup_location, values.notes,
        values.source_text, actor
      ).run();
      action = "created";
      await addBookingEvent(db, bookingId, actor, "portal_created", "Booking được tạo từ nội dung dán vào.");
    }

    const summary = `${values.service_date} · ${values.representative || values.phone || "Khách"} · ${values.guests || "?"} khách`;
    await addAudit(db, bookingId, actor, action, summary, values.source_text);
    return json({ ok: true, action, booking_id: bookingId });
  }

  return json({ error: "not_found" }, 404);
}

async function setupRoute(request, env) {
  const db = env.BOOKING_DB;
  if (!db) return html(setupPage("Database chưa được kết nối."), 503);
  if (request.method === "GET") return html(setupPage());
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!sameOrigin(request)) return html(setupPage("Request bị từ chối."), 403);
  if (!env.ADMIN_USER || !env.ADMIN_PASSWORD || !env.SESSION_SECRET) return html(setupPage("Thiếu secret quản trị trên Worker."), 503);
  const form = await request.formData();
  const adminUser = String(form.get("admin_user") || "");
  const adminPassword = String(form.get("admin_password") || "");
  const portalPassword = String(form.get("portal_password") || "");
  if (adminUser !== env.ADMIN_USER || adminPassword !== env.ADMIN_PASSWORD) return html(setupPage("Sai tài khoản hoặc mật khẩu quản trị."), 401);
  if (portalPassword.length < 8) return html(setupPage("Mật khẩu Fishing cần ít nhất 8 ký tự."), 400);
  await setPortalPassword(db, portalPassword);
  await addAudit(db, null, "Admin", "password_set", "Mật khẩu Fishing Ops đã được đặt lại.");
  return redirect("/fishing");
}

async function authRoute(request, env) {
  const db = env.BOOKING_DB;
  const url = new URL(request.url);
  if (url.pathname === "/fishing/auth/logout" && request.method === "POST") {
    return redirect("/fishing", { "set-cookie": clearCookie() });
  }
  if (url.pathname !== "/fishing/auth/login" || request.method !== "POST") return null;
  if (!sameOrigin(request)) return html(loginPage("Request bị từ chối."), 403);
  const form = await request.formData();
  const actor = String(form.get("actor") || "").trim();
  const password = String(form.get("password") || "");
  if (!actor) return html(loginPage("Nhập tên của bạn."), 400);
  if (!await validPortalPassword(db, password)) return html(loginPage("Sai mật khẩu."), 401);
  const session = await makeSession(env, actor);
  return redirect("/fishing", { "set-cookie": sessionCookie(session) });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/fishing")) return new Response("Not found", { status: 404 });
    if (!env.BOOKING_DB) return json({ error: "database_not_bound" }, 503);

    if (url.pathname === "/fishing/setup") return setupRoute(request, env);

    const configured = await portalConfigured(env.BOOKING_DB);
    if (!configured) return html(setupPage());

    const auth = await authRoute(request, env);
    if (auth) return auth;

    const session = await readSession(request, env);
    if (!session) {
      if (url.pathname.startsWith("/fishing/api/")) return json({ error: "authentication_required" }, 401);
      return html(loginPage());
    }

    if (url.pathname.startsWith("/fishing/api/")) return portalApi(request, env, session);

    if (url.pathname === "/fishing" || url.pathname === "/fishing/") {
      const assetUrl = new URL("/fishing/index.html", request.url);
      return env.ASSETS.fetch(new Request(assetUrl, request));
    }

    if (url.pathname === "/fishing/index.html") return redirect("/fishing");
    return env.ASSETS.fetch(request);
  }
};
