# Phu Quoc Fishing Tours - Fishing Desk

Internal booking, dispatch, partner/driver reminder and payment-custody desk for JoTrip / Phu Quoc Fishing Tours.

This repository does **not** replace the public `phuquocfishingtours.com` sales/chat flow. V1 starts only after staff decides a lead should be recorded.

## V1 workflow

1. Paste the agreed booking text into **Tạo booking**.
2. Deterministic parser pre-fills known fields. Staff reviews/corrects before saving.
3. Save partner/driver contacts once, including Zalo phone and whether they may collect cash.
4. Assign boat partner / outbound driver / return driver / cash collector to a booking.
5. The system creates a D-1 Zalo reminder message for each assignment.
6. Staff copies the prepared message to Zalo and marks **Đã gửi**.
7. Dashboard shows tomorrow's operations and reminders that are still open.
8. Every assignment/message/update is written to booking history.

## Locked principles

- External partners and drivers do not need an account or app.
- Zalo remains the real communication channel in V1.
- `sent` is not the same as `confirmed`; future ZBS automation can extend this without changing the booking model.
- Partner cash collection is not the same as settlement to JoTrip.
- A driver/partner change creates a new assignment/history record instead of erasing the old one.
- Customer and partner PII belongs in D1, never in the public repository.
- Production fails closed until internal authentication secrets are configured.

## Stack

- Cloudflare Worker
- Cloudflare D1
- Cloudflare Static Assets
- Vanilla JS internal UI

## Required secrets

```bash
wrangler secret put ADMIN_USER
wrangler secret put ADMIN_PASSWORD
wrangler secret put SESSION_SECRET
```

`SESSION_SECRET` should be a long random value.

## D1 bootstrap

Create a database and replace `REPLACE_AFTER_D1_CREATE` in `wrangler.jsonc`:

```bash
wrangler d1 create phuquocfishingtours-booking
wrangler d1 migrations apply phuquocfishingtours-booking --remote
```

## Local verification

```bash
npm install
npm run build
```

## Next phases

- Zalo ZBS/OpenAPI automatic D-1 delivery after OA/API economics are justified.
- Weather Engine decision snapshot per sea booking.
- Customer live trip link with safe public fields only.
- Calendar/dispatch views and CSV export.
- JoTrip Ops integration later, without replacing this operational workflow.
