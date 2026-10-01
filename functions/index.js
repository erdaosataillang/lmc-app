"use strict";

const {initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {FieldValue, Timestamp, getFirestore} = require("firebase-admin/firestore");
const {logger} = require("firebase-functions");
const {onRequest} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {
  calculateLottery,
  configuredTimeMatches,
  targetDateKey,
  tokyoDateParts,
  tokyoDayBounds,
} = require("./lottery");

initializeApp();
const db = getFirestore();

const LINE_CHANNEL_ID = "2008162165";
const ALLOWED_ORIGINS = new Set([
  "https://lmc-mobile.sorairosystem.com",
  "https://liff.line.me",
  "http://localhost",
  "http://localhost:5000",
]);

function roleValues(value) {
  if (!value) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(roleValues);
  if (typeof value === "object") {
    return Object.entries(value)
        .filter(([, enabled]) => enabled === true || enabled === "true")
        .map(([role]) => role);
  }
  return [];
}

function hasAdminAccess(userData = {}) {
  const roles = [
    ...roleValues(userData.role),
    ...roleValues(userData.roll),
  ].map((role) => role.toLowerCase());
  const affiliations = Array.isArray(userData.affiliations) ? userData.affiliations : [];
  return roles.some((role) => ["admin", "lmc_all", "urakata_all"].includes(role)) ||
    (affiliations.includes("urakata") && roles.length > 0);
}

exports.createLineFirebaseToken = onRequest({
  region: "asia-northeast1",
  memory: "256MiB",
  timeoutSeconds: 30,
  maxInstances: 10,
}, async (request, response) => {
  const origin = request.get("origin");
  if (origin && (ALLOWED_ORIGINS.has(origin) || /^http:\/\/localhost:\d+$/.test(origin))) {
    response.set("Access-Control-Allow-Origin", origin);
    response.set("Vary", "Origin");
  }
  response.set("Access-Control-Allow-Headers", "Content-Type");
  response.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.set("Cache-Control", "no-store");

  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }
  if (request.method !== "POST") {
    response.status(405).json({error: "method_not_allowed"});
    return;
  }
  if (origin && !ALLOWED_ORIGINS.has(origin) && !/^http:\/\/localhost:\d+$/.test(origin)) {
    response.status(403).json({error: "origin_not_allowed"});
    return;
  }

  const idToken = typeof request.body?.idToken === "string" ? request.body.idToken : "";
  if (!idToken || idToken.length > 10000) {
    response.status(400).json({error: "invalid_id_token"});
    return;
  }

  try {
    const verificationResponse = await fetch("https://api.line.me/oauth2/v2.1/verify", {
      method: "POST",
      headers: {"Content-Type": "application/x-www-form-urlencoded"},
      body: new URLSearchParams({id_token: idToken, client_id: LINE_CHANNEL_ID}),
    });
    const lineIdentity = await verificationResponse.json();
    if (!verificationResponse.ok || typeof lineIdentity.sub !== "string" || !lineIdentity.sub) {
      logger.warn("LINE ID token verification failed", {status: verificationResponse.status});
      response.status(401).json({error: "line_verification_failed"});
      return;
    }

    const lineUserId = lineIdentity.sub;
    const userSnapshot = await db.doc(`users/${lineUserId}`).get();
    const userData = userSnapshot.exists ? userSnapshot.data() : {};
    const customToken = await getAuth().createCustomToken(lineUserId, {
      line: true,
      registered: userSnapshot.exists,
      admin: hasAdminAccess(userData),
    });
    response.status(200).json({customToken});
  } catch (error) {
    logger.error("LINE Firebase authentication failed", {message: error.message});
    response.status(500).json({error: "authentication_failed"});
  }
});

