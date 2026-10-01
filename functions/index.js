"use strict";

const {initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {FieldValue, Timestamp, getFirestore} = require("firebase-admin/firestore");
const {logger} = require("firebase-functions");
const {onRequest} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {defineSecret} = require("firebase-functions/params");
const {randomBytes} = require("node:crypto");
const {
  CHAT_CLIENT_ID,
  CHAT_REDIRECT_URI,
  chatProfile,
  safeEqual,
  sha256Base64Url,
  validPkceChallenge,
  validPkceVerifier,
} = require("./chat-auth");
const {
  calculateLottery,
  configuredTimeMatches,
  targetDateKey,
  tokyoDateParts,
  tokyoDayBounds,
} = require("./lottery");

initializeApp();
const db = getFirestore();
const chatApiToken = defineSecret("CHAT_API_TOKEN");

const LINE_CHANNEL_ID = "2008162165";
const ALLOWED_ORIGINS = new Set([
  "https://lmc-mobile.sorairosystem.com",
  "https://liff.line.me",
  "http://localhost",
  "http://localhost:5000",
]);

function roleValues(value) {
  if (!value) return [];
  if (typeof value === "string") return value.split(/[\s,]+/).filter(Boolean);
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
  return roles.some((role) => {
    if (["admin", "lmc_all", "urakata_all"].includes(role)) return true;
    if (!role.startsWith("lmc_limit_")) return false;
    const expiresAt = Number.parseInt(role.replace("lmc_limit_", ""), 10);
    return Number.isFinite(expiresAt) && expiresAt > Date.now();
  });
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
  const accessToken = typeof request.body?.accessToken === "string" ? request.body.accessToken : "";
  if ((!idToken && !accessToken) || idToken.length > 10000 || accessToken.length > 10000) {
    response.status(400).json({error: "invalid_line_token"});
    return;
  }

  try {
    let lineUserId = "";
    if (idToken) {
      const verificationResponse = await fetch("https://api.line.me/oauth2/v2.1/verify", {
        method: "POST",
        headers: {"Content-Type": "application/x-www-form-urlencoded"},
        body: new URLSearchParams({id_token: idToken, client_id: LINE_CHANNEL_ID}),
      });
      const lineIdentity = await verificationResponse.json();
      if (verificationResponse.ok && typeof lineIdentity.sub === "string") {
        lineUserId = lineIdentity.sub;
      } else {
        logger.warn("LINE ID token verification failed; trying access token", {
          status: verificationResponse.status,
          reason: lineIdentity.error || "unknown",
        });
      }
    }

    if (!lineUserId && accessToken) {
      const profileResponse = await fetch("https://api.line.me/v2/profile", {
        headers: {Authorization: `Bearer ${accessToken}`},
      });
      const lineProfile = await profileResponse.json();
      if (profileResponse.ok && typeof lineProfile.userId === "string") {
        lineUserId = lineProfile.userId;
      } else {
        logger.warn("LINE access token verification failed", {status: profileResponse.status});
      }
    }

    if (!lineUserId) {
      response.status(401).json({error: "line_verification_failed"});
      return;
    }

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

exports.createChatAuthorizationCode = onRequest({
  region: "asia-northeast1",
  memory: "256MiB",
  timeoutSeconds: 30,
  maxInstances: 10,
}, async (request, response) => {
  const origin = request.get("origin");
  if (origin === "https://lmc-mobile.sorairosystem.com") {
    response.set("Access-Control-Allow-Origin", origin);
    response.set("Vary", "Origin");
  }
  response.set("Access-Control-Allow-Headers", "Content-Type");
  response.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.set("Cache-Control", "no-store");
  if (request.method === "OPTIONS") {
    response.status(origin === "https://lmc-mobile.sorairosystem.com" ? 204 : 403).send("");
    return;
  }
  if (request.method !== "POST") {
    response.status(405).json({error: "method_not_allowed"});
    return;
  }
  if (origin !== "https://lmc-mobile.sorairosystem.com") {
    response.status(403).json({error: "origin_not_allowed"});
    return;
  }

  const {firebaseIdToken, clientId, redirectUri, codeChallenge, codeChallengeMethod} = request.body || {};
  if (typeof firebaseIdToken !== "string" || firebaseIdToken.length > 10000 ||
      clientId !== CHAT_CLIENT_ID || redirectUri !== CHAT_REDIRECT_URI ||
      codeChallengeMethod !== "S256" || !validPkceChallenge(codeChallenge)) {
    response.status(400).json({error: "invalid_request"});
    return;
  }

  try {
    const identity = await getAuth().verifyIdToken(firebaseIdToken, true);
    if (identity.line !== true || identity.registered !== true) {
      response.status(403).json({error: "registered_lmc_account_required"});
      return;
    }
    const userSnapshot = await db.doc(`users/${identity.uid}`).get();
    const profile = userSnapshot.exists ? chatProfile(identity.uid, userSnapshot.data()) : null;
    if (!profile?.chatAccess) {
      response.status(403).json({error: "chat_access_denied"});
      return;
    }
    const code = randomBytes(32).toString("base64url");
    const codeHash = sha256Base64Url(code);
    await db.doc(`chatAuthorizationCodes/${codeHash}`).create({
      uid: identity.uid,
      clientId,
      redirectUri,
      codeChallenge,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 60_000),
    });
    response.status(200).json({code});
  } catch (error) {
    logger.warn("Chat authorization code creation failed", {code: error.code || "unknown"});
    response.status(401).json({error: "authentication_failed"});
  }
});

exports.lmcChatApi = onRequest({
  region: "asia-northeast1",
  memory: "256MiB",
  timeoutSeconds: 30,
  maxInstances: 10,
  secrets: [chatApiToken],
}, async (request, response) => {
  response.set("Cache-Control", "no-store");
  response.set("Content-Type", "application/json; charset=utf-8");
  const suppliedToken = (request.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!safeEqual(suppliedToken, chatApiToken.value())) {
    response.status(401).json({error: "unauthorized"});
    return;
  }

  try {
    if (request.method === "POST" && request.path === "/auth/chat/exchange") {
      const {code, codeVerifier, redirectUri, clientId} = request.body || {};
      if (typeof code !== "string" || code.length > 128 || !validPkceVerifier(codeVerifier) ||
          clientId !== CHAT_CLIENT_ID || redirectUri !== CHAT_REDIRECT_URI) {
        response.status(400).json({error: "invalid_request"});
        return;
      }
      const codeRef = db.doc(`chatAuthorizationCodes/${sha256Base64Url(code)}`);
      const uid = await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(codeRef);
        if (!snapshot.exists || snapshot.get("clientId") !== clientId ||
            snapshot.get("redirectUri") !== redirectUri ||
            snapshot.get("expiresAt")?.toMillis() < Date.now() ||
            !safeEqual(sha256Base64Url(codeVerifier), snapshot.get("codeChallenge"))) {
          throw new Error("invalid_authorization_code");
        }
        transaction.delete(codeRef);
        return snapshot.get("uid");
      });
      const userSnapshot = await db.doc(`users/${uid}`).get();
      const profile = userSnapshot.exists ? chatProfile(uid, userSnapshot.data()) : null;
      if (!profile?.chatAccess) {
        response.status(403).json({error: "chat_access_denied"});
        return;
      }
      response.status(200).json(profile);
      return;
    }

    const match = request.method === "GET" ? request.path.match(/^\/users\/([A-Za-z0-9_-]{1,128})$/) : null;
    if (match) {
      const userSnapshot = await db.doc(`users/${match[1]}`).get();
      const profile = userSnapshot.exists ? chatProfile(match[1], userSnapshot.data()) : null;
      if (!profile?.chatAccess) {
        response.status(404).json({error: "user_not_found"});
        return;
      }
      response.status(200).json(profile);
      return;
    }
    response.status(404).json({error: "not_found"});
  } catch (error) {
    if (error.message === "invalid_authorization_code") {
      response.status(401).json({error: "invalid_authorization_code"});
      return;
    }
    logger.error("LMC chat API failed", {message: error.message});
    response.status(500).json({error: "internal_error"});
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
