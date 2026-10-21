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

test("日本時間の日付キーを作る", () => {
  assert.equal(_test.dateKeyInTokyo(new Date("2026-10-21T16:00:00.000Z")), "2026-10-22");
});
