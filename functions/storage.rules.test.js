"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {after, before, beforeEach} = test;
const {assertFails, assertSucceeds, initializeTestEnvironment} = require("@firebase/rules-unit-testing");
const {doc, setDoc} = require("firebase/firestore");
const {ref, uploadBytes} = require("firebase/storage");

let environment;
const projectId = "demo-lmc-security";

before(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {rules: fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8")},
    storage: {rules: fs.readFileSync(path.join(__dirname, "..", "storage.rules"), "utf8")},
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
  await environment.clearStorage();
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "bands", "band-a"), {creatorId: "member", memberIds: ["member"]});
  });
});

after(async () => environment?.cleanup());

function storage(uid, registered = true) {
  return environment.authenticatedContext(uid, {line: true, registered, admin: false}).storage();
}

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

test("本人の5MB未満の画像だけプロフィールへ保存できる", async () => {
  await assertSucceeds(uploadBytes(ref(storage("member"), "user-images/member/a.jpg"), jpeg, {contentType: "image/jpeg"}));
  await assertFails(uploadBytes(ref(storage("member"), "user-images/other/a.jpg"), jpeg, {contentType: "image/jpeg"}));
  await assertFails(uploadBytes(ref(storage("member", false), "user-images/member/b.jpg"), jpeg, {contentType: "image/jpeg"}));
});

test("バンド画像はメンバーだけが保存できる", async () => {
  await assertSucceeds(uploadBytes(ref(storage("member"), "band-images/band-a/a.png"), jpeg, {contentType: "image/png"}));
  await assertFails(uploadBytes(ref(storage("outsider"), "band-images/band-a/a.png"), jpeg, {contentType: "image/png"}));
});

test("画像以外と5MB以上のファイルを拒否する", async () => {
  await assertFails(uploadBytes(ref(storage("member"), "user-images/member/a.txt"), jpeg, {contentType: "text/html"}));
  await assertFails(uploadBytes(ref(storage("member"), "user-images/member/large.jpg"), new Uint8Array(5 * 1024 * 1024), {contentType: "image/jpeg"}));
});

test("Cueファイルは管理者だけが画像またはPDFとして保存できる", async () => {
  const adminStorage = environment.authenticatedContext("admin", {line: true, registered: true, admin: true}).storage();
  await assertSucceeds(uploadBytes(ref(adminStorage, "cue-files/band-a/a.pdf"), jpeg, {contentType: "application/pdf"}));
  await assertFails(uploadBytes(ref(storage("member"), "cue-files/band-a/a.pdf"), jpeg, {contentType: "application/pdf"}));
  await assertFails(uploadBytes(ref(adminStorage, "cue-files/band-a/a.html"), jpeg, {contentType: "text/html"}));
});
