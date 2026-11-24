"use strict";

const {getAuth} = require("firebase-admin/auth");
const {FieldValue, Timestamp, getFirestore} = require("firebase-admin/firestore");
const {logger} = require("firebase-functions");
const {onRequest} = require("firebase-functions/v2/https");
const {createHash, randomBytes, randomInt, timingSafeEqual} = require("node:crypto");
const {discordErrorWebhookUrl, notifyDiscordAlert} = require("./discord-alerts");

const ALLOWED_ORIGINS = new Set([
  "https://lmc-mobile.sorairosystem.com",
  "https://app.urakatabu.com",
  "https://urakata-lmc-admin.web.app",
  "https://urakata-lmc-admin.firebaseapp.com",
  "https://liff.line.me",
  "http://localhost",
  "http://localhost:5000",
]);
const PUBLIC_PROFILE_FIELDS = ["name", "kana", "icon", "headerImage", "year", "faculty", "part", "bio", "lineDisplayName"];
const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_CODE_LIFETIME_MS = 10 * 60 * 1000;
const clientErrorAttempts = new Map();

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

function originAllowed(origin) {
  return !origin || ALLOWED_ORIGINS.has(origin) || /^http:\/\/localhost:\d+$/.test(origin);
}

function clientErrorAllowed(uid, now = Date.now()) {
  const previous = clientErrorAttempts.get(uid) || [];
  const recent = previous.filter((timestamp) => now - timestamp < 60_000);
  if (recent.length >= 5) {
    clientErrorAttempts.set(uid, recent);
    return false;
  }
  recent.push(now);
  clientErrorAttempts.set(uid, recent);
  if (clientErrorAttempts.size > 5000) {
    for (const [key, timestamps] of clientErrorAttempts) {
      if (!timestamps.some((timestamp) => now - timestamp < 60_000)) clientErrorAttempts.delete(key);
    }
  }
  return true;
}

function applyCors(request, response) {
  const origin = request.get("origin");
  if (origin && originAllowed(origin)) {
    response.set("Access-Control-Allow-Origin", origin);
    response.set("Vary", "Origin");
  }
  response.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  response.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  response.set("Cache-Control", "no-store");
  response.set("X-Content-Type-Options", "nosniff");
  return originAllowed(origin);
}

async function authenticate(request, {registered = true} = {}) {
  const token = (request.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token || token.length > 10000) throw new HttpError(401, "authentication_required", "ログインが必要です。");
  try {
    const identity = await getAuth().verifyIdToken(token, true);
    if (identity.line !== true || (registered && identity.registered !== true)) {
      throw new HttpError(403, "registered_user_required", "LMCへの登録が必要です。");
    }
    return identity;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(401, "invalid_authentication", "ログインの有効期限が切れています。");
  }
}

function publicProfile(snapshot) {
  const source = snapshot.data() || {};
  const result = {id: snapshot.id};
  for (const field of PUBLIC_PROFILE_FIELDS) {
    if (source[field] !== undefined && source[field] !== null) result[field] = source[field];
  }
  return result;
}

function publicMaintenance(settings) {
  const source = settings?.mobileMaintenance || {};
  return {
    enabled: source.enabled === true,
    title: cleanOptionalText(source.title, 80) || "メンテナンス中です",
    message: cleanOptionalText(source.message, 500) || "時間をおいて、もう一度お試しください。",
  };
}

function cleanText(value, maxLength, fieldName) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result || result.length > maxLength || /[\u0000-\u001f\u007f]/.test(result)) {
    throw new HttpError(400, "invalid_field", `${fieldName}が正しくありません。`);
  }
  return result;
}

function cleanOptionalText(value, maxLength) {
  if (value === undefined || value === null || value === "") return "";
  const result = String(value).trim();
  if (result.length > maxLength || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result)) {
    throw new HttpError(400, "invalid_field", "入力内容が長すぎます。");
  }
  return result;
}

function cleanOptionalHttpsUrl(value, maxLength = 1600) {
  const result = cleanOptionalText(value, maxLength);
  if (!result) return "";
  try {
    const url = new URL(result);
    if (url.protocol !== "https:") throw new Error("invalid protocol");
    return url.href;
  } catch (_) {
    throw new HttpError(400, "invalid_image_url", "画像URLが正しくありません。");
  }
}

function assertAdmin(identity) {
  if (identity?.admin !== true) {
    throw new HttpError(403, "admin_required", "管理者権限が必要です。");
  }
}

function uniqueList(...lists) {
  return [...new Set(lists.flatMap((list) => Array.isArray(list) ? list : [])
      .filter((value) => value !== undefined && value !== null && value !== ""))];
}

function songIdentity(song) {
  if (!song || typeof song !== "object") return "";
  if (song.id) return `id:${song.id}`;
  return `song:${String(song.title || "").trim().toLowerCase()}|${String(song.eventId || "")}|${String(song.duration || "")}`;
}

