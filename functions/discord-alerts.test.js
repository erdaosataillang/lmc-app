"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {_test} = require("./discord-alerts");

test("Discord通知からトークン・メール・電話番号・クエリを除去する", () => {
  const alert = _test.normalizeAlert({
    source: "client",
    kind: "error",
    page: "https://lmc-mobile.sorairosystem.com/booking.html?code=secret",
    message: "Bearer abc.def mail test@example.com phone 090-1234-5678 &token=secret",
  });
  assert.equal(alert.page, "/booking.html");
  assert.doesNotMatch(alert.message, /abc\.def|test@example|090-1234-5678|token=secret/);
  assert.match(alert.message, /\[REDACTED\]|\[EMAIL\]|\[PHONE\]/);
});

test("同じ障害を10分間まとめる", () => {
  const fingerprint = `test-${Date.now()}-${Math.random()}`;
  assert.deepEqual(_test.claimAlert(fingerprint, 1000), {send: true, suppressed: 0});
  assert.deepEqual(_test.claimAlert(fingerprint, 2000), {send: false, suppressed: 1});
  assert.deepEqual(_test.claimAlert(fingerprint, 601001), {send: true, suppressed: 1});
});

test("Discordでメンションを発生させない", () => {
  const alert = _test.normalizeAlert({message: "@everyone test"});
  const payload = _test.discordPayload(alert, 0);
  assert.deepEqual(payload.allowed_mentions, {parse: []});
  assert.ok(payload.embeds[0].fields.length >= 3);
});
