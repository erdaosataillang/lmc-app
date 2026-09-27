"use strict";

const {initializeApp} = require("firebase-admin/app");
const {FieldValue, Timestamp, getFirestore} = require("firebase-admin/firestore");
const {logger} = require("firebase-functions");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {
  calculateLottery,
  configuredHour,
  targetDateKey,
  tokyoDateParts,
  tokyoDayBounds,
} = require("./lottery");

initializeApp();
const db = getFirestore();

exports.runScheduledLottery = onSchedule({
  schedule: "0 * * * *",
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
  const bookingMode = settings.bookingMode || settings.reservationMode || "first_come";
  const nowInTokyo = tokyoDateParts(now);
  if (bookingMode !== "lottery" || lotteryConfig.mode !== "auto" ||
      nowInTokyo.hour !== configuredHour(lotteryConfig.time)) {
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
  const operationCount = 1 + result.assignments.length +
      result.assignments.reduce((sum, assignment) => sum + assignment.originalDocIds.length, 0);
  if (operationCount > 500) {
    throw new Error(`Lottery requires ${operationCount} writes; Firestore batch limit is 500`);
  }

  const batch = db.batch();
  batch.create(runRef, {
    targetDate: dateKey,
    status: result.candidateCount === 0 ? "no_candidates" : "completed",
    durationMinutes: result.duration,
    candidateCount: result.candidateCount,
    bandCount: result.bandCount,
    successCount: result.assignments.length,
    failedBandIds: result.failedBands.map((band) => band.id),
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
    for (const originalId of assignment.originalDocIds) {
      batch.delete(db.doc(`bookings/${originalId}`));
    }
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
