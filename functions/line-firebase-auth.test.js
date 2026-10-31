"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadHelper(liff) {
  const source = fs.readFileSync(path.join(__dirname, "..", "js", "line-firebase-auth.js"), "utf8")
      .replace("export async function signInFirebaseWithLine", "async function signInFirebaseWithLine")
      .concat("\nmodule.exports = {signInFirebaseWithLine};\n");
  const context = {module: {exports: {}}, exports: {}, fetch, console, liff};
  vm.runInNewContext(source, context, {filename: "line-firebase-auth.js"});
  return context.module.exports.signInFirebaseWithLine;
}

test("管理ログインは古い一般権限のセッションを再利用しない", async () => {
  const calls = [];
  const existingUser = {
    uid: "line-user",
    isAnonymous: false,
    getIdTokenResult: async forceRefresh => {
      calls.push({type: "refresh", forceRefresh});
      return {claims: {line: true, registered: true, admin: false}};
    },
  };
  const adminUser = {
    uid: "line-user",
    getIdTokenResult: async () => ({claims: {line: true, registered: true, admin: true}}),
  };
  const auth = {currentUser: existingUser, authStateReady: async () => {}};
  const liff = {getIDToken: () => "id-token", getAccessToken: () => "access-token"};
  const signIn = async (_auth, token) => {
    calls.push({type: "signIn", token});
    return {user: adminUser};
  };
  const originalFetch = global.fetch;
  global.fetch = async () => ({ok: true, json: async () => ({customToken: "custom-token"})});
  try {
    const helper = loadHelper(liff);
    const result = await helper(auth, signIn, "line-user", {requiredClaims: ["admin"]});
    assert.equal(result, adminUser);
    assert.deepEqual(calls, [
      {type: "refresh", forceRefresh: true},
      {type: "signIn", token: "custom-token"},
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("最新の管理者セッションは再認証せずに利用する", async () => {
  let signInCalled = false;
  const user = {
    uid: "line-user",
    isAnonymous: false,
    getIdTokenResult: async forceRefresh => {
      assert.equal(forceRefresh, true);
      return {claims: {line: true, registered: true, admin: true}};
    },
  };
  const auth = {currentUser: user, authStateReady: async () => {}};
  const helper = loadHelper({getIDToken: () => null, getAccessToken: () => null});
  const result = await helper(auth, async () => { signInCalled = true; }, "line-user", {requiredClaims: ["admin"]});
  assert.equal(result, user);
  assert.equal(signInCalled, false);
});

test("管理ログインを強制した場合は既存セッションを使わず再認証する", async () => {
  let refreshCalled = false;
  const existingUser = {
    uid: "line-user",
    isAnonymous: false,
    getIdTokenResult: async () => {
      refreshCalled = true;
      return {claims: {line: true, registered: true, admin: true}};
    },
  };
  const signedInUser = {
    uid: "line-user",
    getIdTokenResult: async () => ({claims: {line: true, registered: true, admin: true}}),
  };
  const auth = {currentUser: existingUser, authStateReady: async () => {}};
  const originalFetch = global.fetch;
  global.fetch = async () => ({ok: true, json: async () => ({customToken: "fresh-token"})});
  try {
    const helper = loadHelper({getIDToken: () => "id-token", getAccessToken: () => "access-token"});
    const result = await helper(auth, async () => ({user: signedInUser}), "line-user", {
      requiredClaims: ["admin"],
      forceReauthentication: true,
    });
    assert.equal(result, signedInUser);
    assert.equal(refreshCalled, false);
  } finally {
    global.fetch = originalFetch;
  }
});