exports.runScheduledLottery = onSchedule({
  schedule: "* * * * *",
  timeZone: "Asia/Tokyo",
  region: "asia-northeast1",
  memory: "256MiB",
  timeoutSeconds: 120,
  maxInstances: 1,
  retryCount: 3,
  minBackoffSeconds: 60,
  maxBackoffSeconds: 300,
}, async (event) => {
  const now = event.scheduleTime ? new Date(event.scheduleTime) : new Date();
  const settingsSnapshot = await db.doc("system/settings").get();
  if (!settingsSnapshot.exists) {
    logger.warn("Lottery skipped: system/settings does not exist");
    return;
  }

  const settings = settingsSnapshot.data();
  const lotteryConfig = settings.lotteryConfig || {};
  const bookingMode = settings.reservationMode || settings.bookingMode || "first_come";
  const nowInTokyo = tokyoDateParts(now);
  if (bookingMode !== "lottery" || lotteryConfig.mode !== "auto" ||
      !configuredTimeMatches(lotteryConfig.time, nowInTokyo)) {
    return;
  }

  const daysBefore = Math.max(0, Number.parseInt(lotteryConfig.daysBefore, 10) || 0);
  const dateKey = targetDateKey(now, daysBefore);
  const runRef = db.doc(`lotteryRuns/${dateKey}`);
  if ((await runRef.get()).exists) {
    logger.info("Lottery skipped: already processed", {dateKey});
    return;
  }

  const {start, end} = tokyoDayBounds(dateKey);
  const bookingSnapshot = await db.collection("bookings")
      .where("startTime", ">=", Timestamp.fromDate(start))
      .where("startTime", "<", Timestamp.fromDate(end))
      .get();
  const bookings = bookingSnapshot.docs.map((snapshot) => {
    const data = snapshot.data();
    return {
      id: snapshot.id,
      ...data,
      startTime: data.startTime.toDate(),
      endTime: data.endTime.toDate(),
    };
  });
  const result = calculateLottery(bookings);
  const operationCount = 1 + result.assignments.length + result.candidateDocIds.length;
  if (operationCount > 500) {
    throw new Error(`Lottery requires ${operationCount} writes; Firestore batch limit is 500`);
  }

  const batch = db.batch();
  batch.create(runRef, {
    targetDate: dateKey,
    status: result.candidateCount === 0 ? "no_candidates" : "completed",
    durationMinutes: result.duration,
    hasMixedDurations: result.assignments.some((assignment) => assignment.durationMinutes === 30) &&
      result.assignments.some((assignment) => assignment.durationMinutes === 60),
    candidateCount: result.candidateCount,
    bandCount: result.bandCount,
    successCount: result.assignments.length,
    failedBandIds: result.failedBands.map((band) => band.id),
    bandIds: [...new Set([
      ...result.assignments.map((assignment) => assignment.bandId),
      ...result.failedBands.map((band) => band.id),
    ])],
    assignments: result.assignments.map((assignment) => ({
      bandId: assignment.bandId,
      bandName: assignment.bandName,
      startTime: Timestamp.fromDate(assignment.start),
      endTime: Timestamp.fromDate(assignment.end),
      durationMinutes: assignment.durationMinutes,
    })),
    executedAt: FieldValue.serverTimestamp(),
    scheduleTime: event.scheduleTime || null,
  });

  for (const assignment of result.assignments) {
    const confirmedRef = db.doc(`bookings/lottery_${dateKey}_${assignment.bandId}`);
    batch.create(confirmedRef, {
      bandId: assignment.bandId,
      bandName: assignment.bandName,
      creatorId: "scheduled-lottery",
      userName: "自動抽選",
      startTime: Timestamp.fromDate(assignment.start),
      endTime: Timestamp.fromDate(assignment.end),
      type: "normal",
      status: "confirmed",
      source: "lottery",
      lotteryDate: dateKey,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  for (const candidateId of result.candidateDocIds) {
    batch.delete(db.doc(`bookings/${candidateId}`));
  }

  try {
    await batch.commit();
  } catch (error) {
    if (error.code === 6 || error.code === "already-exists") {
      logger.info("Lottery skipped: another invocation completed it", {dateKey});
      return;
    }
    throw error;
  }
  logger.info("Scheduled lottery completed", {
    dateKey,
    candidates: result.candidateCount,
    successes: result.assignments.length,
    failures: result.failedBands.length,
    durationMinutes: result.duration,
  });
});
