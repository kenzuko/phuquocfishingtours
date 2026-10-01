import test from "node:test";
import assert from "node:assert/strict";
import { parseBookingText } from "../core/parser.js";
import { driverMessage, partnerMessage } from "../core/messages.js";

const sample = `Tour Confirmation:\n- Type: Big game fishing tour (private)\n- Number of guests: 02\n- Representative: Dmitry Safonov (+79062142090; contact via Telegram: @safongarcon) (Russia)\n- Time: 05:00 – 14:00, Sunday, October 4, 2026\n- Pick-up: 04:45 at Premier Residences Phu Quoc Emerald Bay (Khem Beach, Phu Quoc)\n- Total cost: 9,600,000 VND (cash)\n- Inclusions: Private round-trip transfers, private fishing boat, fishing rods, bait, local captain, and a meal.\n- Note: Guests wish to both swim and sunbathe; arrangements will be made accordingly.`;

test("parses labelled tour confirmation", () => {
  const p = parseBookingText(sample);
  assert.equal(p.guests, 2);
  assert.equal(p.representative, "Dmitry Safonov");
  assert.equal(p.phone, "+79062142090");
  assert.equal(p.telegram, "@safongarcon");
  assert.equal(p.service_date, "2026-10-04");
  assert.equal(p.start_time, "05:00");
  assert.equal(p.end_time, "14:00");
  assert.equal(p.pickup_time, "04:45");
  assert.equal(p.total_amount, 9600000);
  assert.equal(p.payment_method, "cash");
});

test("generates driver message", () => {
  const p = parseBookingText(sample);
  const msg = driverMessage(p);
  assert.match(msg, /04:45/);
  assert.match(msg, /Premier Residences/);
});

test("partner message can include cash collection", () => {
  const p = parseBookingText(sample);
  const msg = partnerMessage(p, { collectCash: true });
  assert.match(msg, /9\.600\.000 VND/);
  assert.match(msg, /Thu hộ khách/);
});
