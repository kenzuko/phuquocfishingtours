PRAGMA foreign_keys = ON;

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

-- Shared calendar seed and public tracking aliases, 2026-10-03.
