"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {spawn} = require("node:child_process");
const {createHash} = require("node:crypto");
const {getFirestore, Timestamp, FieldValue} = require("firebase-admin/firestore");
const {logger} = require("firebase-functions");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {onDocumentWritten} = require("firebase-functions/v2/firestore");
const {defineSecret} = require("firebase-functions/params");

const lineMessagingChannelAccessToken = defineSecret("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN");
const RICH_MENU_WIDTH = 2500;
const RICH_MENU_HEIGHT = 1686;
const LINE_IMAGE_LIMIT = 1024 * 1024;
const LIFF_BASE_URL = "https://liff.line.me/2008162165-vVODNp12";
const FONT_REGULAR_PATH = path.join(__dirname, "assets", "fonts", "LINESeedJP-Regular.ttf");
const FONT_BOLD_PATH = path.join(__dirname, "assets", "fonts", "LINESeedJP-Bold.ttf");
const ASSIGNMENT_COLLECTION = "lineRichMenuAssignments";
const MAX_UPCOMING_BOOKINGS = 500;
const MAX_MENU_CHANGES_PER_SYNC = 75;
const LEASE_MILLISECONDS = 2 * 60 * 1000;
const UNAVAILABLE_RETRY_MILLISECONDS = 24 * 60 * 60 * 1000;
const CREATE_TOKEN_CAPACITY = 70;
const CREATE_TOKEN_REFILL_MILLISECONDS = 60 * 60 * 1000;
const CREATE_RATE_LIMIT_REF = "system/lineRichMenuCreateRateLimit";
const RENDER_WORKER_PATH = path.join(__dirname, "rich-menu-render-worker.js");