function mergeSongs(targetSongs, sourceSongs) {
  const result = [];
  const seen = new Set();
  for (const song of [...(Array.isArray(targetSongs) ? targetSongs : []), ...(Array.isArray(sourceSongs) ? sourceSongs : [])]) {
    const key = songIdentity(song);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(song);
  }
  return result;
}

function mergeBandData(target, source, sourceId) {
  const fallbackFields = ["icon", "headerImage", "timelineDescription", "latestCuesheetUrl", "latestCueSheetId", "cueSheetId", "creatorId"];
  const merged = {
    memberIds: uniqueList(target.memberIds, source.memberIds),
    memberNames: uniqueList(target.memberNames, source.memberNames),
    events: uniqueList(target.events, source.events),
    songs: mergeSongs(target.songs, source.songs),
    likes: uniqueList(target.likes, source.likes),
    performanceDates: {...(source.performanceDates || {}), ...(target.performanceDates || {})},
    mergedFromBandIds: uniqueList(target.mergedFromBandIds, source.mergedFromBandIds, [sourceId]),
    isArchived: false,
  };
  for (const field of fallbackFields) {
    if ((target[field] === undefined || target[field] === null || target[field] === "") && source[field]) merged[field] = source[field];
  }
  return merged;
}

function replaceBandInTimetable(timetable, sourceBandId, targetBandId, targetBandName) {
  if (!timetable || !Array.isArray(timetable.entries)) return {timetable, changed: false};
  let changed = false;
  const hasOriginalTarget = timetable.entries.some((entry) => entry.bandId === targetBandId);
  const seen = new Set();
  const entries = [];
  for (const original of timetable.entries) {
    const entry = {...original};
    if (entry.bandId === sourceBandId) {
      if (hasOriginalTarget) {
        changed = true;
        continue;
      }
      entry.bandId = targetBandId;
      if (targetBandName) entry.bandName = targetBandName;
      changed = true;
    }
    if (entry.bandId === targetBandId) {
      if (seen.has(targetBandId)) {
        changed = true;
        continue;
      }
      seen.add(targetBandId);
    }
    entries.push(entry);
  }
  return {timetable: changed ? {...timetable, entries} : timetable, changed};
}

function removeBandFromTimetable(timetable, bandId) {
  if (!timetable || !Array.isArray(timetable.entries)) return {timetable, changed: false};
  const entries = timetable.entries.filter((entry) => entry.bandId !== bandId);
  return {
    timetable: entries.length === timetable.entries.length ? timetable : {...timetable, entries},
    changed: entries.length !== timetable.entries.length,
  };
}

async function mergeBands(db, identity, sourceBandIdValue, targetBandIdValue) {
  assertAdmin(identity);
  const sourceBandId = cleanText(sourceBandIdValue, 160, "統合元バンド");
  const targetBandId = cleanText(targetBandIdValue, 160, "統合先バンド");
  if (sourceBandId === targetBandId || sourceBandId.includes("/") || targetBandId.includes("/")) {
    throw new HttpError(400, "invalid_band_merge", "異なる2つのバンドを選択してください。");
  }

  const sourceRef = db.doc(`bands/${sourceBandId}`);
  const targetRef = db.doc(`bands/${targetBandId}`);
  const [sourceSnapshot, targetSnapshot, bookings, cueSheets, events, invites] = await Promise.all([
    sourceRef.get(), targetRef.get(),
    db.collection("bookings").where("bandId", "==", sourceBandId).get(),
    db.collection("cuesheets").where("bandId", "==", sourceBandId).get(),
    db.collection("events").get(),
    db.collection("bandInvites").where("bandId", "==", sourceBandId).get(),
  ]);
  if (!sourceSnapshot.exists || !targetSnapshot.exists) {
    throw new HttpError(404, "band_not_found", "統合するバンドが見つかりません。");
  }
  const source = sourceSnapshot.data() || {};
  const target = targetSnapshot.data() || {};
  if (source.mergedIntoBandId) throw new HttpError(409, "band_already_merged", "統合元のバンドはすでに統合されています。");

  const timetableUpdates = [];
  for (const eventSnapshot of events.docs) {
    const result = replaceBandInTimetable(eventSnapshot.get("timetable"), sourceBandId, targetBandId, target.name || "");
    if (result.changed) timetableUpdates.push({ref: eventSnapshot.ref, timetable: result.timetable});
  }
  const writeCount = 2 + bookings.size + cueSheets.size + invites.size + timetableUpdates.length;
  if (writeCount > 450) {
    throw new HttpError(409, "band_merge_too_large", "関連データが多いため一括統合できません。管理者に連絡してください。");
  }

  const batch = db.batch();
  batch.set(targetRef, {...mergeBandData(target, source, sourceBandId), updatedAt: FieldValue.serverTimestamp()}, {merge: true});
  batch.set(sourceRef, {
    isArchived: true,
    mergedIntoBandId: targetBandId,
    mergedAt: FieldValue.serverTimestamp(),
    memberIds: [], memberNames: [], events: [], performanceDates: {},
    updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});
  for (const snapshot of bookings.docs) {
    batch.update(snapshot.ref, {bandId: targetBandId, bandName: target.name || source.name || "統合済みバンド"});
  }
  for (const snapshot of cueSheets.docs) {
    batch.update(snapshot.ref, {bandId: targetBandId, bandName: target.name || source.name || "統合済みバンド", updatedAt: FieldValue.serverTimestamp()});
  }
  for (const update of timetableUpdates) batch.update(update.ref, {timetable: update.timetable, timetableUpdatedAt: FieldValue.serverTimestamp()});
  for (const snapshot of invites.docs) batch.delete(snapshot.ref);
  await batch.commit();
  return {sourceBandId, targetBandId, bookings: bookings.size, cueSheets: cueSheets.size, timetables: timetableUpdates.length};
}

