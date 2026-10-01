"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  chatProfile,
  safeEqual,
  sha256Base64Url,
  validPkceChallenge,
  validPkceVerifier,
} = require("./chat-auth");

test("PKCE S256 uses base64url without padding", () => {
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  assert.equal(sha256Base64Url(verifier), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  assert.equal(validPkceVerifier(verifier), true);
  assert.equal(validPkceChallenge(sha256Base64Url(verifier)), true);
  assert.equal(safeEqual("same", "same"), true);
  assert.equal(safeEqual("same", "different"), false);
});

test("chat profile exposes only approved fields", () => {
  assert.deepEqual(chatProfile("U123", {name: " 山田 太郎 ", part: "照明", tel: "secret"}), {
    id: "U123", displayName: "山田 太郎", department: "照明", chatAccess: true,
  });
  assert.equal(chatProfile("U123", {name: ""}), null);
  assert.equal(chatProfile("U123", {name: "山田", chatAccess: false}).chatAccess, false);
});
