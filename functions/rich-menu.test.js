"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  accountSubtitle,
  menuSignature,
  pickNextBooking,
  queueItemIsDue,
  refilledCreateTokens,
  richMenuContext,
  richMenuDefinition,
  renderRichMenuImage,
  renderRichMenuImageIsolated,
} = require("./rich-menu")._test;

const now = new Date("2026-11-23T10:00:00+09:00");

test("参加バンドの確定済み予約だけを次の合わせ予定に選ぶ", () => {
  const bands = [{id: "mine", memberIds: ["user-1"]}, {id: "other", memberIds: ["user-2"]}];
  const bookings = [
    {id: "pending", bandId: "mine", status: "pending", startTime: "2026-11-23T11:00:00+09:00", endTime: "2026-11-23T12:00:00+09:00"},
    {id: "other", bandId: "other", status: "confirmed", startTime: "2026-11-23T11:00:00+09:00", endTime: "2026-11-23T12:00:00+09:00"},
    {id: "mine-later", bandId: "mine", status: "confirmed", startTime: "2026-11-24T13:00:00+09:00", endTime: "2026-11-24T14:00:00+09:00"},
    {id: "mine-first", bandId: "mine", status: "confirmed", startTime: "2026-11-24T11:00:00+09:00", endTime: "2026-11-24T12:00:00+09:00"},
  ];
  assert.equal(pickNextBooking("user-1", bands, bookings, now).id, "mine-first");
});

test("自由入力バンドの予約者にも次の合わせ予定を表示する", () => {
  const booking = {
    id: "custom", creatorId: "user-1", isCustomBand: true, status: "confirmed",
    startTime: "2026-11-25T11:00:00+09:00", endTime: "2026-11-25T12:00:00+09:00",
  };
  assert.equal(pickNextBooking("user-1", [], [booking], now).id, "custom");
});

test("アカウント欄にはパートと学年を短く表示する", () => {
  assert.equal(accountSubtitle({part: "guitar", year: "2"}), "Gt / 2年");
  assert.equal(accountSubtitle({}), "プロフィールを確認");
});

test("下段右2ブロックをマイアカウントとして定義する", () => {
  const definition = richMenuDefinition("U1234567890", "abc123456789");
  assert.deepEqual(definition.size, {width: 2500, height: 1686});
  assert.equal(definition.areas.length, 4);
  assert.deepEqual(definition.areas.map((area) => area.bounds), [
    {x: 0, y: 0, width: 833, height: 843},
    {x: 833, y: 0, width: 1667, height: 843},
    {x: 0, y: 843, width: 833, height: 843},
    {x: 833, y: 843, width: 1667, height: 843},
  ]);
  assert.equal(definition.areas.some((area) => area.action.label === "設定"), false);
  assert.equal(definition.areas.every((area) => area.action.uri.startsWith("https://liff.line.me/2008162165-vVODNp12/")), true);
});

test("表示内容が同じなら署名も同じになる", () => {
  const context = richMenuContext("user-1", {name: "山田太郎", part: "bass", year: "3"}, [], [], {}, now);
  assert.equal(menuSignature(context), menuSignature({...context}));
  assert.notEqual(menuSignature(context), menuSignature({...context, name: "山田花子"}));
});

test("LINE作成枠は1時間かけて補充し上限を超えない", () => {
  const start = Date.parse("2026-11-23T10:00:00Z");
  assert.equal(refilledCreateTokens({tokens: 0, refilledAt: {toMillis: () => start}}, start + 30 * 60 * 1000), 35);
  assert.equal(refilledCreateTokens({tokens: 69, refilledAt: {toMillis: () => start}}, start + 60 * 60 * 1000), 70);
});

test("優先キューは実行時刻を過ぎた場合だけ処理対象にする", () => {
  const now = new Date("2026-11-24T12:00:00+09:00");
  assert.equal(queueItemIsDue({runAt: {toDate: () => new Date("2026-11-24T11:59:00+09:00")}}, now), true);
  assert.equal(queueItemIsDue({runAt: {toDate: () => new Date("2026-11-24T12:01:00+09:00")}}, now), false);
});

test("LINEの制限内で日本語入りJPEGを生成する", async () => {
  const context = richMenuContext("user-1", {name: "山田太郎", part: "guitar", year: "2"}, [{id: "band", memberIds: ["user-1"]}], [{
    id: "booking", bandId: "band", bandName: "放課後セッション", status: "confirmed",
    startTime: "2026-11-28T16:00:00+09:00", endTime: "2026-11-28T17:00:00+09:00",
  }], {}, now);
  const image = await renderRichMenuImage(context);
  assert.equal(image[0], 0xff);
  assert.equal(image[1], 0xd8);
  assert.ok(image.length < 1024 * 1024, `${image.length} bytes`);
  const isolatedImage = await renderRichMenuImageIsolated(context);
  assert.equal(isolatedImage[0], 0xff);
  assert.equal(isolatedImage[1], 0xd8);
  assert.ok(isolatedImage.length < 1024 * 1024, `${isolatedImage.length} bytes`);
});
