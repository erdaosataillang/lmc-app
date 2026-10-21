"use strict";

const {getAuth} = require("firebase-admin/auth");
const {FieldValue, Timestamp, getFirestore} = require("firebase-admin/firestore");
const {logger} = require("firebase-functions");
const {onRequest} = require("firebase-functions/v2/https");
const {createHash, randomBytes, randomInt, timingSafeEqual} = require("node:crypto");

const ALLOWED_ORIGINS = new Set([
  "https://lmc-mobile.sorairosystem.com",
  "https://liff.line.me",
  "http://localhost",
  "http://localhost:5000",
]);
const PUBLIC_PROFILE_FIELDS = ["name", "kana", "icon", "headerImage", "year", "faculty", "part", "bio", "lineDisplayName"];
const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_CODE_LIFETIME_MS = 10 * 60 * 1000;

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
  return {
    bandId: cleanText(body.bandId, 160, "バンド"),
    start,
    end,
  };
}

async function bookingStatus(db, start) {
  const settings = (await db.doc("system/settings").get()).data() || {};
  const mode = settings.reservationMode || settings.bookingMode || "first_come";
  if (mode !== "lottery") return "confirmed";
  const run = await db.doc(`lotteryRuns/${dateKeyInTokyo(start)}`).get();
  return run.exists ? "confirmed" : "pending";
}

async function assertBandMember(db, bandId, uid) {
  const band = await db.doc(`bands/${bandId}`).get();
  if (!band.exists || !Array.isArray(band.get("memberIds")) || !band.get("memberIds").includes(uid)) {
    throw new HttpError(403, "band_membership_required", "参加しているバンドだけ予約できます。");
  }
  return band;
}

async function saveBooking(db, identity, body, bookingId) {
  const {bandId, start, end} = parseBookingBody(body);
  const [band, user] = await Promise.all([
    assertBandMember(db, bandId, identity.uid),
    db.doc(`users/${identity.uid}`).get(),
  ]);
  const status = await bookingStatus(db, start);
  const bookingRef = bookingId ? db.doc(`bookings/${bookingId}`) : db.collection("bookings").doc();
  await db.runTransaction(async (transaction) => {
    if (bookingId) {
      const existing = await transaction.get(bookingRef);
      if (!existing.exists) throw new HttpError(404, "booking_not_found", "予約が見つかりません。");
      const data = existing.data();
      const isAdmin = identity.admin === true;
      if (!isAdmin && data.creatorId !== identity.uid) throw new HttpError(403, "booking_owner_required", "この予約は編集できません。");
      if (!isAdmin && data.status === "confirmed" && data.source === "lottery") {
        throw new HttpError(403, "lottery_result_locked", "抽選結果は編集できません。");
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
      bandName: cleanOptionalText(band.get("name"), 120) || "名称未設定",
      creatorId: bookingId ? undefined : identity.uid,
      userName: bookingId ? undefined : cleanOptionalText(user.get("name") || user.get("lineDisplayName"), 120),
      type: "normal",
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
    if (identity.admin !== true && value.creatorId !== identity.uid) {
      throw new HttpError(403, "booking_owner_required", "この予約は削除できません。");
    }
    if (identity.admin !== true && value.status === "confirmed" && value.source === "lottery") {
      throw new HttpError(403, "lottery_result_locked", "抽選結果は削除できません。");
    }
    transaction.delete(ref);
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
  const identity = await authenticate(request);

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
  if (request.method === "POST" && path === "/invites/accept") {
    response.json(await acceptInvite(db, identity, request.body?.token));
    return;
  }
  if (request.method === "POST" && path === "/bookings") {
    response.status(201).json({booking: await saveBooking(db, identity, request.body || {}, null)});
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
    if (status >= 500) logger.error("LMC app API failed", {path: request.path, message: error.message});
    else logger.warn("LMC app API rejected request", {path: request.path, code: error.code});
    response.status(status).json({error: error.code || "internal_error", message: status < 500 ? error.message : "処理に失敗しました。"});
  }
});

exports._test = {dateKeyInTokyo, parseBookingBody, publicProfile, sha256};
