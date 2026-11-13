"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {_test} = require("./app-api");

test("公開プロフィールから個人情報と権限を除外する", () => {
  const snapshot = {
    id: "user-1",
    data: () => ({
      name: "山田太郎",
      icon: "https://example.com/icon.jpg",
      part: "guitar",
      tel: "09000000000",
      birthday: "2000-01-01",
      Email: "private@example.com",
      studentId: "secret",
      role: "admin",
      authCode: "123456",
    }),
  };
  assert.deepEqual(_test.publicProfile(snapshot), {
    id: "user-1",
    name: "山田太郎",
    icon: "https://example.com/icon.jpg",
    part: "guitar",
  });
});

test("予約時間の不正値と過大な予約を拒否する", () => {
  assert.throws(() => _test.parseBookingBody({bandId: "b1", startTime: "bad", endTime: "bad"}), /予約時間/);
  assert.throws(() => _test.parseBookingBody({
    bandId: "b1",
    startTime: "2026-10-22T00:00:00.000Z",
    endTime: "2026-10-23T00:00:00.000Z",
  }), /12時間/);
});

test("予約可能時間外と30分単位でない時刻を拒否する", () => {
  assert.throws(() => _test.parseBookingBody({
    bandId: "b1", startTime: "2030-10-22T00:15:00.000Z", endTime: "2030-10-22T01:15:00.000Z",
  }), /30分単位/);
  assert.throws(() => _test.parseBookingBody({
    bandId: "b1", startTime: "2030-10-21T23:00:00.000Z", endTime: "2030-10-22T00:00:00.000Z",
  }), /9:00/);
});

test("アプリ未登録のバンド名でも予約内容を受け付ける", () => {
  const parsed = _test.parseBookingBody({
    customBandName: "  一夜限りバンド  ",
    startTime: "2030-10-22T01:00:00.000Z",
    endTime: "2030-10-22T02:00:00.000Z",
  });
  assert.equal(parsed.bandId, "");
  assert.equal(parsed.customBandName, "一夜限りバンド");
  assert.match(_test.customBandId("user-1", parsed.customBandName), /^custom_[a-f0-9]{32}$/);
});

test("登録済みバンドと自由入力の同時指定・未指定を拒否する", () => {
  const times = {
    startTime: "2030-10-22T01:00:00.000Z",
    endTime: "2030-10-22T02:00:00.000Z",
  };
  assert.throws(() => _test.parseBookingBody(times), /どちらかを指定/);
  assert.throws(() => _test.parseBookingBody({bandId: "b1", customBandName: "別バンド", ...times}), /どちらかを指定/);
});

test("管理画面用のイベント予約内容を受け付ける", () => {
  const parsed = _test.parseBookingBody({
    type: "event",
    title: " 新歓ライブ ",
    eventMessage: "当日は部室を終日使用します。",
    eventImageUrl: "https://firebasestorage.googleapis.com/v0/b/example/o/event.jpg?alt=media",
    startTime: "2030-10-22T00:00:00.000Z",
    endTime: "2030-10-22T11:00:00.000Z",
  });
  assert.equal(parsed.type, "event");
  assert.equal(parsed.title, "新歓ライブ");
  assert.equal(parsed.eventMessage, "当日は部室を終日使用します。");
  assert.match(parsed.eventImageUrl, /^https:\/\/firebasestorage\.googleapis\.com\//);
  assert.equal(parsed.bandId, "");
});

test("イベント予約の画像はHTTPSだけを受け付ける", () => {
  assert.throws(() => _test.parseBookingBody({
    type: "event",
    title: "新歓ライブ",
    eventImageUrl: "javascript:alert(1)",
    startTime: "2030-10-22T00:00:00.000Z",
    endTime: "2030-10-22T11:00:00.000Z",
  }), /画像URL/);
});

test("定期演奏会の開始日から終了日までを予約不可日として判定する", () => {
  const event = {startDate: "2030-10-22", endDate: "2030-10-24"};
  assert.equal(_test.eventIncludesDate(event, "2030-10-21"), false);
  assert.equal(_test.eventIncludesDate(event, "2030-10-22"), true);
  assert.equal(_test.eventIncludesDate(event, "2030-10-23"), true);
  assert.equal(_test.eventIncludesDate(event, "2030-10-24"), true);
  assert.equal(_test.eventIncludesDate(event, "2030-10-25"), false);
});

test("日本時間の日付キーを作る", () => {
  assert.equal(_test.dateKeyInTokyo(new Date("2026-10-21T16:00:00.000Z")), "2026-10-22");
});

test("クライアント障害通知はユーザーごとに1分5件まで", () => {
  const uid = `reporter-${Date.now()}-${Math.random()}`;
  for (let index = 0; index < 5; index += 1) assert.equal(_test.clientErrorAllowed(uid, 1000 + index), true);
  assert.equal(_test.clientErrorAllowed(uid, 2000), false);
  assert.equal(_test.clientErrorAllowed(uid, 61001), true);
});
