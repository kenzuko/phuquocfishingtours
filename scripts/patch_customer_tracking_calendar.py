from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"marker missing: {label}")
    return text.replace(old, new, 1)


# Booking Desk worker: root customer links, guest ranges, public progress status.
worker_path = Path("worker.js")
worker = worker_path.read_text(encoding="utf-8")
worker = replace_once(
    worker,
    '  "status","service_date","tour_type","guests","representative","phone","telegram","whatsapp","nationality",',
    '  "status","service_date","tour_type","guests","guest_label","representative","phone","telegram","whatsapp","nationality",',
    "allowed guest label",
)
worker = replace_once(
    worker,
    '  return publicToken ? `${new URL(request.url).origin}/trip/${publicToken}` : null;',
    '  return publicToken ? `${new URL(request.url).origin}/${publicToken}` : null;',
    "root public trip url",
)
worker = replace_once(
    worker,
    '    SELECT id,booking_code,status,service_date,tour_type,guests,representative,start_time,end_time,pickup_time,pickup_location,',
    '    SELECT id,booking_code,status,service_date,tour_type,guests,guest_label,representative,start_time,end_time,pickup_time,pickup_location,',
    "public guest label select",
)
worker = replace_once(
    worker,
    '    guests: booking.guests,\n    representative: booking.representative,',
    '    guests: booking.guests,\n    guest_label: booking.guest_label,\n    representative: booking.representative,',
    "public guest label response",
)
worker = replace_once(
    worker,
    '      "id","booking_code","status","service_date","tour_type","guests","representative","phone","telegram","whatsapp","nationality",',
    '      "id","booking_code","status","service_date","tour_type","guests","guest_label","representative","phone","telegram","whatsapp","nationality",',
    "create booking guest label column",
)
worker = replace_once(
    worker,
    '      bookingId,code,b.status||"inquiry",b.service_date,b.tour_type||null,b.guests||null,b.representative||null,b.phone||null,b.telegram||null,b.whatsapp||null,b.nationality||null,',
    '      bookingId,code,b.status||"inquiry",b.service_date,b.tour_type||null,b.guests||null,b.guest_label||null,b.representative||null,b.phone||null,b.telegram||null,b.whatsapp||null,b.nationality||null,',
    "create booking guest label value",
)
worker = replace_once(
    worker,
    '    if (/^\\/trip\\/[A-Za-z0-9_-]{16,80}$/.test(url.pathname)) {',
    '    if (/^\\/(?:trip\\/)?[A-Za-z0-9_-]{16,80}$/.test(url.pathname)) {',
    "root tracking route",
)
worker_path.write_text(worker, encoding="utf-8")

# Customer tracking page: explicit booking status + range-friendly guest display.
trip_js_path = Path("public/trip.js")
trip_js = trip_js_path.read_text(encoding="utf-8")
trip_js = replace_once(
    trip_js,
    'function money(v,c){\n  if(!v)return "To be settled";\n  return new Intl.NumberFormat(c==="VND"?"vi-VN":"en-US").format(Number(v))+" "+(c||"VND");\n}',
    'function money(v,c){\n  if(!v)return "To be settled";\n  return new Intl.NumberFormat(c==="VND"?"vi-VN":"en-US").format(Number(v))+" "+(c||"VND");\n}\nfunction statusLabel(v){\n  return ({inquiry:"Request received",hold:"On hold",confirmed:"Booking confirmed",ready:"Ready for pickup",running:"Trip in progress",completed:"Trip completed",cancelled:"Trip cancelled"})[v]||"Booking updated";\n}',
    "public status label",
)
trip_js = replace_once(
    trip_js,
    '    $("#hero-tour").textContent=t.tour_type||"Private Fishing Tour";',
    '    $("#hero-tour").textContent=t.tour_type||"Private Fishing Tour";\n    $("#booking-status").textContent=statusLabel(t.status);\n    $("#booking-status").dataset.status=t.status||"unknown";',
    "public status fill",
)
trip_js = replace_once(
    trip_js,
    '    $("#guest-count").textContent=t.guests||"-";',
    '    $("#guest-count").textContent=t.guest_label||t.guests||"-";',
    "public guest label fill",
)
trip_js_path.write_text(trip_js, encoding="utf-8")

trip_html_path = Path("public/trip.html")
trip_html = trip_html_path.read_text(encoding="utf-8")
trip_html = replace_once(
    trip_html,
    '        <strong id="hero-tour">Private Fishing Tour</strong>',
    '        <div class="hero-badges"><strong id="hero-tour">Private Fishing Tour</strong><span id="booking-status" class="booking-status">Booking confirmed</span></div>',
    "public status badge",
)
trip_html_path.write_text(trip_html, encoding="utf-8")

