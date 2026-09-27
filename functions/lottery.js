"use strict";

const START_HOUR = 9;
const END_HOUR = 20;
const SLOT_MINUTES = 30;

function tokyoDateParts(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
}

function minutesInTokyo(date) {
  const parts = tokyoDateParts(date);
  return (parts.hour - START_HOUR) * 60 + parts.minute;
}

function atTokyoMinutes(date, minutesFromStart) {
  const parts = tokyoDateParts(date);
  const hour = START_HOUR + Math.floor(minutesFromStart / 60);
  const minute = minutesFromStart % 60;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, hour - 9, minute));
}

function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function tryAllocate(bands, duration, lockedItems, random = Math.random) {
  const totalMinutes = (END_HOUR - START_HOUR) * 60;
  const slotCount = totalMinutes / SLOT_MINUTES;
  const timeline = new Array(slotCount).fill(null);

  for (const locked of lockedItems || []) {
    const startMinutes = minutesInTokyo(locked.start);
    const endMinutes = minutesInTokyo(locked.end);
    const firstSlot = Math.floor(Math.max(0, startMinutes) / SLOT_MINUTES);
    const lastSlot = Math.ceil(Math.min(totalMinutes, endMinutes) / SLOT_MINUTES);
    for (let i = firstSlot; i < lastSlot; i += 1) {
      if (i >= 0 && i < slotCount) timeline[i] = "LOCKED";
    }
  }

  const assignments = [];
  const failedBands = [];
  const neededSlots = Math.ceil(duration / SLOT_MINUTES);

  for (const band of shuffle(bands, random)) {
    let assigned = false;
    for (const request of shuffle(band.requests, random)) {
      const requestStart = minutesInTokyo(request.start);
      const requestEnd = minutesInTokyo(request.end);
      const firstSlot = Math.max(0, Math.floor(requestStart / SLOT_MINUTES));
      const lastSlot = Math.min(slotCount, Math.floor(requestEnd / SLOT_MINUTES));

      for (let slot = firstSlot; slot <= lastSlot - neededSlots; slot += 1) {
        const free = Array.from({length: neededSlots}, (_, offset) => timeline[slot + offset] === null)
            .every(Boolean);
        if (!free) continue;

        for (let offset = 0; offset < neededSlots; offset += 1) timeline[slot + offset] = band.name;
        const start = atTokyoMinutes(request.start, slot * SLOT_MINUTES);
        const end = new Date(start);
        end.setMinutes(end.getMinutes() + duration);
        assignments.push({
          bandId: band.id,
          bandName: band.name,
          start,
          end,
          originalDocIds: band.docIds,
        });
        assigned = true;
        break;
      }
      if (assigned) break;
    }
    if (!assigned) failedBands.push(band);
  }

  return {duration, assignments, failedBands};
}

function calculateLottery(bookings, random = Math.random) {
  const candidates = [];
  const locked = [];
  for (const booking of bookings) {
    if (booking.status === "pending" && booking.type !== "event") {
      candidates.push(booking);
    } else if (booking.status === "confirmed" || booking.type === "event") {
      locked.push({start: booking.startTime, end: booking.endTime});
    }
  }

  const grouped = new Map();
  for (const candidate of candidates) {
    if (!grouped.has(candidate.bandId)) {
      grouped.set(candidate.bandId, {
        id: candidate.bandId,
        name: candidate.bandName,
        requests: [],
        docIds: [],
      });
    }
    const band = grouped.get(candidate.bandId);
    band.requests.push({start: candidate.startTime, end: candidate.endTime});
    band.docIds.push(candidate.id);
  }

  const bands = [...grouped.values()];
  let result = tryAllocate(bands, 60, locked, random);
  if (result.failedBands.length > 0) result = tryAllocate(bands, 30, locked, random);
  return {
    ...result,
    candidateCount: candidates.length,
    candidateDocIds: candidates.map((candidate) => candidate.id),
    bandCount: bands.length,
  };
}

function configuredTime(value) {
  const [rawHour, rawMinute = "0"] = String(value ?? "0:00").split(":");
  const hour = Number.parseInt(rawHour, 10);
  const minute = Number.parseInt(rawMinute, 10);
  return {
    hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 0,
    minute: Number.isInteger(minute) && minute >= 0 && minute <= 59 ? minute : 0,
  };
}

function configuredTimeMatches(value, dateParts) {
  const configured = configuredTime(value);
  return dateParts.hour === configured.hour && dateParts.minute === configured.minute;
}

function targetDateKey(now, daysBefore) {
  const current = tokyoDateParts(now);
  const target = new Date(Date.UTC(current.year, current.month - 1, current.day + daysBefore));
  return target.toISOString().slice(0, 10);
}

function tokyoDayBounds(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day) - 9 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {start, end};
}

module.exports = {calculateLottery, configuredTime, configuredTimeMatches, targetDateKey, tokyoDateParts, tokyoDayBounds, tryAllocate};
