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

function bookingCountForBand(bandId, bookingCounts = {}) {
  const value = bookingCounts instanceof Map ? bookingCounts.get(bandId) : bookingCounts[bandId];
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

function rankByBookingCount(items, bookingCounts, random = Math.random) {
  return shuffle(items, random).sort((left, right) =>
    bookingCountForBand(left.band.id, bookingCounts) - bookingCountForBand(right.band.id, bookingCounts));
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
          creatorId: request.creatorId || "",
          userName: request.userName || "",
          isCustomBand: request.isCustomBand === true,
          requestDocId: request.id || "",
          requestedAt: request.createdAt || null,
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

function calculateLottery(bookings, random = Math.random, options = {}) {
  if (typeof random !== "function") {
    options = random || {};
    random = Math.random;
  }
  const bandBookingCounts = options.bandBookingCounts || {};
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
    band.requests.push({
      id: candidate.id,
      start: candidate.startTime,
      end: candidate.endTime,
      creatorId: candidate.creatorId,
      userName: candidate.userName,
      isCustomBand: candidate.isCustomBand === true,
      createdAt: candidate.createdAt || null,
    });
    band.docIds.push(candidate.id);
  }

  const bands = [...grouped.values()];
  // 1時間を超える希望範囲は、従来どおり空いている1時間を探す。
  // ぴったり1時間の希望だけを、同一枠の競合ルールで処理する。
  const flexibleBands = bands.filter((band) => band.requests.some((request) =>
    minutesInTokyo(request.end) - minutesInTokyo(request.start) > 60));
  const flexibleHourResult = tryAllocate(flexibleBands, 60, locked, random);
  const totalMinutes = (END_HOUR - START_HOUR) * 60;
  const slotCount = totalMinutes / SLOT_MINUTES;
  const timeline = new Array(slotCount).fill(null);
  const initiallyOccupied = [
    ...locked,
    ...flexibleHourResult.assignments.map((assignment) => ({start: assignment.start, end: assignment.end})),
  ];
  for (const item of initiallyOccupied) {
    const firstSlot = Math.floor(Math.max(0, minutesInTokyo(item.start)) / SLOT_MINUTES);
    const lastSlot = Math.ceil(Math.min(totalMinutes, minutesInTokyo(item.end)) / SLOT_MINUTES);
    for (let slot = firstSlot; slot < lastSlot; slot += 1) {
      if (slot >= 0 && slot < slotCount) timeline[slot] = "LOCKED";
    }
  }

  const groups = new Map();
  const assignedBandIds = new Set(flexibleHourResult.assignments.map((assignment) => assignment.bandId));
  const exactBands = bands.filter((band) => !flexibleBands.includes(band));
  for (const band of exactBands) {
    for (const request of band.requests) {
      const requestStart = Math.max(0, Math.floor(minutesInTokyo(request.start) / SLOT_MINUTES));
      const requestEnd = Math.min(slotCount, Math.floor(minutesInTokyo(request.end) / SLOT_MINUTES));
      const slotLength = requestEnd - requestStart;
      if (slotLength <= 0 || slotLength > 2) continue;
      const key = `${requestStart}:${slotLength}`;
      if (!groups.has(key)) groups.set(key, {startSlot: requestStart, slotLength, bands: new Map()});
      const group = groups.get(key);
      if (!group.bands.has(band.id)) group.bands.set(band.id, {band, requests: []});
      group.bands.get(band.id).requests.push(request);
    }
  }

  const assignments = flexibleHourResult.assignments.map((assignment) => ({
    ...assignment,
    durationMinutes: 60,
    previousBookingCount: bookingCountForBand(assignment.bandId, bandBookingCounts),
  }));
  const slotsAreFree = (startSlot, length) =>
    startSlot >= 0 && startSlot + length <= slotCount &&
    Array.from({length}, (_, offset) => timeline[startSlot + offset] === null).every(Boolean);
  const availableEntries = (group) => [...group.bands.values()]
      .filter((entry) => !assignedBandIds.has(entry.band.id));
  const assign = (entry, startSlot, slotLength) => {
    const request = shuffle(entry.requests, random)[0];
    const start = atTokyoMinutes(request.start, startSlot * SLOT_MINUTES);
    const end = new Date(start.getTime() + slotLength * SLOT_MINUTES * 60 * 1000);
    for (let offset = 0; offset < slotLength; offset += 1) timeline[startSlot + offset] = entry.band.id;
    assignedBandIds.add(entry.band.id);
    assignments.push({
      bandId: entry.band.id,
      bandName: entry.band.name,
      start,
      end,
      creatorId: request.creatorId || "",
      userName: request.userName || "",
      isCustomBand: request.isCustomBand === true,
      requestDocId: request.id || "",
      requestedAt: request.createdAt || null,
      originalDocIds: entry.band.docIds,
      durationMinutes: slotLength * SLOT_MINUTES,
      previousBookingCount: bookingCountForBand(entry.band.id, bandBookingCounts),
    });
  };

  const hourGroups = [...groups.values()].filter((group) => group.slotLength === 2);
  const singleRequestGroups = hourGroups.filter((group) => group.bands.size === 1)
      .sort((left, right) => left.startSlot - right.startSlot);
  for (const group of singleRequestGroups) {
    const entries = availableEntries(group);
    if (entries.length === 1 && slotsAreFree(group.startSlot, 2)) assign(entries[0], group.startSlot, 2);
  }

  const contestedGroups = shuffle(hourGroups.filter((group) => group.bands.size > 1), random);
  for (const group of contestedGroups) {
    if (!slotsAreFree(group.startSlot, 2)) continue;
    const entries = availableEntries(group);
    if (entries.length === 0) continue;
    if (entries.length === 1) {
      assign(entries[0], group.startSlot, 2);
      continue;
    }

    const selected = entries.length >= 3
      ? rankByBookingCount(entries, bandBookingCounts, random).slice(0, 2)
      : shuffle(entries, random);
    const ordered = shuffle(selected, random);
    assign(ordered[0], group.startSlot, 1);
    if (ordered[1]) assign(ordered[1], group.startSlot + 1, 1);
  }

  const halfHourGroups = shuffle([...groups.values()].filter((group) => group.slotLength === 1), random);
  for (const group of halfHourGroups) {
    if (!slotsAreFree(group.startSlot, 1)) continue;
    const entries = availableEntries(group);
    if (entries.length === 0) continue;
    const selected = entries.length >= 3
      ? rankByBookingCount(entries, bandBookingCounts, random)[0]
      : shuffle(entries, random)[0];
    assign(selected, group.startSlot, 1);
  }

  const failedAfterSlotLottery = bands.filter((band) => !assignedBandIds.has(band.id));
  const occupiedAfterSlotLottery = [
    ...locked,
    ...assignments.map((assignment) => ({start: assignment.start, end: assignment.end})),
  ];
  const halfHourResult = tryAllocate(
      failedAfterSlotLottery,
      30,
      occupiedAfterSlotLottery,
      random,
  );
  const finalAssignments = [
    ...assignments,
    ...halfHourResult.assignments.map((assignment) => ({...assignment, durationMinutes: 30})),
  ];
  return {
    duration: finalAssignments.some((assignment) => assignment.durationMinutes === 30) ? 30 : 60,
    assignments: finalAssignments,
    failedBands: halfHourResult.failedBands,
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