// SVG path data from Google Material Symbols Rounded (Apache License 2.0).
const MATERIAL_SYMBOLS = Object.freeze({
  home: "M220-180h150v-220q0-12.75 8.63-21.38Q387.25-430 400-430h160q12.75 0 21.38 8.62Q590-412.75 590-400v220h150v-390L480-765 220-570v390Zm-60 0v-390q0-14.25 6.38-27 6.37-12.75 17.62-21l260-195q15.68-12 35.84-12Q500-825 516-813l260 195q11.25 8.25 17.63 21 6.37 12.75 6.37 27v390q0 24.75-17.62 42.37Q764.75-120 740-120H560q-12.75 0-21.37-8.63Q530-137.25 530-150v-220H430v220q0 12.75-8.62 21.37Q412.75-120 400-120H220q-24.75 0-42.37-17.63Q160-155.25 160-180Zm320-293Z",
  calendar_month: "M180-80q-24 0-42-18t-18-42v-620q0-24 18-42t42-18h65v-28q0-13.6 9-22.8 9-9.2 23.02-9.2t23.5 9.2Q310-861.6 310-848v28h340v-28q0-13.6 9-22.8 9-9.2 23.02-9.2t23.5 9.2Q715-861.6 715-848v28h65q24 0 42 18t18 42v620q0 24-18 42t-42 18H180Zm0-60h600v-430H180v430Zm0-490h600v-130H180v130Zm0 0v-130 130Zm300 230q-17 0-28.5-11.5T440-440q0-17 11.5-28.5T480-480q17 0 28.5 11.5T520-440q0 17-11.5 28.5T480-400Zm-188.5-11.5Q280-423 280-440t11.5-28.5Q303-480 320-480t28.5 11.5Q360-457 360-440t-11.5 28.5Q337-400 320-400t-28.5-11.5ZM640-400q-17 0-28.5-11.5T600-440q0-17 11.5-28.5T640-480q17 0 28.5 11.5T680-440q0 17-11.5 28.5T640-400ZM480-240q-17 0-28.5-11.5T440-280q0-17 11.5-28.5T480-320q17 0 28.5 11.5T520-280q0 17-11.5 28.5T480-240Zm-188.5-11.5Q280-263 280-280t11.5-28.5Q303-320 320-320t28.5 11.5Q360-297 360-280t-11.5 28.5Q337-240 320-240t-28.5-11.5ZM640-240q-17 0-28.5-11.5T600-280q0-17 11.5-28.5T640-320q17 0 28.5 11.5T680-280q0 17-11.5 28.5T640-240Z",
  description: "M349-250h262q12.75 0 21.38-8.68 8.62-8.67 8.62-21.5 0-12.82-8.62-21.32-8.63-8.5-21.38-8.5H349q-12.75 0-21.37 8.68-8.63 8.67-8.63 21.5 0 12.82 8.63 21.32 8.62 8.5 21.37 8.5Zm0-170h262q12.75 0 21.38-8.68 8.62-8.67 8.62-21.5 0-12.82-8.62-21.32-8.63-8.5-21.38-8.5H349q-12.75 0-21.37 8.68-8.63 8.67-8.63 21.5 0 12.82 8.63 21.32 8.62 8.5 21.37 8.5ZM220-80q-24 0-42-18t-18-42v-680q0-24 18-42t42-18h336q12.44 0 23.72 5T599-862l183 183q8 8 13 19.28 5 11.28 5 23.72v496q0 24-18 42t-42 18H220Zm331-584v-156H220v680h520v-494H581q-12.75 0-21.37-8.63Q551-651.25 551-664ZM220-820v186-186 680-680Z",
  settings: "M421-80q-14 0-25-9t-13-23l-15-94q-19-7-40-19t-37-25l-86 40q-14 6-28 1.5T155-226L97-330q-8-13-4.5-27t15.5-23l80-59q-2-9-2.5-20.5T185-480q0-9 .5-20.5T188-521l-80-59q-12-9-15.5-23t4.5-27l58-104q8-13 22-17.5t28 1.5l86 40q16-13 37-25t40-18l15-95q2-14 13-23t25-9h118q14 0 25 9t13 23l15 94q19 7 40.5 18.5T669-710l86-40q14-6 27.5-1.5T804-734l59 104q8 13 4.5 27.5T852-580l-80 57q2 10 2.5 21.5t.5 21.5q0 10-.5 21t-2.5 21l80 58q12 8 15.5 22.5T863-330l-58 104q-8 13-22 17.5t-28-1.5l-86-40q-16 13-36.5 25.5T592-206l-15 94q-2 14-13 23t-25 9H421Zm15-60h88l14-112q33-8 62.5-25t53.5-41l106 46 40-72-94-69q4-17 6.5-33.5T715-480q0-17-2-33.5t-7-33.5l94-69-40-72-106 46q-23-26-52-43.5T538-708l-14-112h-88l-14 112q-34 7-63.5 24T306-642l-106-46-40 72 94 69q-4 17-6.5 33.5T245-480q0 17 2.5 33.5T254-413l-94 69 40 72 106-46q24 24 53.5 41t62.5 25l14 112Zm44-210q54 0 92-38t38-92q0-54-38-92t-92-38q-54 0-92 38t-38 92q0 54 38 92t92 38Zm0-130Z",
  account_circle: "M222-255q63-44 125-67.5T480-346q71 0 133.5 23.5T739-255q44-54 62.5-109T820-480q0-145-97.5-242.5T480-820q-145 0-242.5 97.5T140-480q0 61 19 116t63 109Zm160.5-234.5Q343-529 343-587t39.5-97.5Q422-724 480-724t97.5 39.5Q617-645 617-587t-39.5 97.5Q538-450 480-450t-97.5-39.5ZM480-80q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 31.5-155.5t86-127Q252-817 325-848.5T480-880q83 0 155.5 31.5t127 86q54.5 54.5 86 127T880-480q0 82-31.5 155t-86 127.5q-54.5 54.5-127 86T480-80Zm107.5-76Q640-172 691-212q-51-36-104-55t-107-19q-54 0-107 19t-104 55q51 40 103.5 56T480-140q55 0 107.5-16Zm-52-375.5Q557-553 557-587t-21.5-55.5Q514-664 480-664t-55.5 21.5Q403-621 403-587t21.5 55.5Q446-510 480-510t55.5-21.5ZM480-587Zm0 374Z",
});