trip_css_path = Path("public/trip.css")
trip_css = trip_css_path.read_text(encoding="utf-8")
if ".booking-status{" not in trip_css:
    trip_css += '\n.hero-badges{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.booking-status{display:inline-flex;align-items:center;padding:8px 12px;border-radius:999px;font-size:11px;font-weight:850;background:rgba(255,255,255,.92);color:#294334;backdrop-filter:blur(8px)}.booking-status[data-status="ready"],.booking-status[data-status="running"],.booking-status[data-status="completed"]{background:#e7f4e1;color:#376c2a}.booking-status[data-status="hold"],.booking-status[data-status="inquiry"]{background:#fff3c7;color:#765400}.booking-status[data-status="cancelled"]{background:#ffe3df;color:#963c35}\n'
trip_css_path.write_text(trip_css, encoding="utf-8")

# Private desk: display the range label anywhere the party size is summarized.
app_path = Path("public/app.js")
app = app_path.read_text(encoding="utf-8")
app = app.replace("${esc(b.guests?b.guests+' khách':'')}", "${esc((b.guest_label||b.guests)?(b.guest_label||b.guests)+' khách':'')}")
app = app.replace("${esc(b.guests||'-')} khách", "${esc(b.guest_label||b.guests||'-')} khách")
app_path.write_text(app, encoding="utf-8")

# Partner portal: keep exact guest range visible in the operating calendar.
fishing_worker_path = Path("fishing-worker.js")
fishing_worker = fishing_worker_path.read_text(encoding="utf-8")
fishing_worker = replace_once(
    fishing_worker,
    'b.service_date,b.tour_type,b.guests,b.representative',
    'b.service_date,b.tour_type,b.guests,b.guest_label,b.representative',
    "partner schedule guest label",
)
fishing_worker_path.write_text(fishing_worker, encoding="utf-8")

fishing_app_path = Path("fishing-public/fishing/app.js")
fishing_app = fishing_app_path.read_text(encoding="utf-8")
fishing_app = fishing_app.replace('${esc(row.guests||"?")} khách', '${esc(row.guest_label||row.guests||"?")} khách')
fishing_app_path.write_text(fishing_app, encoding="utf-8")

