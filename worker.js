import { parseBookingText } from "./core/parser.js";
import { driverMessage, partnerMessage, customerConfirmation } from "./core/messages.js";
import { authConfigured, createSession, validSession, sessionCookie, clearSessionCookie, loginPage } from "./core/auth.js";

const JSON_HEADERS = { "content-type":"application/json; charset=utf-8", "cache-control":"no-store" };
const ALLOWED_BOOKING_FIELDS = new Set([
  "status","service_date","tour_type","guests","representative","phone","telegram","whatsapp","nationality",
  "start_time","end_time","pickup_time","pickup_location","total_amount","currency","payment_method","payment_status",
  "cash_collector_contact_id","inclusions","notes","weather_status","owner_name"
]);

function json(data, status=200) { return new Response(JSON.stringify(data, null, 2), { status, headers: JSON_HEADERS }); }
function html(body, status=200, headers={}) { return new Response(body, { status, headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store",...headers} }); }
function redirect(location, headers={}) { return new Response(null, { status:303, headers:{location,"cache-control":"no-store",...headers} }); }
function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function bookingCode() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth()+1).padStart(2,"0");
  const d = String(now.getUTCDate()).padStart(2,"0");
  const tail = crypto.randomUUID().replace(/-/g,"").slice(0,6).toUpperCase();
  return `FISH-${y}${m}${d}-${tail}`;
}
function localDate(offsetDays=0) {
  const base = new Date(Date.now() + 7*3600000 + offsetDays*86400000);
  return base.toISOString().slice(0,10);
}
function d1DueAt(serviceDate) {
  const target = new Date(`${serviceDate}T18:00:00+07:00`);
  return new Date(target.getTime() - 86400000).toISOString();
}
function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return origin === new URL(request.url).origin;
}
async function queryAll(db, sql, binds=[]) {
  let s=db.prepare(sql); if (binds.length) s=s.bind(...binds); const r=await s.all(); return r.results || [];
}
async function queryOne(db, sql, binds=[]) {
  let s=db.prepare(sql); if (binds.length) s=s.bind(...binds); return await s.first();
}
async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}
async function event(db, bookingId, type, summary, metadata=null) {
  await db.prepare(`INSERT INTO booking_events(id,booking_id,event_type,summary,metadata_json,occurred_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)`)
    .bind(id("evt"), bookingId, type, summary, metadata ? JSON.stringify(metadata) : null).run();
}
async function loadBooking(db, bookingId) {
  const booking = await queryOne(db, `SELECT b.*, c.name AS cash_collector_name FROM bookings b LEFT JOIN contacts c ON c.id=b.cash_collector_contact_id WHERE b.id=?`, [bookingId]);
  if (!booking) return null;
  const [assignments, events, reminders] = await Promise.all([
    queryAll(db, `SELECT a.*, c.name AS contact_name,c.phone,c.zalo_phone,c.whatsapp,c.can_collect_cash,c.company FROM assignments a JOIN contacts c ON c.id=a.contact_id WHERE a.booking_id=? AND a.status!='cancelled' ORDER BY a.created_at`, [bookingId]),
    queryAll(db, `SELECT * FROM booking_events WHERE booking_id=? ORDER BY occurred_at DESC LIMIT 100`, [bookingId]),
    queryAll(db, `SELECT * FROM reminders WHERE booking_id=? ORDER BY due_at`, [bookingId])
  ]);
  return { ...booking, assignments, events, reminders };
}
async function upsertAssignment(db, bookingId, role, contactId) {
  const booking = await queryOne(db, `SELECT * FROM bookings WHERE id=?`, [bookingId]);
  const contact = await queryOne(db, `SELECT * FROM contacts WHERE id=? AND active=1`, [contactId]);
  if (!booking || !contact) throw new Error("booking_or_contact_not_found");
  await db.prepare(`UPDATE assignments SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE booking_id=? AND role=? AND status!='cancelled'`).bind(bookingId, role).run();
  const assignmentId=id("asg");
  await db.prepare(`INSERT INTO assignments(id,booking_id,role,contact_id,status) VALUES(?,?,?,?, 'assigned')`).bind(assignmentId, bookingId, role, contactId).run();
  const collectCash = role === "cash_collector" || (role === "boat_partner" && Number(contact.can_collect_cash) === 1 && booking.payment_method === "cash");
  const message = role.startsWith("driver") ? driverMessage(booking) : partnerMessage(booking,{collectCash});
  const reminderId=id("rem");
  await db.prepare(`INSERT INTO reminders(id,booking_id,assignment_id,reminder_type,due_at,status,channel,message) VALUES(?,?,?,?,?,'open','zalo',?)`)
    .bind(reminderId, bookingId, assignmentId, "d1", d1DueAt(booking.service_date), message).run();
  if (role === "cash_collector") {
    await db.prepare(`UPDATE bookings SET cash_collector_contact_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(contactId, bookingId).run();
  }
  await event(db, bookingId, "assignment_changed", `${role}: ${contact.name}`, { role, contact_id:contactId });
  return assignmentId;
}

async function api(request, env) {
  const url = new URL(request.url);
  const db = env.BOOKING_DB;
  if (!db) return json({error:"database_not_bound"},503);
  if (!["GET","HEAD"].includes(request.method) && !sameOrigin(request)) return json({error:"origin_rejected"},403);

  if (url.pathname === "/api/health") return json({status:"ok",database_bound:true,now:new Date().toISOString()});

  if (url.pathname === "/api/v1/parse" && request.method === "POST") {
    const body=await readJson(request); if (!body?.text) return json({error:"text_required"},400);
    return json({result:parseBookingText(body.text)});
  }

  if (url.pathname === "/api/v1/dashboard" && request.method === "GET") {
    const today=localDate(0), tomorrow=localDate(1);
    const [todayRows,tomorrowRows,due,contacts] = await Promise.all([
      queryAll(db, `SELECT * FROM bookings WHERE service_date=? AND status NOT IN ('cancelled','completed') ORDER BY pickup_time,start_time`,[today]),
      queryAll(db, `SELECT * FROM bookings WHERE service_date=? AND status NOT IN ('cancelled','completed') ORDER BY pickup_time,start_time`,[tomorrow]),
      queryAll(db, `SELECT r.*,b.booking_code,b.representative,b.service_date,a.role,c.name AS contact_name,c.zalo_phone,c.phone FROM reminders r JOIN bookings b ON b.id=r.booking_id LEFT JOIN assignments a ON a.id=r.assignment_id LEFT JOIN contacts c ON c.id=a.contact_id WHERE r.status='open' AND datetime(r.due_at)<=datetime('now','+36 hours') ORDER BY r.due_at LIMIT 100`),
      queryAll(db, `SELECT kind,COUNT(*) AS count FROM contacts WHERE active=1 GROUP BY kind`)
    ]);
    return json({today,tomorrow,today_bookings:todayRows,tomorrow_bookings:tomorrowRows,due_reminders:due,contact_counts:contacts});
  }

  if (url.pathname === "/api/v1/contacts" && request.method === "GET") {
    const kind=url.searchParams.get("kind");
    const rows=kind ? await queryAll(db,`SELECT * FROM contacts WHERE active=1 AND kind=? ORDER BY name`,[kind]) : await queryAll(db,`SELECT * FROM contacts WHERE active=1 ORDER BY kind,name`);
    return json({results:rows});
  }
  if (url.pathname === "/api/v1/contacts" && request.method === "POST") {
    const b=await readJson(request); if (!b?.name || !b?.kind) return json({error:"name_and_kind_required"},400);
    const contactId=id("ct");
    await db.prepare(`INSERT INTO contacts(id,kind,name,phone,zalo_phone,whatsapp,company,can_collect_cash,notes) VALUES(?,?,?,?,?,?,?,?,?)`)
      .bind(contactId,b.kind,b.name,b.phone||null,b.zalo_phone||b.phone||null,b.whatsapp||null,b.company||null,b.can_collect_cash?1:0,b.notes||null).run();
    return json({id:contactId},201);
  }

  if (url.pathname === "/api/v1/bookings" && request.method === "GET") {
    const q=String(url.searchParams.get("q")||"").trim();
    const date=String(url.searchParams.get("date")||"").trim();
    let sql=`SELECT * FROM bookings WHERE 1=1`; const binds=[];
    if (date) { sql += ` AND service_date=?`; binds.push(date); }
    if (q) { sql += ` AND (booking_code LIKE ? OR representative LIKE ? OR phone LIKE ? OR pickup_location LIKE ? OR tour_type LIKE ?)`; const like=`%${q}%`; binds.push(like,like,like,like,like); }
    sql += ` ORDER BY service_date DESC, pickup_time DESC, created_at DESC LIMIT 200`;
    return json({results:await queryAll(db,sql,binds)});
  }
  if (url.pathname === "/api/v1/bookings" && request.method === "POST") {
    const b=await readJson(request); if (!b?.service_date) return json({error:"service_date_required"},400);
    const bookingId=id("bk"), code=bookingCode();
    await db.prepare(`INSERT INTO bookings(
      id,booking_code,status,service_date,tour_type,guests,representative,phone,telegram,whatsapp,nationality,start_time,end_time,pickup_time,pickup_location,total_amount,currency,payment_method,payment_status,inclusions,notes,source_text,weather_status,owner_name
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'due',?,?,?,?,?)`).bind(
      bookingId,code,b.status||"inquiry",b.service_date,b.tour_type||null,b.guests||null,b.representative||null,b.phone||null,b.telegram||null,b.whatsapp||null,b.nationality||null,b.start_time||null,b.end_time||null,b.pickup_time||null,b.pickup_location||null,b.total_amount||null,b.currency||"VND",b.payment_method||"unknown",b.inclusions||null,b.notes||null,b.source_text||null,b.weather_status||"unknown",b.owner_name||null
    ).run();
    await event(db,bookingId,"booking_created",`Created ${code}`,{source:"fishing_desk"});
    return json({id:bookingId,booking_code:code},201);
  }

  const detailMatch=url.pathname.match(/^\/api\/v1\/bookings\/([^/]+)$/);
  if (detailMatch && request.method === "GET") {
    const result=await loadBooking(db,detailMatch[1]); return result ? json(result) : json({error:"not_found"},404);
  }
  if (detailMatch && request.method === "PATCH") {
    const body=await readJson(request); if (!body) return json({error:"invalid_json"},400);
    const entries=Object.entries(body).filter(([k])=>ALLOWED_BOOKING_FIELDS.has(k));
    if (!entries.length) return json({error:"no_allowed_fields"},400);
    const set=entries.map(([k])=>`${k}=?`).join(","); const vals=entries.map(([,v])=>v ?? null);
    await db.prepare(`UPDATE bookings SET ${set},updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(...vals,detailMatch[1]).run();
    await event(db,detailMatch[1],"booking_updated",`Updated: ${entries.map(([k])=>k).join(", ")}`);
    return json(await loadBooking(db,detailMatch[1]));
  }

  const assignMatch=url.pathname.match(/^\/api\/v1\/bookings\/([^/]+)\/assignments$/);
  if (assignMatch && request.method === "POST") {
    const body=await readJson(request); if (!body?.role || !body?.contact_id) return json({error:"role_and_contact_required"},400);
    try { const assignmentId=await upsertAssignment(db,assignMatch[1],body.role,body.contact_id); return json({id:assignmentId},201); }
    catch(e) { return json({error:e.message},400); }
  }

  const customerMsgMatch=url.pathname.match(/^\/api\/v1\/bookings\/([^/]+)\/customer-message$/);
  if (customerMsgMatch && request.method === "GET") {
    const b=await queryOne(db,`SELECT * FROM bookings WHERE id=?`,[customerMsgMatch[1]]); return b ? json({message:customerConfirmation(b)}) : json({error:"not_found"},404);
  }

  const sentMatch=url.pathname.match(/^\/api\/v1\/reminders\/([^/]+)\/sent$/);
  if (sentMatch && request.method === "POST") {
    const reminder=await queryOne(db,`SELECT * FROM reminders WHERE id=?`,[sentMatch[1]]); if (!reminder) return json({error:"not_found"},404);
    await db.prepare(`UPDATE reminders SET status='sent',sent_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(sentMatch[1]).run();
    if (reminder.assignment_id) await db.prepare(`UPDATE assignments SET status='notified',last_notified_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(reminder.assignment_id).run();
    await event(db,reminder.booking_id,"reminder_sent","Marked Zalo reminder as sent",{reminder_id:sentMatch[1]});
    return json({ok:true});
  }

  return json({error:"not_found"},404);
}

async function authRoute(request, env) {
  const url=new URL(request.url);
  if (url.pathname === "/login" && request.method === "GET") return html(loginPage("",authConfigured(env)), authConfigured(env)?200:503);
  if (url.pathname === "/auth/login" && request.method === "POST") {
    if (!authConfigured(env)) return html(loginPage("Auth chưa cấu hình.",false),503);
    if (!sameOrigin(request)) return html(loginPage("Request origin rejected."),403);
    const form=await request.formData();
    if (String(form.get("username")||"") !== env.ADMIN_USER || String(form.get("password")||"") !== env.ADMIN_PASSWORD) return html(loginPage("Sai tài khoản hoặc mật khẩu."),401);
    const session=await createSession(env); return redirect("/",{"set-cookie":sessionCookie(session)});
  }
  if (url.pathname === "/auth/logout" && request.method === "POST") return redirect("/login",{"set-cookie":clearSessionCookie()});
  return null;
}

export default {
  async fetch(request, env) {
    const url=new URL(request.url);
    const auth=await authRoute(request,env); if (auth) return auth;
    if (!authConfigured(env)) return url.pathname.startsWith("/api/") ? json({error:"auth_not_configured"},503) : html(loginPage("",false),503);
    if (!await validSession(request,env)) return url.pathname.startsWith("/api/") ? json({error:"authentication_required"},401) : redirect("/login");
    if (url.pathname.startsWith("/api/")) return api(request,env);
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Fishing Desk");
  }
};