async function removeBandEvent(db, identity, bandIdValue, eventIdValue) {
  assertAdmin(identity);
  const bandId = cleanText(bandIdValue, 160, "バンド");
  const eventId = cleanText(eventIdValue, 160, "イベント");
  if (bandId.includes("/") || eventId.includes("/")) throw new HttpError(400, "invalid_document_id", "IDが正しくありません。");
  const bandRef = db.doc(`bands/${bandId}`);
  const eventRef = db.doc(`events/${eventId}`);
  const [bandSnapshot, eventSnapshot] = await Promise.all([bandRef.get(), eventRef.get()]);
  if (!bandSnapshot.exists) throw new HttpError(404, "band_not_found", "バンドが見つかりません。");
  const band = bandSnapshot.data() || {};
  const performanceDates = {...(band.performanceDates || {})};
  delete performanceDates[eventId];
  const batch = db.batch();
  batch.update(bandRef, {
    events: (Array.isArray(band.events) ? band.events : []).filter((id) => id !== eventId),
    performanceDates,
    updatedAt: FieldValue.serverTimestamp(),
  });
  let timetableChanged = false;
  if (eventSnapshot.exists) {
    const result = removeBandFromTimetable(eventSnapshot.get("timetable"), bandId);
    timetableChanged = result.changed;
    if (result.changed) batch.update(eventRef, {timetable: result.timetable, timetableUpdatedAt: FieldValue.serverTimestamp()});
  }
  await batch.commit();
  return {bandId, eventId, timetableChanged};
}

function dateKeyInTokyo(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

function startOfTokyoDay(date) {
  const [year, month, day] = dateKeyInTokyo(date).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) - 9 * 60 * 60 * 1000);
}

function parseBookingBody(body) {
  const start = new Date(body.startTime);
  const end = new Date(body.endTime);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
    throw new HttpError(400, "invalid_time", "予約時間が正しくありません。");
  }
  const duration = end.getTime() - start.getTime();
  if (duration < 30 * 60 * 1000 || duration > 12 * 60 * 60 * 1000) {
    throw new HttpError(400, "invalid_duration", "予約時間は30分以上12時間以内にしてください。");
  }
  const parts = (date) => Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  const startParts = parts(start);
  const endParts = parts(end);
  const sameDay = startParts.year === endParts.year && startParts.month === endParts.month && startParts.day === endParts.day;
  const validBoundary = [0, 30].includes(startParts.minute) && [0, 30].includes(endParts.minute);
  if (!sameDay || !validBoundary || startParts.hour < 9 || endParts.hour > 20 ||
      (endParts.hour === 20 && endParts.minute !== 0)) {
    throw new HttpError(400, "outside_booking_hours", "予約は同じ日の9:00〜20:00に30分単位で指定してください。");
  }
  if (start.getTime() < Date.now() - 5 * 60 * 1000) {
    throw new HttpError(400, "booking_in_past", "過去の時間は予約できません。");
  }
  const type = body.type === "event" ? "event" : "normal";
  if (type === "event") {
    return {
      type,
      title: cleanText(body.title, 120, "イベント名"),
      eventMessage: cleanOptionalText(body.eventMessage, 1000),
      eventImageUrl: cleanOptionalHttpsUrl(body.eventImageUrl),
      bandId: "",
      customBandName: "",
      start,
      end,
    };
  }
  const hasBandId = typeof body.bandId === "string" && body.bandId.trim() !== "";
  const hasCustomBandName = typeof body.customBandName === "string" && body.customBandName.trim() !== "";
  if (hasBandId === hasCustomBandName) {
    throw new HttpError(400, "invalid_band", "参加中のバンド、またはその他のバンド名のどちらかを指定してください。");
  }
  return {
    type,
    bandId: hasBandId ? cleanText(body.bandId, 160, "バンド") : "",
    customBandName: hasCustomBandName ? cleanText(body.customBandName, 120, "バンド名") : "",
    start,
    end,
  };
}

function customBandId(uid, bandName) {
  const normalizedName = bandName.normalize("NFKC").toLocaleLowerCase("ja");
  return `custom_${sha256(`${uid}\u0000${normalizedName}`).slice(0, 32)}`;
}