class LineApiError extends Error {
  constructor(status, operation, detail) {
    super(`LINE ${operation} failed (${status})`);
    this.name = "LineApiError";
    this.status = status;
    this.operation = operation;
    this.detail = detail;
  }
}

function text(value, maximum = 80) {
  return Array.from(String(value || "").trim()).slice(0, maximum).join("");
}

function escapeXml(value) {
  return text(value, 160)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
}

function dateOf(value) {
  if (value instanceof Date) return value;
  if (value?.toDate) return value.toDate();
  if (typeof value === "string" || typeof value === "number") {
    const result = new Date(value);
    return Number.isNaN(result.getTime()) ? null : result;
  }
  return null;
}

function partLabel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ({vocal: "Vo", guitar: "Gt", bass: "Ba", drums: "Dr", drum: "Dr", keyboard: "Key", other: "Other"})[normalized] || text(value, 12);
}

function accountSubtitle(user = {}) {
  const parts = [partLabel(user.part || user.partName), user.year || user.grade ? `${text(user.year || user.grade, 8)}年` : ""];
  return parts.filter(Boolean).join(" / ") || "プロフィールを確認";
}

function memberBandIds(uid, bands) {
  return new Set((bands || []).filter((band) => Array.isArray(band.memberIds) && band.memberIds.includes(uid)).map((band) => band.id));
}

function pickNextBooking(uid, bands, bookings, now = new Date()) {
  const ids = memberBandIds(uid, bands);
  const nowTime = now.getTime();
  return (bookings || []).filter((booking) => {
    const start = dateOf(booking.startTime);
    const end = dateOf(booking.endTime);
    if (!start || !end || end.getTime() <= nowTime || booking.type === "event" || booking.status !== "confirmed") return false;
    return ids.has(booking.bandId) || (booking.isCustomBand === true && booking.creatorId === uid);
  }).sort((left, right) => dateOf(left.startTime) - dateOf(right.startTime))[0] || null;
}

function formatBooking(booking, settings = {}) {
  if (!booking) return null;
  const start = dateOf(booking.startTime);
  const end = dateOf(booking.endTime);
  const date = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", weekday: "short",
  }).format(start);
  const timeFormatter = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false,
  });
  return {
    id: text(booking.id, 160),
    bandName: text(booking.bandName || "名称未設定", 24),
    date,
    time: `${timeFormatter.format(start)}–${timeFormatter.format(end)}`,
    place: text(booking.roomName || booking.location || settings.bookingRoomName || "部室", 20),
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  };
}

function richMenuContext(uid, user, bands, bookings, settings, now = new Date()) {
  const nextBooking = formatBooking(pickNextBooking(uid, bands, bookings, now), settings);
  return {
    uid,
    name: text(user?.name || user?.lineDisplayName || user?.displayName || "LMCユーザー", 20),
    account: accountSubtitle(user),
    icon: /^https:\/\//.test(user?.icon || user?.pictureUrl || "") ? (user.icon || user.pictureUrl) : "",
    nextBooking,
  };
}

function menuSignature(context) {
  return createHash("sha256").update(JSON.stringify({version: 2, ...context})).digest("hex");
}

function materialIcon(name, x, y, size, fill = "#111B4C") {
  const iconPath = MATERIAL_SYMBOLS[name];
  if (!iconPath) return "";
  return `<g transform="translate(${x} ${y + size}) scale(${size / 960})"><path fill="${fill}" d="${iconPath}"/></g>`;
}

let regularFontBase64 = "";
let boldFontBase64 = "";
function embeddedFonts() {
  if (!regularFontBase64) regularFontBase64 = fs.readFileSync(FONT_REGULAR_PATH).toString("base64");
  if (!boldFontBase64) boldFontBase64 = fs.readFileSync(FONT_BOLD_PATH).toString("base64");
  return {regular: regularFontBase64, bold: boldFontBase64};
}

