import { parseBookingText } from "./core/parser.js";
import { driverMessage, partnerMessage, customerConfirmation } from "./core/messages.js";
import { authConfigured, createSession, validSession, sessionCookie, clearSessionCookie, loginPage } from "./core/auth.js";

const JSON_HEADERS = { "content-type":"application/json; charset=utf-8", "cache-control":"no-store" };
const ALLOWED_BOOKING_FIELDS = new Set([
  "status","service_date","tour_type","guests","guest_label","representative","phone","telegram","whatsapp","nationality",
  "start_time","end_time","pickup_time","pickup_location","total_amount","currency","payment_method","payment_status",
  "cash_collector_contact_id","inclusions","notes","public_notes","weather_status","owner_name"
]);

function json(data, status=200) { return new Response(JSON.stringify(data, null, 2), { status, headers: JSON_HEADERS }); }
function html(body, status=200, headers={}) { return new Response(body, { status, headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store",...headers} }); }
function redirect(location, headers={}) { return new Response(null, { status:303, headers:{location,"cache-control":"no-store",...headers} }); }
function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function token() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  let raw = "";
  for (const b of bytes) raw += String.fromCharCode(b);
  return btoa(raw).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}
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
function tripUrl(request, publicToken) {
  return publicToken ? `${new URL(request.url).origin}/${publicToken}` : null;
}
function publicWeather(status) {
  const map = {
    go: { key:"go", label:"Trip operating normally", detail:"Conditions are currently suitable for the planned trip." },
    hold: { key:"hold", label:"Weather being monitored", detail:"JoTrip is monitoring conditions before departure." },
    modify: { key:"modify", label:"Schedule adjustment may be needed", detail:"We will contact you if the plan needs to change." },
    cancel: { key:"cancel", label:"Please contact JoTrip", detail:"Weather may affect this trip. Our team will update you directly." },
    unknown: { key:"unknown", label:"Weather check scheduled", detail:"A final operating check will be made before your trip." }
  };
  return map[status] || map.unknown;
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
    queryAll(db, `SELECT a.*, c.name AS contact_name,c.phone,c.zalo_phone,c.whatsapp,c.can_collect_cash,c.company,c.vehicle_model,c.vehicle_plate,c.public_notes AS contact_public_notes FROM assignments a JOIN contacts c ON c.id=a.contact_id WHERE a.booking_id=? AND a.status!='cancelled' ORDER BY a.created_at`, [bookingId]),
    queryAll(db, `SELECT * FROM booking_events WHERE booking_id=? ORDER BY occurred_at DESC LIMIT 100`, [bookingId]),
    queryAll(db, `SELECT * FROM reminders WHERE booking_id=? ORDER BY due_at`, [bookingId])
  ]);
  return { ...booking, assignments, events, reminders };
}
async function loadPublicTrip(db, publicToken) {
  const booking = await queryOne(db, `
    SELECT id,booking_code,status,service_date,tour_type,guests,guest_label,representative,start_time,end_time,pickup_time,pickup_location,
           total_amount,currency,payment_method,inclusions,public_notes,weather_status,updated_at
    FROM bookings
    WHERE public_token=? AND public_link_enabled=1 AND public_link_revoked_at IS NULL
  `, [publicToken]);
  if (!booking) return null;
  const assignments = await queryAll(db, `
    SELECT a.role,a.status,c.name,c.phone,c.company,c.vehicle_model,c.vehicle_plate,c.public_notes
    FROM assignments a
    JOIN contacts c ON c.id=a.contact_id
    WHERE a.booking_id=? AND a.status!='cancelled'
  `, [booking.id]);
  const driver = assignments.find(x=>x.role==="driver_outbound") || null;
  const boat = assignments.find(x=>x.role==="boat_partner") || null;
  const isConfirmed = !["inquiry","hold"].includes(booking.status);
  const isReady = ["ready","running","completed"].includes(booking.status);
  return {
    booking_code: booking.booking_code,
    status: booking.status,
    cancelled: booking.status === "cancelled",
    service_date: booking.service_date,
    tour_type: booking.tour_type,
    guests: booking.guests,
    guest_label: booking.guest_label,
    representative: booking.representative,
    start_time: booking.start_time,
    end_time: booking.end_time,
    pickup_time: booking.pickup_time,
    pickup_location: booking.pickup_location,
    total_amount: booking.total_amount,
    currency: booking.currency,
    payment_method: booking.payment_method,
    inclusions: booking.inclusions,
    special_request: booking.public_notes,
    weather: publicWeather(booking.weather_status),
    boat_arranged: Boolean(boat),
    driver: driver ? {
      name: driver.name,
      phone: driver.phone,
      vehicle_model: driver.vehicle_model,
      vehicle_plate: driver.vehicle_plate,
      note: driver.public_notes
    } : null,
    progress: {
      booking_confirmed: isConfirmed,
      boat_arranged: Boolean(boat),
      driver_assigned: Boolean(driver),
      ready_for_pickup: isReady
    },
    updated_at: booking.updated_at
  };
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

async function publicApi(request, env) {
  const url = new URL(request.url);
  const db = env.BOOKING_DB;
  if (!db) return json({error:"database_not_bound"},503);
  const m = url.pathname.match(/^\/api\/public\/trips\/([A-Za-z0-9_-]{16,80})$/);
  if (m && request.method === "GET") {
    const trip = await loadPublicTrip(db, m[1]);
    return trip ? json(trip) : json({error:"trip_not_found"},404);
  }
  return json({error:"not_found"},404);
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
    const bookingSql = `
      SELECT b.*,
        EXISTS(SELECT 1 FROM assignments a WHERE a.booking_id=b.id AND a.role='boat_partner' AND a.status!='cancelled') AS has_boat,
        EXISTS(SELECT 1 FROM assignments a WHERE a.booking_id=b.id AND a.role='driver_outbound' AND a.status!='cancelled') AS has_driver
      FROM bookings b
      WHERE b.service_date=? AND b.status NOT IN ('cancelled','completed')
      ORDER BY b.pickup_time,b.start_time
    `;
    const [todayRows,tomorrowRows,due,contacts,missingDriver,missingBoat,pendingWeather] = await Promise.all([
      queryAll(db, bookingSql,[today]),
      queryAll(db, bookingSql,[tomorrow]),
      queryAll(db, `SELECT r.*,b.booking_code,b.representative,b.service_date,a.role,c.name AS contact_name,c.zalo_phone,c.phone FROM reminders r JOIN bookings b ON b.id=r.booking_id LEFT JOIN assignments a ON a.id=r.assignment_id LEFT JOIN contacts c ON c.id=a.contact_id WHERE r.status='open' AND datetime(r.due_at)<=datetime('now','+36 hours') ORDER BY r.due_at LIMIT 100`),
      queryAll(db, `SELECT kind,COUNT(*) AS count FROM contacts WHERE active=1 GROUP BY kind`),
      queryOne(db, `SELECT COUNT(*) AS count FROM bookings b WHERE b.service_date IN (?,?) AND b.status NOT IN ('cancelled','completed') AND NOT EXISTS(SELECT 1 FROM assignments a WHERE a.booking_id=b.id AND a.role='driver_outbound' AND a.status!='cancelled')`,[today,tomorrow]),
      queryOne(db, `SELECT COUNT(*) AS count FROM bookings b WHERE b.service_date IN (?,?) AND b.status NOT IN ('cancelled','completed') AND NOT EXISTS(SELECT 1 FROM assignments a WHERE a.booking_id=b.id AND a.role='boat_partner' AND a.status!='cancelled')`,[today,tomorrow]),
      queryOne(db, `SELECT COUNT(*) AS count FROM bookings b WHERE b.service_date IN (?,?) AND b.status NOT IN ('cancelled','completed') AND b.weather_status IN ('unknown','hold','modify')`,[today,tomorrow])
    ]);
    return json({
      today,tomorrow,today_bookings:todayRows,tomorrow_bookings:tomorrowRows,due_reminders:due,contact_counts:contacts,
      missing_driver:Number(missingDriver?.count||0),missing_boat:Number(missingBoat?.count||0),pending_weather:Number(pendingWeather?.count||0)
    });
  }

  if (url.pathname === "/api/v1/contacts" && request.method === "GET") {
    const kind=url.searchParams.get("kind");
    const rows=kind ? await queryAll(db,`SELECT * FROM contacts WHERE active=1 AND kind=? ORDER BY name`,[kind]) : await queryAll(db,`SELECT * FROM contacts WHERE active=1 ORDER BY kind,name`);
    return json({results:rows});
  }
  if (url.pathname === "/api/v1/contacts" && request.method === "POST") {
    const b=await readJson(request); if (!b?.name || !b?.kind) return json({error:"name_and_kind_required"},400);
    const contactId=id("ct");
    await db.prepare(`INSERT INTO contacts(id,kind,name,phone,zalo_phone,whatsapp,company,can_collect_cash,notes,vehicle_model,vehicle_plate,public_notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(contactId,b.kind,b.name,b.phone||null,b.zalo_phone||b.phone||null,b.whatsapp||null,b.company||null,b.can_collect_cash?1:0,b.notes||null,b.vehicle_model||null,b.vehicle_plate||null,b.public_notes||null).run();
    return json({id:contactId},201);
  }

  if (url.pathname === "/api/v1/bookings" && request.method === "GET") {
    const q=String(url.searchParams.get("q")||"").trim();
    const date=String(url.searchParams.get("date")||"").trim();
    let sql=`SELECT * FROM bookings WHERE 1=1`; const binds=[];
    if (date) { sql += ` AND service_date=?`; binds.push(date); }
    if (q) { sql += ` AND (booking_code LIKE ? OR representative LIKE ? OR phone LIKE ? OR pickup_location LIKE ? OR tour_type LIKE ?)`; const like=`%${q}%`; binds.push(like,like,like,like,like); }
    sql += ` ORDER BY service_date DESC, pickup_time DESC, created_at DESC LIMIT 200`;
    const rows=await queryAll(db,sql,binds);
    return json({results:rows.map(x=>({...x,customer_trip_url:tripUrl(request,x.public_token)}))});
  }
  if (url.pathname === "/api/v1/bookings" && request.method === "POST") {
    const b=await readJson(request); if (!b?.service_date) return json({error:"service_date_required"},400);
    const bookingId=id("bk"), code=bookingCode(), publicToken=token();
    const columns=[
      "id","booking_code","status","service_date","tour_type","guests","guest_label","representative","phone","telegram","whatsapp","nationality",
      "start_time","end_time","pickup_time","pickup_location","total_amount","currency","payment_method","payment_status",
      "inclusions","notes","public_notes","source_text","weather_status","owner_name","public_token","public_link_enabled","public_link_created_at"
    ];
    const values=[
      bookingId,code,b.status||"inquiry",b.service_date,b.tour_type||null,b.guests||null,b.guest_label||null,b.representative||null,b.phone||null,b.telegram||null,b.whatsapp||null,b.nationality||null,
      b.start_time||null,b.end_time||null,b.pickup_time||null,b.pickup_location||null,b.total_amount||null,b.currency||"VND",b.payment_method||"unknown","due",
      b.inclusions||null,b.notes||null,b.public_notes||null,b.source_text||null,b.weather_status||"unknown",b.owner_name||null,publicToken,1,new Date().toISOString()
    ];
    await db.prepare(`INSERT INTO bookings(${columns.join(",")}) VALUES(${columns.map(()=>"?").join(",")})`).bind(...values).run();
    await event(db,bookingId,"booking_created",`Created ${code}`,{source:"fishing_desk"});
    await event(db,bookingId,"public_link_created","Customer trip link created");
    return json({id:bookingId,booking_code:code,customer_trip_url:tripUrl(request,publicToken)},201);
  }

  const detailMatch=url.pathname.match(/^\/api\/v1\/bookings\/([^/]+)$/);
  if (detailMatch && request.method === "GET") {
    const result=await loadBooking(db,detailMatch[1]);
    return result ? json({...result,customer_trip_url:result.public_link_enabled ? tripUrl(request,result.public_token) : null}) : json({error:"not_found"},404);
  }
  if (detailMatch && request.method === "PATCH") {
    const body=await readJson(request); if (!body) return json({error:"invalid_json"},400);
    const entries=Object.entries(body).filter(([k])=>ALLOWED_BOOKING_FIELDS.has(k));
    if (!entries.length) return json({error:"no_allowed_fields"},400);
    const set=entries.map(([k])=>`${k}=?`).join(","); const vals=entries.map(([,v])=>v ?? null);
    await db.prepare(`UPDATE bookings SET ${set},updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(...vals,detailMatch[1]).run();
    await event(db,detailMatch[1],"booking_updated",`Updated: ${entries.map(([k])=>k).join(", ")}`);
    const result=await loadBooking(db,detailMatch[1]);
    return json({...result,customer_trip_url:result?.public_link_enabled ? tripUrl(request,result.public_token) : null});
  }

  const linkMatch=url.pathname.match(/^\/api\/v1\/bookings\/([^/]+)\/public-link\/regenerate$/);
  if (linkMatch && request.method === "POST") {
    const existing=await queryOne(db,`SELECT id FROM bookings WHERE id=?`,[linkMatch[1]]);
    if (!existing) return json({error:"not_found"},404);
    const publicToken=token();
    await db.prepare(`UPDATE bookings SET public_token=?,public_link_enabled=1,public_link_created_at=CURRENT_TIMESTAMP,public_link_revoked_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(publicToken,linkMatch[1]).run();
    await event(db,linkMatch[1],"public_link_regenerated","Customer trip link regenerated");
    return json({customer_trip_url:tripUrl(request,publicToken)});
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

function isPublicStatic(pathname) {
  return pathname === "/trip.js" || pathname === "/trip.css" || pathname.startsWith("/assets/");
}

export default {
  async fetch(request, env) {
    const url=new URL(request.url);

    if (url.pathname.startsWith("/api/public/")) return publicApi(request,env);

    if (/^\/(?:trip\/)?[A-Za-z0-9_-]{16,80}$/.test(url.pathname)) {
      if (!env.ASSETS) return new Response("Trip page unavailable",{status:503});
      const tripPage = new URL("/trip.html",request.url);
      return env.ASSETS.fetch(new Request(tripPage,request));
    }

    if (isPublicStatic(url.pathname) && env.ASSETS) return env.ASSETS.fetch(request);

    const auth=await authRoute(request,env); if (auth) return auth;
    if (!authConfigured(env)) return url.pathname.startsWith("/api/") ? json({error:"auth_not_configured"},503) : html(loginPage("",false),503);
    if (!await validSession(request,env)) return url.pathname.startsWith("/api/") ? json({error:"authentication_required"},401) : redirect("/login");
    if (url.pathname.startsWith("/api/")) return api(request,env);
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Fishing Desk");
  }
};