function eventIncludesDate(eventData, dateKey) {
  const startDate = eventData?.startDate || eventData?.date;
  const endDate = eventData?.endDate || startDate;
  const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
  return validDate(startDate) && validDate(endDate) && endDate >= startDate &&
    dateKey >= startDate && dateKey <= endDate;
}

async function bookingStatus(db, start, {eventBooking = false} = {}) {
  const settings = (await db.doc("system/settings").get()).data() || {};
  const dateKey = dateKeyInTokyo(start);
  const activeEventId = cleanOptionalText(settings.activeEventId, 160);
  if (activeEventId) {
    const eventSnapshot = await db.doc(`events/${activeEventId}`).get();
    const eventData = eventSnapshot.data() || {};
    if (!eventBooking && eventSnapshot.exists && eventIncludesDate(eventData, dateKey)) {
      const eventName = cleanOptionalText(eventData.event || eventData.name, 120) || "定期演奏会";
      throw new HttpError(409, "active_event_day_blocked", `${eventName}の開催日は、合わせ予約ができません。`);
    }
  }
  if (eventBooking) return {status: "confirmed", activeEventId: ""};
  const mode = settings.reservationMode || settings.bookingMode || "first_come";
  if (mode !== "lottery") return {status: "confirmed", activeEventId};
  const run = await db.doc(`lotteryRuns/${dateKey}`).get();
  return {status: run.exists ? "confirmed" : "pending", activeEventId};
}

async function assertBandMember(db, bandId, uid) {
  const band = await db.doc(`bands/${bandId}`).get();
  if (!band.exists || !Array.isArray(band.get("memberIds")) || !band.get("memberIds").includes(uid)) {
    throw new HttpError(403, "band_membership_required", "参加しているバンドだけ予約できます。");
  }
  return band;
}

function bookingCanBeManagedBy(booking, uid, band) {
  if (!booking || !uid) return false;
  if (booking.systemManaged === true) return false;
  if (booking.creatorId === uid) return true;
  if (booking.type === "event" || booking.isCustomBand === true || !booking.bandId || String(booking.bandId).startsWith("custom_")) {
    return false;
  }
  const memberIds = band?.get ? band.get("memberIds") : band?.memberIds;
  return Array.isArray(memberIds) && memberIds.includes(uid);
}

function bandParticipatesInEvent(band, eventId) {
  if (!band || !eventId) return false;
  const events = band.get ? band.get("events") : band.events;
  const performanceDates = band.get ? band.get("performanceDates") : band.performanceDates;
  return Boolean((Array.isArray(events) && events.includes(eventId)) ||
    (performanceDates && typeof performanceDates === "object" && Object.hasOwn(performanceDates, eventId)));
}

function bookingCanBeTransferredBy(booking, uid, sourceBand, now = Date.now()) {
  if (!booking || !uid || !sourceBand) return false;
  if (booking.type === "event" || booking.status !== "confirmed" || booking.systemManaged === true ||
      booking.isCustomBand === true || !booking.bandId || String(booking.bandId).startsWith("custom_")) return false;
  const memberIds = sourceBand.get ? sourceBand.get("memberIds") : sourceBand.memberIds;
  const startTime = booking.startTime?.toMillis?.() ?? new Date(booking.startTime).getTime();
  return Array.isArray(memberIds) && memberIds.includes(uid) && Number.isFinite(startTime) && startTime > now;
}

async function canManageBookingInTransaction(transaction, db, booking, uid) {
  if (bookingCanBeManagedBy(booking, uid, null)) return true;
  if (booking.type === "event" || booking.isCustomBand === true || !booking.bandId || String(booking.bandId).startsWith("custom_")) {
    return false;
  }
  const band = await transaction.get(db.doc(`bands/${booking.bandId}`));
  return band.exists && bookingCanBeManagedBy(booking, uid, band);
}

