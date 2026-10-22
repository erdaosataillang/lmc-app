"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {after, before, beforeEach} = test;
const {assertFails, assertSucceeds, initializeTestEnvironment} = require("@firebase/rules-unit-testing");
const {collection, doc, getDoc, getDocs, setDoc, updateDoc} = require("firebase/firestore");

let environment;
const projectId = "demo-lmc-security";

before(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {rules: fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8")},
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "users", "member"), {name: "一般", role: "lmc_normal", lineUserId: "member"});
    await setDoc(doc(db, "users", "other"), {name: "他人", tel: "09000000000", role: "lmc_normal", lineUserId: "other"});
    await setDoc(doc(db, "userAdminMemos", "member"), {memo: "管理者専用"});
    await setDoc(doc(db, "bands", "band-a"), {name: "A", creatorId: "other", memberIds: ["other"], memberNames: ["他人"]});
  });
});

after(async () => environment?.cleanup());

function userDb(uid = "member", extra = {}) {
  return environment.authenticatedContext(uid, {line: true, registered: true, admin: false, ...extra}).firestore();
}

test("一般ユーザーは自分を管理者へ昇格できない", async () => {
  await assertFails(updateDoc(doc(userDb(), "users", "member"), {role: "admin"}));
});

test("一般ユーザーは個人情報を含むユーザー一覧を取得できない", async () => {
  await assertFails(getDocs(collection(userDb(), "users")));
});

test("管理メモは管理者だけが読み書きできる", async () => {
  await assertFails(getDoc(doc(userDb(), "userAdminMemos", "member")));
  await assertFails(setDoc(doc(userDb(), "userAdminMemos", "member"), {memo: "改ざん"}));

  const adminDb = environment.authenticatedContext("admin", {line: true, registered: true, admin: true}).firestore();
  await assertSucceeds(getDoc(doc(adminDb, "userAdminMemos", "member")));
  await assertSucceeds(setDoc(doc(adminDb, "userAdminMemos", "member"), {memo: "更新"}));
});

test("一般ユーザーは招待処理を迂回してバンドへ参加できない", async () => {
  await assertFails(updateDoc(doc(userDb(), "bands", "band-a"), {memberIds: ["other", "member"]}));
});

test("いいねは自分の追加・削除だけ許可する", async () => {
  const db = userDb();
  await assertSucceeds(updateDoc(doc(db, "bands", "band-a"), {likes: ["member"]}));
  await assertFails(updateDoc(doc(db, "bands", "band-a"), {likes: ["member", "someone-else"]}));
  await assertSucceeds(updateDoc(doc(db, "bands", "band-a"), {likes: []}));
});

test("一般ユーザーは予約を直接確定できない", async () => {
  await assertFails(setDoc(doc(userDb(), "bookings", "attack"), {
    creatorId: "member", bandId: "band-a", status: "confirmed",
  }));
});

test("管理者は管理画面から予約を保存できる", async () => {
  const db = environment.authenticatedContext("admin", {line: true, registered: true, admin: true}).firestore();
  await assertSucceeds(setDoc(doc(db, "bookings", "admin-entry"), {type: "event", status: "confirmed"}));
});

test("未登録LINEユーザーは安全な初期プロフィールだけ作成できる", async () => {
  const db = environment.authenticatedContext("new-user", {line: true, registered: false, admin: false}).firestore();
  const safe = {
    affiliations: ["urakata", "lmc"], lineUserId: "new-user", role: "lmc_normal", name: "新規",
  };
  await assertSucceeds(setDoc(doc(db, "users", "new-user"), safe));
  await environment.clearFirestore();
  await assertFails(setDoc(doc(db, "users", "new-user"), {...safe, role: "admin"}));
});