async function avatarDataUrl(url, sharpModule) {
  if (!url) return "";
  try {
    const response = await fetch(url, {signal: AbortSignal.timeout(5000)});
    const declaredLength = Number(response.headers.get("content-length")) || 0;
    if (!response.ok || declaredLength > 3 * 1024 * 1024) return "";
    const source = Buffer.from(await response.arrayBuffer());
    if (source.length > 3 * 1024 * 1024) return "";
    const normalized = await sharpModule(source).resize(320, 320, {fit: "cover"}).png().toBuffer();
    return `data:image/png;base64,${normalized.toString("base64")}`;
  } catch (error) {
    logger.warn("Rich menu avatar download failed", {message: error.message});
    return "";
  }
}

function menuSvg(context, avatarUrl = "") {
  const fonts = embeddedFonts();
  const booking = context.nextBooking;
  const scheduleDate = booking ? `${escapeXml(booking.date)} ${escapeXml(booking.time)}` : "予定はありません";
  const scheduleBand = booking ? escapeXml(booking.bandName) : "予約ページで予定を確認できます";
  const schedulePlace = booking ? escapeXml(booking.place) : "";
  const avatar = avatarUrl ?
    `<image href="${avatarUrl}" x="1055" y="1120" width="280" height="280" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatarClip)"/>` :
    materialIcon("account_circle", 1040, 1105, 310);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${RICH_MENU_WIDTH}" height="${RICH_MENU_HEIGHT}" viewBox="0 0 ${RICH_MENU_WIDTH} ${RICH_MENU_HEIGHT}">
    <defs>
      <style>
        @font-face{font-family:LMCJapanese;src:url(data:font/ttf;base64,${fonts.regular}) format('truetype');font-weight:400}
        @font-face{font-family:LMCJapanese;src:url(data:font/ttf;base64,${fonts.bold}) format('truetype');font-weight:700}
        text{font-family:LMCJapanese,"Hiragino Sans","Yu Gothic",sans-serif;fill:#111B4C}
      </style>
      <linearGradient id="home" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#FFF8E8"/><stop offset="1" stop-color="#FFEFC8"/></linearGradient>
      <linearGradient id="schedule" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#F5F0FF"/><stop offset="1" stop-color="#E9DEFF"/></linearGradient>
      <linearGradient id="cue" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#EDF8FF"/><stop offset="1" stop-color="#D8EEFF"/></linearGradient>
      <linearGradient id="account" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#F9F2FF"/><stop offset="1" stop-color="#EEDFFF"/></linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="12" stdDeviation="20" flood-color="#7065A0" flood-opacity="0.14"/></filter>
      <clipPath id="avatarClip"><circle cx="1195" cy="1260" r="140"/></clipPath>
    </defs>
    <rect width="2500" height="1686" fill="#F4F2FC"/>
    <g filter="url(#shadow)">
      <rect x="32" y="32" width="769" height="779" rx="70" fill="url(#home)"/>
      <rect x="865" y="32" width="1603" height="779" rx="70" fill="url(#schedule)"/>
      <rect x="32" y="875" width="769" height="779" rx="70" fill="url(#cue)"/>
      <rect x="865" y="875" width="1603" height="779" rx="70" fill="url(#account)"/>
    </g>
    ${materialIcon("home", 242, 170, 350)}
    <text x="416" y="670" text-anchor="middle" font-size="112" font-weight="750">ホーム</text>
    ${materialIcon("calendar_month", 1015, 190, 330)}
    <rect x="1395" y="170" width="850" height="100" rx="50" fill="#A989E8" opacity="0.18"/>
    <text x="1430" y="250" font-size="94" font-weight="780">次の合わせ予定</text>
    <text x="1430" y="410" font-size="78" font-weight="700">${scheduleDate}</text>
    <text x="1430" y="545" font-size="72" font-weight="700">${scheduleBand}</text>
    ${schedulePlace ? `<text x="1430" y="660" font-size="58" font-weight="520" fill="#515878">${schedulePlace}</text>` : ""}
    ${materialIcon("description", 265, 1018, 300)}
    <text x="416" y="1480" text-anchor="middle" font-size="91" font-weight="750">CUEシート</text>
    <text x="1667" y="1038" text-anchor="middle" font-size="78" font-weight="750">マイアカウント</text>
    ${avatar}
    <text x="1425" y="1215" font-size="72" font-weight="750">${escapeXml(context.name)}</text>
    <text x="1425" y="1325" font-size="54" font-weight="520" fill="#515878">${escapeXml(context.account)}</text>
    <rect x="1425" y="1405" width="720" height="90" rx="45" fill="#9A7DE0" opacity="0.16"/>
    <text x="1785" y="1468" text-anchor="middle" font-size="44" font-weight="650" fill="#5F4DA1">アカウント情報を見る</text>
  </svg>`;
}

async function renderRichMenuImage(context) {
  const sharp = require("sharp");
  // Cloud Functions のメモリ使用量を抑えるため、libvips のワーカーと
  // メモリキャッシュを最小化する。バッチ側も画像を1枚ずつ生成する。
  sharp.concurrency(1);
  sharp.cache(false);
  const avatar = await avatarDataUrl(context.icon, sharp);
  const svg = menuSvg(context, avatar);
  for (const quality of [86, 80, 72, 64]) {
    const image = await sharp(Buffer.from(svg), {limitInputPixels: false})
        .jpeg({quality, chromaSubsampling: "4:2:0", mozjpeg: true})
        .toBuffer();
    if (image.length <= LINE_IMAGE_LIMIT) return image;
  }
  throw new Error("Rich menu image exceeds the LINE 1 MB limit");
}

function renderRichMenuImageIsolated(context) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [RENDER_WORKER_PATH], {stdio: ["pipe", "pipe", "pipe"]});
    const output = [];
    const errors = [];
    let outputBytes = 0;
    let settled = false;
    const finish = (error, image) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(image);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error("Rich menu renderer timed out"));
    }, 60_000);
    child.stdout.on("data", (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > LINE_IMAGE_LIMIT) {
        child.kill("SIGKILL");
        finish(new Error("Rich menu renderer exceeded the LINE image limit"));
        return;
      }
      output.push(chunk);
    });
    child.stderr.on("data", (chunk) => errors.push(chunk));
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (code !== 0) {
        const detail = Buffer.concat(errors).toString("utf8").trim().slice(0, 500);
        finish(new Error(`Rich menu renderer failed (${code})${detail ? `: ${detail}` : ""}`));
        return;
      }
      finish(null, Buffer.concat(output));
    });
    child.stdin.end(JSON.stringify(context));
  });
}

function richMenuDefinition(uid, signature) {
  return {
    size: {width: RICH_MENU_WIDTH, height: RICH_MENU_HEIGHT},
    selected: true,
    name: `LMC ${uid.slice(-10)} ${signature.slice(0, 10)}`,
    chatBarText: "メニュー",
    areas: [
      {bounds: {x: 0, y: 0, width: 833, height: 843}, action: {type: "uri", label: "ホーム", uri: `${LIFF_BASE_URL}/`}},
      {bounds: {x: 833, y: 0, width: 1667, height: 843}, action: {type: "uri", label: "次の合わせ予定", uri: `${LIFF_BASE_URL}/booking.html`}},
      {bounds: {x: 0, y: 843, width: 833, height: 843}, action: {type: "uri", label: "CUEシート", uri: `${LIFF_BASE_URL}/?action=cue`}},
      {bounds: {x: 833, y: 843, width: 1667, height: 843}, action: {type: "uri", label: "マイアカウント", uri: `${LIFF_BASE_URL}/mypage.html`}},
    ],
  };
}

async function lineRequest(token, operation, endpoint, options = {}) {
  const response = await fetch(`${options.baseUrl || "https://api.line.me"}${endpoint}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.contentType ? {"Content-Type": options.contentType} : {}),
    },
    body: options.body,
  });
  const responseText = await response.text();
  if (!response.ok) throw new LineApiError(response.status, operation, responseText.slice(0, 1000));
  return responseText ? JSON.parse(responseText) : {};
}