async function saveBooking(db, identity, body, bookingId) {
  const parsed = parseBookingBody(body);
  const {type, bandId: requestedBandId, customBandName, start, end} = parsed;
  const isEvent = type === "event";
  if (isEvent && identity.admin !== true) {
    throw new HttpError(403, "admin_required", "イベント予約は管理者のみ登録できます。");
  }
  const [band, user] = await Promise.all([
    isEvent || customBandName ? Promise.resolve(null) : assertBandMember(db, requestedBandId, identity.uid),
    db.doc(`users/${identity.uid}`).get(),
  ]);
  const bandId = isEvent ? "" : (customBandName ? customBandId(identity.uid, customBandName) : requestedBandId);
  const bandName = isEvent ? parsed.title : (customBandName || cleanOptionalText(band.get("name"), 120) || "名称未設定");
  const bookingState = await bookingStatus(db, start, {eventBooking: isEvent});
  const {status} = bookingState;
  const bookingRef = bookingId ? db.doc(`bookings/${bookingId}`) : db.collection("bookings").doc();
  await db.runTransaction(async (transaction) => {
    if (bookingId) {
      const existing = await transaction.get(bookingRef);
      if (!existing.exists) throw new HttpError(404, "booking_not_found", "予約が見つかりません。");
      const data = existing.data();
      const isAdmin = identity.admin === true;
      if (!isAdmin && !await canManageBookingInTransaction(transaction, db, data, identity.uid)) {
        throw new HttpError(403, "booking_participant_required", "予約した本人または参加バンドのメンバーだけ編集できます。");
      }
    }
    if (status === "confirmed") {
      const conflicts = await transaction.get(db.collection("bookings")
          .where("startTime", ">=", Timestamp.fromDate(startOfTokyoDay(start)))
          .where("startTime", "<", Timestamp.fromDate(end)));
      const overlapping = conflicts.docs.some((doc) => {
        if (doc.id === bookingRef.id) return false;
        const value = doc.data();
        if (value.status !== "confirmed" && value.type !== "event") return false;
        return value.endTime?.toMillis?.() > start.getTime();
      });
      if (overlapping) throw new HttpError(409, "booking_conflict", "この時間帯にはすでに予約があります。");
    }
    const value = {
      bandId,
      bandName,
      isCustomBand: !isEvent && Boolean(customBandName),
      creatorId: bookingId ? undefined : identity.uid,
      userName: bookingId ? undefined : cleanOptionalText(user.get("name") || user.get("lineDisplayName"), 120),
      type,
      title: isEvent ? parsed.title : "",
      eventMessage: isEvent ? parsed.eventMessage : "",
      eventImageUrl: isEvent ? parsed.eventImageUrl : "",
      eventId: isEvent ? "" : bookingState.activeEventId,
      status,
      startTime: Timestamp.fromDate(start),
      endTime: Timestamp.fromDate(end),
      updatedAt: FieldValue.serverTimestamp(),
    };
    Object.keys(value).forEach((key) => value[key] === undefined && delete value[key]);
    if (bookingId) transaction.update(bookingRef, value);
    else transaction.create(bookingRef, {...value, createdAt: FieldValue.serverTimestamp()});
  });
  return {id: bookingRef.id, status};
}

async function deleteBooking(db, identity, bookingId) {
  const ref = db.doc(`bookings/${bookingId}`);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return;
    const value = snapshot.data();
    if (identity.admin !== true && !await canManageBookingInTransaction(transaction, db, value, identity.uid)) {
      throw new HttpError(403, "booking_participant_required", "予約した本人または参加バンドのメンバーだけ削除できます。");
    }
    transaction.delete(ref);
  });
}

