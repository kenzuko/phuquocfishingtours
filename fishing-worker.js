import { parseBookingText } from "./core/parser.js";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow, noarchive"
};

const NO_STORE = {
  "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
  pragma: "no-cache",
  expires: "0",
  "x-robots-tag": "noindex, nofollow, noarchive"
};

const PARTNER_CODES = {
  thanhnhan: { actor: "Thạnh Nhân", role: "partner", company: "Cano Thạnh Nhân" }
};

const ROOT_ASSETS = new Map([
  ["/styles.css", "/fishing/styles.css"],
  ["/app.js", "/fishing/app.js"],
  ["/extras.js", "/fishing/extras.js"],
  ["/utilities.js", "/fishing/utilities.js"],
  ["/jotrip-logo.png", "/fishing/jotrip-logo.png"]
]);

const PAGE_PATHS = new Set(["/", "/fishing", "/fishing/", "/fishing/index.html"]);

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
const html = (body, status = 200, extra = {}) => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", ...NO_STORE, ...extra } });
const redirect = (location, extra = {}) => new Response(null, { status: 303, headers: { location, ...NO_STORE, ...extra } });
const id = prefix => `${prefix}_${crypto.randomUUID()}`;

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
  return !origin || origin === new URL(request.url).origin;
}

function b64urlEncode(bytes) {
  let raw = "";
  for (const b of bytes) raw += String.fromCharCode(b);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecode(value) {
  const s = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = s + "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob(padded);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function makeSession(env, profile) {
  const payload = JSON.stringify({ ...profile, exp: Date.now() + 30 * 86400000 });
  const token = b64urlEncode(new TextEncoder().encode(payload));
  const sig = b64urlEncode(await hmac(env.SESSION_SECRET, token));
  return `${token}.${sig}`;
}

async function readSession(request, env) {
  if (!env.SESSION_SECRET) return null;
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)fishing_portal_session=([^;]+)/);
  if (!match) return null;
  const [token, sigToken] = match[1].split(".");
  if (!token || !sigToken) return null;
  try {
    const expected = await hmac(env.SESSION_SECRET, token);
    const actual = b64urlDecode(sigToken);
    if (!safeEqual(expected, actual)) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(token)));
    if (!payload?.actor || Number(payload.exp || 0) < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function sessionCookie(value) {
  return `fishing_portal_session=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 86400}`;
}
function clearCookie() {
  return "fishing_portal_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}

function loginPage(message = "") {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>JoTrip Fishing Ops</title><style>
  :root{font-family:Montserrat,Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#122d49;background:#f5f7f7}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:linear-gradient(180deg,#f8fbfc 0,#f5f7f7 100%)}.card{width:min(430px,100%);background:#fff;border:1px solid #dfe7ec;border-radius:7px;padding:30px;box-shadow:0 18px 45px rgba(11,47,87,.09)}.logo{display:block;width:170px;max-width:52%;height:auto;margin:0 auto 22px}.kicker{text-align:center;font-size:11px;font-weight:900;letter-spacing:.14em;color:#0b7f82}.title{text-align:center;font-size:27px;margin:7px 0 8px;color:#0b2f57}.sub{text-align:center;color:#66798b;line-height:1.55;font-size:14px;margin:0 0 22px}.error{background:#fff4ef;color:#93452f;border:1px solid #efc9bb;padding:10px 12px;border-radius:5px;margin:0 0 14px;font-size:13px}label{display:block;font-size:12px;font-weight:800;margin:0 0 7px;color:#315270}input{width:100%;padding:14px 15px;border:1px solid #cbd8e0;border-radius:5px;font:inherit;outline:none}input:focus{border-color:#0b7f82;box-shadow:0 0 0 3px rgba(11,127,130,.11)}button{width:100%;margin-top:12px;border:0;border-radius:5px;padding:14px 16px;background:#0b2f57;color:#fff;font:inherit;font-weight:850;cursor:pointer}.micro{text-align:center;margin-top:15px;color:#7d8d99;font-size:11px}</style></head><body><main class="card"><img class="logo" src="/jotrip-logo.png" alt="JoTrip"><div class="kicker">FISHING OPERATIONS</div><h1 class="title">Lịch điều hành</h1><p class="sub">Nhập mật khẩu để thêm tour và theo dõi lịch vận hành.</p>${message ? `<div class="error">${message}</div>` : ""}<form method="post" action="/auth/login"><label>Mật khẩu</label><input type="password" name="password" autocomplete="current-password" autofocus required><button type="submit">Vào Fishing Ops</button></form><div class="micro">Trang nội bộ JoTrip · Thiết bị sẽ nhớ đăng nhập 30 ngày.</div></main></body></html>`;
}

function assetRequest(request, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  return new Request(url, request);
}

async function serveAsset(request, env, pathname) {
  const response = await env.ASSETS.fetch(assetRequest(request, pathname));
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(NO_STORE)) headers.set(k, v);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function queryOne(db, sql, binds = []) {
  let q = db.prepare(sql);
  if (binds.length) q = q.bind(...binds);
  return await q.first();
}

async function queryAll(db, sql, binds = []) {
  let q = db.prepare(sql);
  if (binds.length) q = q.bind(...binds);
  const r = await q.all();
  return r.results || [];
}

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
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
  await db.prepare(`INSERT INTO fishing_portal_audit(id,booking_id,actor_name,action,summary,source_text) VALUES(?,?,?,?,?,?)`).bind(id("fpa"), bookingId || null, actor, action, summary, sourceText || null).run();
}

async function addBookingEvent(db, bookingId, actor, type, summary) {
  await db.prepare(`INSERT INTO booking_events(id,booking_id,event_type,summary,metadata_json,occurred_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(id("evt"), bookingId, type, `[Fishing Ops - ${actor}] ${summary}`, JSON.stringify({ actor, source: "fishing_portal" })).run();
}

async function schedule(db) {
  const from = localDate(-1);
  const rows = await queryAll(db, `SELECT b.id,b.booking_code,b.status,b.service_date,b.tour_type,b.guests,b.representative,b.phone,b.nationality,b.start_time,b.end_time,b.pickup_time,b.pickup_location,b.weather_status,b.owner_name,b.updated_at,
  (SELECT c.name FROM assignments a JOIN contacts c ON c.id=a.contact_id WHERE a.booking_id=b.id AND a.role='boat_partner' AND a.status!='cancelled' ORDER BY a.created_at DESC LIMIT 1) AS boat_partner_name,
  (SELECT c.name FROM assignments a JOIN contacts c ON c.id=a.contact_id WHERE a.booking_id=b.id AND a.role='driver_outbound' AND a.status!='cancelled' ORDER BY a.created_at DESC LIMIT 1) AS driver_name,
  (SELECT c.phone FROM assignments a JOIN contacts c ON c.id=a.contact_id WHERE a.booking_id=b.id AND a.role='driver_outbound' AND a.status!='cancelled' ORDER BY a.created_at DESC LIMIT 1) AS driver_phone,
  (SELECT c.vehicle_model FROM assignments a JOIN contacts c ON c.id=a.contact_id WHERE a.booking_id=b.id AND a.role='driver_outbound' AND a.status!='cancelled' ORDER BY a.created_at DESC LIMIT 1) AS vehicle_model,
  (SELECT c.vehicle_plate FROM assignments a JOIN contacts c ON c.id=a.contact_id WHERE a.booking_id=b.id AND a.role='driver_outbound' AND a.status!='cancelled' ORDER BY a.created_at DESC LIMIT 1) AS vehicle_plate,
  (SELECT c.name FROM assignments a JOIN contacts c ON c.id=a.contact_id WHERE a.booking_id=b.id AND a.role='driver_return' AND a.status!='cancelled' ORDER BY a.created_at DESC LIMIT 1) AS return_driver_name
  FROM bookings b WHERE b.service_date>=? AND b.status!='cancelled' ORDER BY b.service_date ASC,COALESCE(b.pickup_time,b.start_time,'99:99') ASC,b.created_at ASC LIMIT 300`, [from]);
  return { today: localDate(0), tomorrow: localDate(1), results: rows };
}

async function activity(db) {
  return await queryAll(db, `SELECT actor_name,action,summary,created_at FROM fishing_portal_audit ORDER BY created_at DESC LIMIT 100`);
}

function canonicalApiPath(pathname) {
  if (pathname.startsWith("/fishing/api/")) return pathname.slice("/fishing".length);
  return pathname;
}

async function portalApi(request, env, session) {
  const db = env.BOOKING_DB;
  const path = canonicalApiPath(new URL(request.url).pathname);
  if (!["GET", "HEAD"].includes(request.method) && !sameOrigin(request)) return json({ error: "origin_rejected" }, 403);
  if (path === "/api/me" && request.method === "GET") return json({ actor: session.actor, role: session.role || "partner", company: session.company || "" });
  if (path === "/api/schedule" && request.method === "GET") return json(await schedule(db));
  if (path === "/api/activity" && request.method === "GET") return json({ results: await activity(db) });
  if (path === "/api/parse" && request.method === "POST") {
    const body = await readJson(request);
    if (!body?.text) return json({ error: "text_required" }, 400);
    const result = parseQuickBooking(body.text);
    const duplicate = await findDuplicate(db, result);
    return json({ result, duplicate });
  }
  if (path === "/api/confirm" && request.method === "POST") {
    const body = await readJson(request);
    if (!body?.service_date) return json({ error: "service_date_required" }, 400);
    if (!body?.representative && !body?.phone) return json({ error: "guest_or_phone_required" }, 400);
    const actor = session.actor;
    const existing = body.booking_id ? await queryOne(db, "SELECT * FROM bookings WHERE id=?", [body.booking_id]) : null;
    const values = {
      service_date:String(body.service_date),
      tour_type:String(body.tour_type||"Big Fishing"),
      guests:Number(body.guests||0)||null,
      representative:String(body.representative||"").trim()||null,
      phone:String(body.phone||"").trim()||null,
      nationality:String(body.nationality||"").trim()||null,
      start_time:String(body.start_time||"").trim()||null,
      end_time:String(body.end_time||"").trim()||null,
      pickup_time:String(body.pickup_time||"").trim()||null,
      pickup_location:String(body.pickup_location||"").trim()||null,
      notes:String(body.notes||"").trim()||null,
      source_text:String(body.source_text||"").trim()||null
    };
    let bookingId, action;
    if (existing) {
      bookingId = existing.id;
      await db.prepare(`UPDATE bookings SET service_date=?,tour_type=?,guests=?,representative=?,phone=?,nationality=?,start_time=?,end_time=?,pickup_time=?,pickup_location=?,notes=?,source_text=?,status=CASE WHEN status IN ('inquiry','hold') THEN 'confirmed' ELSE status END,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(values.service_date,values.tour_type,values.guests,values.representative,values.phone,values.nationality,values.start_time,values.end_time,values.pickup_time,values.pickup_location,values.notes,values.source_text,bookingId).run();
      action = "updated";
      await addBookingEvent(db, bookingId, actor, "portal_updated", "Booking được cập nhật từ nội dung dán vào.");
    } else {
      bookingId = id("bk");
      await db.prepare(`INSERT INTO bookings(id,booking_code,status,service_date,tour_type,guests,representative,phone,nationality,start_time,end_time,pickup_time,pickup_location,notes,source_text,owner_name) VALUES(?,?,'confirmed',?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(bookingId,bookingCode(),values.service_date,values.tour_type,values.guests,values.representative,values.phone,values.nationality,values.start_time,values.end_time,values.pickup_time,values.pickup_location,values.notes,values.source_text,actor).run();
      action = "created";
      await addBookingEvent(db, bookingId, actor, "portal_created", "Booking được tạo từ nội dung dán vào.");
    }
    const summary = `${values.service_date} · ${values.representative || values.phone || "Khách"} · ${values.guests || "?"} khách`;
    await addAudit(db, bookingId, actor, action, summary, values.source_text);
    return json({ ok:true, action, booking_id:bookingId });
  }
  return json({ error: "not_found" }, 404);
}

async function authRoute(request, env) {
  const path = new URL(request.url).pathname;
  const isLogout = path === "/auth/logout" || path === "/fishing/auth/logout";
  const isLogin = path === "/auth/login" || path === "/fishing/auth/login";

  if (isLogout && request.method === "POST") return redirect("/", { "set-cookie": clearCookie() });
  if (!isLogin || request.method !== "POST") return null;
  if (!sameOrigin(request)) return html(loginPage("Request bị từ chối."), 403);
  if (!env.SESSION_SECRET) return html(loginPage("Hệ thống chưa sẵn sàng."), 503);

  const form = await request.formData();
  const password = String(form.get("password") || "").trim();
  let profile = PARTNER_CODES[password.toLowerCase()] || null;
  if (!profile && env.ADMIN_PASSWORD && password === env.ADMIN_PASSWORD) {
    profile = { actor: env.ADMIN_USER || "JoTrip Admin", role: "admin", company: "JoTrip" };
  }
  if (!profile) return html(loginPage("Sai mật khẩu."), 401);

  const session = await makeSession(env, profile);
  return redirect("/", { "set-cookie": sessionCookie(session) });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (ROOT_ASSETS.has(path)) return serveAsset(request, env, ROOT_ASSETS.get(path));
    if (path.startsWith("/fishing/") && /\.(?:css|js|png|jpg|jpeg|webp|svg|ico)$/i.test(path)) return serveAsset(request, env, path);

    if (!env.BOOKING_DB) return json({ error: "database_not_bound" }, 503);

    const auth = await authRoute(request, env);
    if (auth) return auth;

    const session = await readSession(request, env);
    const isApi = path.startsWith("/api/") || path.startsWith("/fishing/api/");

    if (!session) {
      if (isApi) return json({ error: "authentication_required" }, 401);
      if (PAGE_PATHS.has(path)) return html(loginPage());
      return new Response("Not found", { status: 404, headers: NO_STORE });
    }

    if (isApi) return portalApi(request, env, session);

    if (PAGE_PATHS.has(path)) {
      return serveAsset(request, env, "/fishing/index.html");
    }

    return new Response("Not found", { status: 404, headers: NO_STORE });
  }
};
