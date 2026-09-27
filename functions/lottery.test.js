"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {calculateLottery, configuredHour, targetDateKey, tokyoDayBounds} = require("./lottery");

test("reads numeric and HH:MM configured hours", () => {
  assert.equal(configuredHour(9), 9);
  assert.equal(configuredHour("18:00"), 18);
});

test("calculates the target date in Japan time", () => {
  assert.equal(targetDateKey(new Date("2026-09-27T14:30:00Z"), 2), "2026-09-29");
  const bounds = tokyoDayBounds("2026-09-30");
  assert.equal(bounds.start.toISOString(), "2026-09-29T15:00:00.000Z");
  assert.equal(bounds.end.toISOString(), "2026-09-30T15:00:00.000Z");
});

test("allocates one confirmed slot per band and respects locked time", () => {
  const at = (hour, minute = 0) => new Date(`2026-09-30T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+09:00`);
  const bookings = [
    {id: "event", type: "event", status: "confirmed", startTime: at(9), endTime: at(10)},
    {id: "a1", bandId: "a", bandName: "A", type: "normal", status: "pending", startTime: at(9), endTime: at(12)},
    {id: "a2", bandId: "a", bandName: "A", type: "normal", status: "pending", startTime: at(13), endTime: at(15)},
    {id: "b1", bandId: "b", bandName: "B", type: "normal", status: "pending", startTime: at(10), endTime: at(12)},
  ];
  const result = calculateLottery(bookings, () => 0.5);
  assert.equal(result.assignments.length, 2);
  assert.equal(new Set(result.assignments.map((item) => item.bandId)).size, 2);
  assert.ok(result.assignments.every((item) => item.start >= at(10)));
  assert.deepEqual(result.assignments.find((item) => item.bandId === "a").originalDocIds, ["a1", "a2"]);
});