async function createAndLinkRichMenu(token, uid, signature, image) {
  const created = await lineRequest(token, "rich-menu creation", "/v2/bot/richmenu", {
    method: "POST", contentType: "application/json", body: JSON.stringify(richMenuDefinition(uid, signature)),
  });
  const richMenuId = created.richMenuId;
  try {
    await lineRequest(token, "rich-menu image upload", `/v2/bot/richmenu/${encodeURIComponent(richMenuId)}/content`, {
      method: "POST", contentType: "image/jpeg", body: image, baseUrl: "https://api-data.line.me",
    });
    await lineRequest(token, "rich-menu link", `/v2/bot/user/${encodeURIComponent(uid)}/richmenu/${encodeURIComponent(richMenuId)}`, {method: "POST"});
    return richMenuId;
  } catch (error) {
    await lineRequest(token, "rich-menu cleanup", `/v2/bot/richmenu/${encodeURIComponent(richMenuId)}`, {method: "DELETE"}).catch(() => {});
    throw error;
  }
}

async function deleteRichMenu(token, richMenuId) {
  if (!richMenuId) return;
  await lineRequest(token, "old rich-menu deletion", `/v2/bot/richmenu/${encodeURIComponent(richMenuId)}`, {method: "DELETE"}).catch((error) => {
    if (error.status !== 404) logger.warn("Old rich menu could not be deleted", {richMenuId, status: error.status});
  });
}

