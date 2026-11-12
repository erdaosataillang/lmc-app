"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {_test} = require("./discord-alerts");

test("Discord通知は個人情報を表示し、認証情報とクエリだけを除去する", () => {
  const alert = _test.normalizeAlert({
    source: "client",
    kind: "error",
    page: "https://lmc-mobile.sorairosystem.com/booking.html?code=secret",
    message: "Bearer abc.def mail test@example.com phone 090-1234-5678 &token=secret",
  });
  assert.equal(alert.page, "/booking.html");
  assert.doesNotMatch(alert.message, /abc\.def|token=secret/);
  assert.match(alert.message, /test@example\.com|090-1234-5678|\[REDACTED\]/);
});

test("同じ障害を10分間まとめる", () => {
  const fingerprint = `test-${Date.now()}-${Math.random()}`;
  assert.deepEqual(_test.claimAlert(fingerprint, 1000), {send: true, suppressed: 0});
  assert.deepEqual(_test.claimAlert(fingerprint, 2000), {send: false, suppressed: 1});
  assert.deepEqual(_test.claimAlert(fingerprint, 601001), {send: true, suppressed: 1});
});

test("Discordでメンションを発生させない", () => {
  const alert = _test.normalizeAlert({
    message: "TypeError: value is not a function",
    uid: "U1234567890",
    userName: "山田太郎",
    userIcon: "https://example.com/avatar.png",
    environment: "LINE LIFFブラウザ",
    userAgent: "Mozilla/5.0 Line/15",
    viewport: "390 x 844 / DPR 3",
    online: true,
  });
  const payload = _test.discordPayload(alert, 0);
  assert.deepEqual(payload.allowed_mentions, {parse: []});
  assert.equal(payload.embeds[0].author.name, "山田太郎");
  assert.equal(payload.embeds[0].author.icon_url, "https://example.com/avatar.png");
  assert.match(payload.embeds[0].description, /想定と異なる形式/);
  assert.ok(payload.embeds[0].fields.some(field => field.name === "ユーザーID" && field.value === "U1234567890"));
  assert.ok(payload.embeds[0].fields.some(field => field.name === "発生環境" && field.value === "LINE LIFFブラウザ"));
});

test("運用ログは障害通知とは別の形式で個人と操作内容を表示する", () => {
  const payload = _test.activityPayload({
    kind: "lottery",
    description: "手動抽選の実行結果です。",
    uid: "U1234567890",
    userName: "山田太郎",
    userIcon: "https://example.com/avatar.png",
    fields: [
      {name: "実行方法", value: "手動", inline: true},
      {name: "対象日", value: "2026-11-20", inline: true},
    ],
  });
  assert.equal(payload.username, "LMC Activity Log");
  assert.deepEqual(payload.allowed_mentions, {parse: []});
  assert.equal(payload.embeds[0].title, "抽選を実行しました");
  assert.equal(payload.embeds[0].author.name, "山田太郎");
  assert.ok(payload.embeds[0].fields.some((field) => field.name === "実行方法" && field.value === "手動"));
  assert.ok(payload.embeds[0].fields.some((field) => field.name === "ユーザーID" && field.value === "U1234567890"));
});

test("代表的なエラーを日本語で説明する", () => {
  assert.match(_test.japaneseExplanation("ReferenceError: liff is not defined", "error"), /読み込まれていない/);
  assert.match(_test.japaneseExplanation("Failed to fetch", "error"), /通信/);
  assert.equal(_test.japaneseKind("unhandledrejection"), "非同期処理の未処理エラー");
});
