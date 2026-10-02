"use strict";

const {createHash, timingSafeEqual} = require("node:crypto");

const CHAT_CLIENT_ID = "backstage-chat";
const CHAT_REDIRECT_URI = "https://lmc-backstage-chat.web.app/";

function sha256Base64Url(value) {
  return createHash("sha256").update(value).digest("base64url");
}

function validPkceChallenge(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

function validPkceVerifier(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43,128}$/.test(value);
}

function safeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function chatProfile(id, userData = {}) {
  const displayName = typeof userData.name === "string" ? userData.name.trim() : "";
  if (!displayName || displayName.length > 80) return null;
  const departmentSource = userData.part || userData.faculty || "";
  const department = typeof departmentSource === "string" ? departmentSource.trim().slice(0, 80) : "";
  const blocked = userData.chatAccess === false || userData.disabled === true || userData.active === false;
  return {id, displayName, department, chatAccess: !blocked};
}

module.exports = {
  CHAT_CLIENT_ID,
  CHAT_REDIRECT_URI,
  chatProfile,
  safeEqual,
  sha256Base64Url,
  validPkceChallenge,
  validPkceVerifier,
};