async function loadRichMenuContext(db, uid, now = new Date(), suppliedUser = null) {
  const userRef = db.doc(`users/${uid}`);
  const [userSnapshot, bandSnapshots, bookingSnapshots, settingsSnapshot] = await Promise.all([
    suppliedUser ? Promise.resolve(null) : userRef.get(),
    db.collection("bands").where("memberIds", "array-contains", uid).get(),
    db.collection("bookings").where("endTime", ">=", Timestamp.fromDate(now)).orderBy("endTime").limit(MAX_UPCOMING_BOOKINGS).get(),
    db.doc("system/settings").get(),
  ]);
  const user = suppliedUser || (userSnapshot?.exists ? userSnapshot.data() : null);
  const bands = bandSnapshots.docs.map((snapshot) => ({id: snapshot.id, ...snapshot.data()}));
  const bookings = bookingSnapshots.docs.map((snapshot) => ({id: snapshot.id, ...snapshot.data()}));
  return {user, context: user ? richMenuContext(uid, user, bands, bookings, settingsSnapshot.data() || {}, now) : null};
}

async function acquireLease(db, uid, signature) {
  const ref = db.doc(`${ASSIGNMENT_COLLECTION}/${uid}`);
  const now = Date.now();
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data() || {};
    if (data.signature === signature && data.richMenuId) return {ref, skip: true, data};
    if (data.retryAfter?.toMillis?.() > now) return {ref, skip: true, unavailable: true, data};
    if (data.leaseUntil?.toMillis?.() > now) return {ref, skip: true, leased: true, data};
    transaction.set(ref, {
      leaseUntil: Timestamp.fromMillis(now + LEASE_MILLISECONDS),
      requestedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    return {ref, skip: false, data};
  });
}

function refilledCreateTokens(data = {}, now = Date.now()) {
  const stored = Number.isFinite(data.tokens) ? data.tokens : CREATE_TOKEN_CAPACITY;
  const refilledAt = data.refilledAt?.toMillis?.() || now;
  const elapsed = Math.max(0, now - refilledAt);
  return Math.min(CREATE_TOKEN_CAPACITY, stored + (elapsed * CREATE_TOKEN_CAPACITY / CREATE_TOKEN_REFILL_MILLISECONDS));
}

async function acquireCreatePermit(db) {
  const ref = db.doc(CREATE_RATE_LIMIT_REF);
  const now = Date.now();
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const tokens = refilledCreateTokens(snapshot.data() || {}, now);
    const allowed = tokens >= 1;
    transaction.set(ref, {
      tokens: allowed ? tokens - 1 : tokens,
      refilledAt: Timestamp.fromMillis(now),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    return allowed;
  });
}