# D1 migration: guest range label + four confirmed tours + stable customer tracking links.
migration = Path("db/migrations/0004-calendar-customer-tracking.sql")
if not migration.exists():
    migration.write_text(r'''PRAGMA foreign_keys = ON;

ALTER TABLE bookings ADD COLUMN guest_label TEXT;

-- 04/10/2026 morning - Ken, 2 adults, Russia, supplied phone.
UPDATE bookings
SET status='confirmed',
    tour_type=COALESCE(NULLIF(tour_type,''),'Big Fishing'),
    guests=2,
    guest_label='2',
    phone=COALESCE(NULLIF(phone,''),'+7 906 214-20-90'),
    nationality=COALESCE(NULLIF(nationality,''),'Russia'),
    start_time='05:00', end_time='14:00',
    public_token='k4n7m2q9x8v3r6p5', public_link_enabled=1,
    public_link_created_at=COALESCE(public_link_created_at,CURRENT_TIMESTAMP), public_link_revoked_at=NULL,
    updated_at=CURRENT_TIMESTAMP
WHERE id=(SELECT id FROM bookings WHERE service_date='2026-10-04' AND lower(representative)='ken' AND status!='cancelled' ORDER BY updated_at DESC LIMIT 1);

INSERT INTO bookings(id,booking_code,status,service_date,tour_type,guests,guest_label,representative,phone,nationality,start_time,end_time,source_text,weather_status,owner_name,public_token,public_link_enabled,public_link_created_at)
SELECT 'bk_seed_20261004_ken','FISH-20261004-KEN01','confirmed','2026-10-04','Big Fishing',2,'2','Ken','+7 906 214-20-90','Russia','05:00','14:00','04/10/2026 Sáng - Ken (2NL) / Nga / +7 906 214-20-90','unknown','JoTrip','k4n7m2q9x8v3r6p5',1,CURRENT_TIMESTAMP
WHERE NOT EXISTS(SELECT 1 FROM bookings WHERE service_date='2026-10-04' AND lower(representative)='ken' AND status!='cancelled');

-- 05/10/2026 morning - Phong, preserve richer booking details if already present.
UPDATE bookings
SET status='confirmed',
    tour_type=COALESCE(NULLIF(tour_type,''),'Big Fishing'),
    guests=3,
    guest_label='3',
    start_time='05:00', end_time='14:00',
    public_token='p5h8q2m7x4v9n6r3', public_link_enabled=1,
    public_link_created_at=COALESCE(public_link_created_at,CURRENT_TIMESTAMP), public_link_revoked_at=NULL,
    updated_at=CURRENT_TIMESTAMP
WHERE id=(SELECT id FROM bookings WHERE service_date='2026-10-05' AND lower(representative)='phong' AND status!='cancelled' ORDER BY updated_at DESC LIMIT 1);

INSERT INTO bookings(id,booking_code,status,service_date,tour_type,guests,guest_label,representative,start_time,end_time,source_text,weather_status,owner_name,public_token,public_link_enabled,public_link_created_at)
SELECT 'bk_seed_20261005_phong','FISH-20261005-PHG01','confirmed','2026-10-05','Big Fishing',3,'3','Phong','05:00','14:00','05/10/2026 Sáng - Phong (3NL)','unknown','JoTrip','p5h8q2m7x4v9n6r3',1,CURRENT_TIMESTAMP
WHERE NOT EXISTS(SELECT 1 FROM bookings WHERE service_date='2026-10-05' AND lower(representative)='phong' AND status!='cancelled');

-- 14/01/2027 morning - Ken, flexible party size 2-4 adults.
UPDATE bookings
SET status='confirmed',
    tour_type=COALESCE(NULLIF(tour_type,''),'Big Fishing'),
    guests=COALESCE(guests,2),
    guest_label='2-4',
    start_time='05:00', end_time='14:00',
    notes=COALESCE(notes,'Số khách dự kiến: 2-4 NL.'),
    public_token='j1k6m9q3x7v4n8r2', public_link_enabled=1,
    public_link_created_at=COALESCE(public_link_created_at,CURRENT_TIMESTAMP), public_link_revoked_at=NULL,
    updated_at=CURRENT_TIMESTAMP
WHERE id=(SELECT id FROM bookings WHERE service_date='2027-01-14' AND lower(representative)='ken' AND status!='cancelled' ORDER BY updated_at DESC LIMIT 1);

INSERT INTO bookings(id,booking_code,status,service_date,tour_type,guests,guest_label,representative,start_time,end_time,notes,source_text,weather_status,owner_name,public_token,public_link_enabled,public_link_created_at)
SELECT 'bk_seed_20270114_ken','FISH-20270114-KEN01','confirmed','2027-01-14','Big Fishing',2,'2-4','Ken','05:00','14:00','Số khách dự kiến: 2-4 NL.','14/01/2027 Sáng - Ken (2-4NL)','unknown','JoTrip','j1k6m9q3x7v4n8r2',1,CURRENT_TIMESTAMP
WHERE NOT EXISTS(SELECT 1 FROM bookings WHERE service_date='2027-01-14' AND lower(representative)='ken' AND status!='cancelled');

-- 16/01/2027 afternoon - Ken, flexible party size 2-4 adults.
UPDATE bookings
SET status='confirmed',
    tour_type=COALESCE(NULLIF(tour_type,''),'Big Fishing'),
    guests=COALESCE(guests,2),
    guest_label='2-4',
    start_time='14:00', end_time='21:00',
    notes=COALESCE(notes,'Số khách dự kiến: 2-4 NL.'),
    public_token='j6k2m8q4x9v3n7r5', public_link_enabled=1,
    public_link_created_at=COALESCE(public_link_created_at,CURRENT_TIMESTAMP), public_link_revoked_at=NULL,
    updated_at=CURRENT_TIMESTAMP
WHERE id=(SELECT id FROM bookings WHERE service_date='2027-01-16' AND lower(representative)='ken' AND status!='cancelled' ORDER BY updated_at DESC LIMIT 1);

INSERT INTO bookings(id,booking_code,status,service_date,tour_type,guests,guest_label,representative,start_time,end_time,notes,source_text,weather_status,owner_name,public_token,public_link_enabled,public_link_created_at)
SELECT 'bk_seed_20270116_ken','FISH-20270116-KEN01','confirmed','2027-01-16','Big Fishing',2,'2-4','Ken','14:00','21:00','Số khách dự kiến: 2-4 NL.','16/01/2027 Chiều - Ken (2-4NL)','unknown','JoTrip','j6k2m8q4x9v3n7r5',1,CURRENT_TIMESTAMP
WHERE NOT EXISTS(SELECT 1 FROM bookings WHERE service_date='2027-01-16' AND lower(representative)='ken' AND status!='cancelled');
''', encoding="utf-8")

print("Customer tracking/calendar patch applied.")