async function transferBooking(db, identity, bookingId, body = {}) {
  const mode = body.mode === "public" ? "public" : body.mode === "band" ? "band" : "";
  if (!mode) throw new HttpError(400, "invalid_transfer_mode", "譲渡方法を選択してください。");
  const targetBandId = mode === "band" ? cleanText(body.targetBandId, 160, "譲渡先バンド") : "";
  if (targetBandId.includes("/")) throw new HttpError(400, "invalid_document_id", "バンドIDが正しくありません。");

  const bookingRef = db.doc(`bookings/${bookingId}`);
  return db.runTransaction(async (transaction) => {
    const bookingSnapshot = await transaction.get(bookingRef);
    if (!bookingSnapshot.exists) throw new HttpError(404, "booking_not_found", "予約が見つかりません。");
    const booking = bookingSnapshot.data() || {};
    const sourceBandId = cleanOptionalText(booking.bandId, 160);
    if (!sourceBandId || sourceBandId.includes("/")) {
      throw new HttpError(400, "booking_not_transferable", "この予約は譲渡できません。");
    }

    const sourceBandRef = db.doc(`bands/${sourceBandId}`);
    const settingsRef = db.doc("system/settings");
    const [sourceBandSnapshot, settingsSnapshot] = await Promise.all([
      transaction.get(sourceBandRef),
      transaction.get(settingsRef),
    ]);
    if (!sourceBandSnapshot.exists || !bookingCanBeTransferredBy(booking, identity.uid, sourceBandSnapshot)) {
      throw new HttpError(403, "booking_band_member_required", "予約バンドのメンバーだけがこの枠を譲れます。");
    }

    const activeEventId = cleanOptionalText(settingsSnapshot.get("activeEventId") || booking.eventId, 160);
    const lotteryDate = cleanOptionalText(booking.lotteryDate, 10);
    const lotteryRunRef = booking.source === "lottery" && /^\d{4}-\d{2}-\d{2}$/.test(lotteryDate)
      ? db.doc(`lotteryRuns/${lotteryDate}`) : null;
    const lotteryRunSnapshot = lotteryRunRef ? await transaction.get(lotteryRunRef) : null;
    let targetBandSnapshot = null;

    if (mode === "band") {
      if (targetBandId === sourceBandId) throw new HttpError(400, "same_band", "現在のバンド以外を選択してください。");
      targetBandSnapshot = await transaction.get(db.doc(`bands/${targetBandId}`));
      if (!targetBandSnapshot.exists || targetBandSnapshot.get("isArchived") === true) {
        throw new HttpError(404, "target_band_not_found", "譲渡先のバンドが見つかりません。");
      }
      if (!activeEventId || !bandParticipatesInEvent(targetBandSnapshot, activeEventId)) {
        throw new HttpError(400, "target_band_not_in_event", "現在のイベントに参加しているバンドだけ選択できます。");
      }
    }

    const transferredAt = FieldValue.serverTimestamp();
    if (mode === "public") {
      transaction.delete(bookingRef);
    } else {
      const targetBand = targetBandSnapshot.data() || {};
      const targetMemberIds = Array.isArray(targetBand.memberIds) ? targetBand.memberIds : [];
      const representativeId = targetMemberIds.includes(targetBand.creatorId) ? targetBand.creatorId : (targetMemberIds[0] || "");
      transaction.update(bookingRef, {
        bandId: targetBandId,
        bandName: cleanOptionalText(targetBand.name, 120) || "名称未設定",
        creatorId: representativeId,
        userName: "譲渡された予約",
        eventId: activeEventId,
        originalCreatorId: booking.originalCreatorId || booking.creatorId || null,
        transferredFromBandId: sourceBandId,
        transferredFromBandName: booking.bandName || sourceBandSnapshot.get("name") || "名称未設定",
        transferredBy: identity.uid,
        transferredAt,
        updatedAt: transferredAt,
      });
    }

    if (lotteryRunRef && lotteryRunSnapshot?.exists) {
      const run = lotteryRunSnapshot.data() || {};
      const assignments = Array.isArray(run.assignments) ? run.assignments : [];
      const bookingStartMillis = booking.startTime?.toMillis?.() || 0;
      const matchingIndex = assignments.findIndex((assignment) =>
        assignment.bandId === sourceBandId &&
        (!bookingStartMillis || assignment.startTime?.toMillis?.() === bookingStartMillis));
      if (matchingIndex >= 0) {
        if (mode === "public") {
          assignments.splice(matchingIndex, 1);
        } else {
          const targetBand = targetBandSnapshot.data() || {};
          const targetMemberIds = Array.isArray(targetBand.memberIds) ? targetBand.memberIds : [];
          assignments[matchingIndex] = {
            ...assignments[matchingIndex],
            bandId: targetBandId,
            bandName: cleanOptionalText(targetBand.name, 120) || "名称未設定",
            creatorId: targetMemberIds.includes(targetBand.creatorId) ? targetBand.creatorId : (targetMemberIds[0] || null),
            userName: "譲渡された予約",
            winningRequestId: null,
            transferredFromBandId: sourceBandId,
          };
        }
        transaction.update(lotteryRunRef, {
          assignments,
          successCount: assignments.length,
          bandIds: [...new Set([
            ...assignments.map((assignment) => assignment.bandId).filter(Boolean),
            ...(Array.isArray(run.failedBandIds) ? run.failedBandIds : []),
          ])],
          updatedAt: transferredAt,
        });
      }
    }

    return {
      mode,
      bookingId,
      sourceBandId,
      targetBandId: mode === "band" ? targetBandId : null,
      eventId: activeEventId || null,
    };
  });
}

async function createInvite(db, identity, bandId) {
  const band = await assertBandMember(db, bandId, identity.uid);
  const token = randomBytes(32).toString("base64url");
  await db.doc(`bandInvites/${sha256(token)}`).create({
    bandId,
    createdBy: identity.uid,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + INVITE_LIFETIME_MS),
  });
  return {token, bandName: cleanOptionalText(band.get("name"), 120)};
}