async function refreshRichMenuForUser(db, token, uid, options = {}) {
  const {user, context} = await loadRichMenuContext(db, uid, options.now || new Date(), options.user || null);
  const assignmentRef = db.doc(`${ASSIGNMENT_COLLECTION}/${uid}`);
  if (!user || user.disabled === true || user.active === false) {
    const previous = await assignmentRef.get();
    const previousId = previous.get("richMenuId");
    if (previousId) {
      await lineRequest(token, "rich-menu unlink", `/v2/bot/user/${encodeURIComponent(uid)}/richmenu`, {method: "DELETE"}).catch(() => {});
      await deleteRichMenu(token, previousId);
    }
    await assignmentRef.delete().catch(() => {});
    return {changed: Boolean(previousId), removed: true};
  }

  const signature = menuSignature(context);
  const lease = await acquireLease(db, uid, signature);
  if (lease.skip) return {changed: false, skipped: true, leased: lease.leased === true, unavailable: lease.unavailable === true};
  if (!await acquireCreatePermit(db)) {
    await lease.ref.set({leaseUntil: FieldValue.delete()}, {merge: true});
    return {changed: false, skipped: true, rateLimited: true};
  }
  try {
    const image = await renderRichMenuImageIsolated(context);
    const richMenuId = await createAndLinkRichMenu(token, uid, signature, image);
    await lease.ref.set({
      signature,
      richMenuId,
      nextBookingId: context.nextBooking?.id || null,
      nextBookingEnd: context.nextBooking ? Timestamp.fromDate(new Date(context.nextBooking.endTime)) : null,
      imageBytes: image.length,
      lastError: FieldValue.delete(),
      retryAfter: FieldValue.delete(),
      leaseUntil: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    await deleteRichMenu(token, lease.data.richMenuId);
    return {changed: true, richMenuId, imageBytes: image.length};
  } catch (error) {
    const unavailable = error instanceof LineApiError && [400, 404].includes(error.status) && error.operation === "rich-menu link";
    await lease.ref.set({
      leaseUntil: FieldValue.delete(),
      lastError: text(error.message, 300),
      lastErrorAt: FieldValue.serverTimestamp(),
      retryAfter: unavailable ? Timestamp.fromMillis(Date.now() + UNAVAILABLE_RETRY_MILLISECONDS) : FieldValue.delete(),
    }, {merge: true});
    // A user who hasn't added the Official Account can't be linked. Retry at most once per day.
    if (unavailable) {
      logger.warn("Rich menu user link skipped", {uid, status: error.status});
      return {changed: false, unavailable: true};
    }
    throw error;
  }
}

async function eachWithConcurrency(items, concurrency, task) {
  let cursor = 0;
  const results = [];
  const workers = Array.from({length: Math.min(concurrency, items.length)}, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function refreshUsers(db, token, uids) {
  const unique = [...new Set(uids.filter(Boolean))];
  return eachWithConcurrency(unique, 1, async (uid) => {
    try {
      return await refreshRichMenuForUser(db, token, uid);
    } catch (error) {
      logger.error("Rich menu refresh failed", {uid, message: error.message, operation: error.operation, status: error.status});
      return {changed: false, error: true};
    }
  });
}

async function syncAllRichMenus(db, token) {
  const users = await db.collection("users").get();
  let changes = 0;
  let skipped = 0;
  let errors = 0;
  let rateLimited = false;
  await eachWithConcurrency(users.docs, 1, async (snapshot) => {
    if (changes >= MAX_MENU_CHANGES_PER_SYNC || rateLimited) {
      skipped += 1;
      return;
    }
    try {
      const result = await refreshRichMenuForUser(db, token, snapshot.id, {user: snapshot.data()});
      if (result.changed) changes += 1;
      if (result.rateLimited) rateLimited = true;
    } catch (error) {
      errors += 1;
      logger.error("Scheduled rich menu sync failed", {uid: snapshot.id, message: error.message, operation: error.operation, status: error.status});
    }
  });
  logger.info("Rich menu sync completed", {users: users.size, changes, skipped, errors, rateLimited});
  return {users: users.size, changes, skipped, errors, rateLimited};
}

function relevantUserState(data = {}) {
  return JSON.stringify({
    name: data.name || data.lineDisplayName || data.displayName || "",
    icon: data.icon || data.pictureUrl || "",
    part: data.part || data.partName || "",
    year: data.year || data.grade || "",
    disabled: data.disabled === true,
    active: data.active === false ? false : true,
  });
}

function relevantBandState(data = {}) {
  return JSON.stringify({name: data.name || "", memberIds: [...(Array.isArray(data.memberIds) ? data.memberIds : [])].sort()});
}

exports.syncLineRichMenus = onSchedule({
  schedule: "17 * * * *",
  timeZone: "Asia/Tokyo",
  region: "asia-northeast1",
  memory: "1GiB",
  timeoutSeconds: 540,
  maxInstances: 1,
  concurrency: 1,
  retryCount: 0,
  secrets: [lineMessagingChannelAccessToken],
}, async () => syncAllRichMenus(getFirestore(), lineMessagingChannelAccessToken.value()));

exports.syncLineRichMenuForUser = onDocumentWritten({
  document: "users/{userId}",
  region: "asia-northeast1",
  memory: "1GiB",
  timeoutSeconds: 180,
  maxInstances: 1,
  concurrency: 1,
  secrets: [lineMessagingChannelAccessToken],
}, async (event) => {
  const before = event.data?.before?.exists ? event.data.before.data() : {};
  const after = event.data?.after?.exists ? event.data.after.data() : {};
  if (event.data?.before?.exists && event.data?.after?.exists && relevantUserState(before) === relevantUserState(after)) return;
  await refreshUsers(getFirestore(), lineMessagingChannelAccessToken.value(), [event.params.userId]);
});

exports.syncLineRichMenusForBooking = onDocumentWritten({
  document: "bookings/{bookingId}",
  region: "asia-northeast1",
  memory: "1GiB",
  timeoutSeconds: 180,
  maxInstances: 1,
  concurrency: 1,
  secrets: [lineMessagingChannelAccessToken],
}, async (event) => {
  const before = event.data?.before?.exists ? event.data.before.data() : {};
  const after = event.data?.after?.exists ? event.data.after.data() : {};
  const bandIds = [...new Set([before.bandId, after.bandId].filter(Boolean))];
  const memberIds = [before.creatorId, after.creatorId].filter(Boolean);
  const db = getFirestore();
  const bands = await Promise.all(bandIds.map((bandId) => db.doc(`bands/${bandId}`).get()));
  for (const band of bands) if (band.exists && Array.isArray(band.get("memberIds"))) memberIds.push(...band.get("memberIds"));
  await refreshUsers(db, lineMessagingChannelAccessToken.value(), memberIds);
});

exports.syncLineRichMenusForBand = onDocumentWritten({
  document: "bands/{bandId}",
  region: "asia-northeast1",
  memory: "1GiB",
  timeoutSeconds: 180,
  maxInstances: 1,
  concurrency: 1,
  secrets: [lineMessagingChannelAccessToken],
}, async (event) => {
  const before = event.data?.before?.exists ? event.data.before.data() : {};
  const after = event.data?.after?.exists ? event.data.after.data() : {};
  if (relevantBandState(before) === relevantBandState(after)) return;
  const uids = [...(before.memberIds || []), ...(after.memberIds || [])];
  await refreshUsers(getFirestore(), lineMessagingChannelAccessToken.value(), uids);
});

exports._test = {
  accountSubtitle,
  dateOf,
  formatBooking,
  menuSignature,
  menuSvg,
  partLabel,
  pickNextBooking,
  relevantBandState,
  relevantUserState,
  refilledCreateTokens,
  richMenuContext,
  richMenuDefinition,
  renderRichMenuImage,
  renderRichMenuImageIsolated,
};