async function acceptInvite(db, identity, token) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new HttpError(400, "invalid_invite", "招待リンクが正しくありません。");
  }
  const inviteRef = db.doc(`bandInvites/${sha256(token)}`);
  const userRef = db.doc(`users/${identity.uid}`);
  return db.runTransaction(async (transaction) => {
    const invite = await transaction.get(inviteRef);
    const user = await transaction.get(userRef);
    if (!invite.exists || invite.get("expiresAt")?.toMillis() <= Date.now()) {
      throw new HttpError(410, "invite_expired", "この招待リンクは期限切れです。");
    }
    const bandRef = db.doc(`bands/${invite.get("bandId")}`);
    const band = await transaction.get(bandRef);
    if (!band.exists) throw new HttpError(404, "band_not_found", "バンドが見つかりません。");
    const memberIds = Array.isArray(band.get("memberIds")) ? band.get("memberIds") : [];
    if (!memberIds.includes(identity.uid)) {
      transaction.update(bandRef, {
        memberIds: FieldValue.arrayUnion(identity.uid),
        memberNames: FieldValue.arrayUnion(cleanOptionalText(user.get("name") || user.get("lineDisplayName"), 120) || "メンバー"),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    transaction.set(userRef, {pendingInvites: FieldValue.arrayRemove(invite.get("bandId"))}, {merge: true});
    return {bandId: band.id, bandName: cleanOptionalText(band.get("name"), 120)};
  });
}

async function leaveBand(db, identity, bandId) {
  const bandRef = db.doc(`bands/${bandId}`);
  await db.runTransaction(async (transaction) => {
    const band = await transaction.get(bandRef);
    if (!band.exists) throw new HttpError(404, "band_not_found", "バンドが見つかりません。");
    if (band.get("creatorId") === identity.uid) {
      throw new HttpError(400, "creator_cannot_leave", "リーダーは先に別のメンバーへ管理を引き継いでください。");
    }
    const ids = Array.isArray(band.get("memberIds")) ? band.get("memberIds") : [];
    const names = Array.isArray(band.get("memberNames")) ? band.get("memberNames") : [];
    const index = ids.indexOf(identity.uid);
    if (index < 0) throw new HttpError(403, "band_membership_required", "このバンドには参加していません。");
    transaction.update(bandRef, {
      memberIds: ids.filter((id) => id !== identity.uid),
      memberNames: names.filter((_, memberIndex) => memberIndex !== index),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

async function sendEmailCode(db, identity, email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalized) || normalized.length > 254) {
    throw new HttpError(400, "invalid_email", "メールアドレスが正しくありません。");
  }
  const ref = db.doc(`emailVerifications/${identity.uid}`);
  const now = Date.now();
  const code = String(randomInt(100000, 1000000));
  const salt = randomBytes(16).toString("hex");
  await db.runTransaction(async (transaction) => {
    const previous = await transaction.get(ref);
    if (previous.exists && now - (previous.get("sentAt")?.toMillis() || 0) < 60_000) {
      throw new HttpError(429, "email_rate_limited", "1分待ってから再送してください。");
    }
    transaction.set(ref, {
      email: normalized,
      salt,
      codeHash: sha256(`${identity.uid}:${salt}:${code}`),
      attempts: 0,
      sentAt: Timestamp.fromMillis(now),
      expiresAt: Timestamp.fromMillis(now + EMAIL_CODE_LIFETIME_MS),
    });
  });
  await db.collection("mail_queue").add({
    to: normalized,
    subject: "LMC メールアドレス認証コード",
    body: `認証コード: ${code}\n\nこのコードの有効期限は10分です。心当たりがない場合は破棄してください。`,
    userId: identity.uid,
    createdAt: FieldValue.serverTimestamp(),
  });
}

async function verifyEmailCode(db, identity, code) {
  const normalized = String(code || "").trim();
  if (!/^\d{6}$/.test(normalized)) throw new HttpError(400, "invalid_code", "6桁のコードを入力してください。");
  const ref = db.doc(`emailVerifications/${identity.uid}`);
  const userRef = db.doc(`users/${identity.uid}`);
  const verified = await db.runTransaction(async (transaction) => {
    const verification = await transaction.get(ref);
    if (!verification.exists || verification.get("expiresAt")?.toMillis() <= Date.now()) {
      throw new HttpError(410, "code_expired", "認証コードの有効期限が切れています。");
    }
    const attempts = Number(verification.get("attempts") || 0);
    if (attempts >= 5) throw new HttpError(429, "too_many_attempts", "試行回数を超えました。コードを再送してください。");
    const actual = sha256(`${identity.uid}:${verification.get("salt")}:${normalized}`);
    if (!safeEqual(actual, verification.get("codeHash"))) {
      transaction.update(ref, {attempts: attempts + 1});
      return false;
    }
    transaction.set(userRef, {Email: verification.get("email"), emailVerifiedAt: FieldValue.serverTimestamp()}, {merge: true});
    transaction.delete(ref);
    return true;
  });
  if (!verified) throw new HttpError(400, "incorrect_code", "認証コードが正しくありません。");
}

async function route(request, response) {
  const db = getFirestore();
  const path = request.path.replace(/\/+$/, "") || "/";

  if (request.method === "GET" && path === "/maintenance") {
    const settings = (await db.doc("system/settings").get()).data() || {};
    response.json({maintenance: publicMaintenance(settings)});
    return;
  }

  const identity = await authenticate(request);

  if (request.method === "POST" && path === "/client-errors") {
    if (!clientErrorAllowed(identity.uid)) {
      response.status(202).json({accepted: false});
      return;
    }
    const allowedKinds = new Set(["error", "unhandledrejection", "console", "api", "manual"]);
    const kind = allowedKinds.has(request.body?.kind) ? request.body.kind : "error";
    const message = cleanOptionalText(request.body?.message, 1600) || "Unknown client error";
    const stack = cleanOptionalText(request.body?.stack, 4000);
    const page = cleanOptionalText(request.body?.page, 300) || "/";
    const environment = cleanOptionalText(request.body?.environment, 120) || "Webアプリ";
    const userAgent = cleanOptionalText(request.body?.userAgent, 600);
    const viewport = cleanOptionalText(request.body?.viewport, 80);
    const userSnapshot = await db.doc(`users/${identity.uid}`).get();
    const userData = userSnapshot.data() || {};
    await notifyDiscordAlert({
      source: "client",
      kind,
      message,
      stack,
      page,
      environment,
      userAgent,
      viewport,
      online: request.body?.online,
      uid: identity.uid,
      userName: cleanOptionalText(userData.name || userData.lineDisplayName || identity.name, 120) || "名称未設定",
      userIcon: cleanOptionalText(userData.icon || identity.picture, 1000),
    });
    response.status(202).json({accepted: true});
    return;
  }

  if (request.method === "GET" && path === "/profiles") {
    const snapshots = await db.collection("users").get();
    response.json({profiles: snapshots.docs.map(publicProfile)});
    return;
  }
  const profileMatch = path.match(/^\/profiles\/([^/]+)$/);
  if (request.method === "GET" && profileMatch) {
    const snapshot = await db.doc(`users/${profileMatch[1]}`).get();
    if (!snapshot.exists) throw new HttpError(404, "profile_not_found", "プロフィールが見つかりません。");
    response.json({profile: publicProfile(snapshot)});
    return;
  }
  const bandInviteMatch = path.match(/^\/bands\/([^/]+)\/invites$/);
  if (request.method === "POST" && bandInviteMatch) {
    response.status(201).json(await createInvite(db, identity, bandInviteMatch[1]));
    return;
  }
  const bandLeaveMatch = path.match(/^\/bands\/([^/]+)\/leave$/);
  if (request.method === "POST" && bandLeaveMatch) {
    await leaveBand(db, identity, bandLeaveMatch[1]);
    response.status(204).send("");
    return;
  }
  if (request.method === "POST" && path === "/bands/merge") {
    response.json({merge: await mergeBands(db, identity, request.body?.sourceBandId, request.body?.targetBandId)});
    return;
  }
  const bandEventMatch = path.match(/^\/bands\/([^/]+)\/events\/([^/]+)$/);
  if (request.method === "DELETE" && bandEventMatch) {
    response.json({removal: await removeBandEvent(db, identity, bandEventMatch[1], bandEventMatch[2])});
    return;
  }
  if (request.method === "POST" && path === "/invites/accept") {
    response.json(await acceptInvite(db, identity, request.body?.token));
    return;
  }
  if (request.method === "POST" && path === "/bookings") {
    response.status(201).json({booking: await saveBooking(db, identity, request.body || {}, null)});
    return;
  }
  const bookingTransferMatch = path.match(/^\/bookings\/([^/]+)\/transfer$/);
  if (request.method === "POST" && bookingTransferMatch) {
    response.json({transfer: await transferBooking(db, identity, bookingTransferMatch[1], request.body || {})});
    return;
  }
  const bookingMatch = path.match(/^\/bookings\/([^/]+)$/);
  if (request.method === "PATCH" && bookingMatch) {
    response.json({booking: await saveBooking(db, identity, request.body || {}, bookingMatch[1])});
    return;
  }
  if (request.method === "DELETE" && bookingMatch) {
    await deleteBooking(db, identity, bookingMatch[1]);
    response.status(204).send("");
    return;
  }
  if (request.method === "POST" && path === "/email/send-code") {
    await sendEmailCode(db, identity, request.body?.email);
    response.status(202).json({ok: true});
    return;
  }
  if (request.method === "POST" && path === "/email/verify") {
    await verifyEmailCode(db, identity, request.body?.code);
    response.json({ok: true});
    return;
  }
  throw new HttpError(404, "not_found", "操作が見つかりません。");
}

exports.lmcAppApi = onRequest({
  region: "asia-northeast1",
  memory: "256MiB",
  timeoutSeconds: 30,
  maxInstances: 10,
  secrets: [discordErrorWebhookUrl],
}, async (request, response) => {
  if (!applyCors(request, response)) {
    response.status(403).json({error: "origin_not_allowed"});
    return;
  }
  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }
  try {
    await route(request, response);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status >= 500) {
      logger.error("LMC app API failed", {path: request.path, message: error.message});
      await notifyDiscordAlert({
        source: "lmcAppApi",
        kind: "server",
        page: request.path,
        message: error.message,
        stack: error.stack,
      });
    } else {
      logger.warn("LMC app API rejected request", {path: request.path, code: error.code});
    }
    response.status(status).json({error: error.code || "internal_error", message: status < 500 ? error.message : "処理に失敗しました。"});
  }
});

exports._test = {bandParticipatesInEvent, bookingCanBeManagedBy, bookingCanBeTransferredBy, clientErrorAllowed, cleanOptionalHttpsUrl, customBandId, dateKeyInTokyo, eventIncludesDate, mergeBandData, mergeSongs, parseBookingBody, publicMaintenance, publicProfile, removeBandFromTimetable, replaceBandInTimetable, sha256};
