const TOKEN_ENDPOINT = "https://asia-northeast1-urakata-app.cloudfunctions.net/createLineFirebaseToken";

/**
 * LINEが検証したユーザーIDをFirebase Authの固定UIDとして使用する。
 * 既存の有効なセッションは再利用し、FunctionsとLINEへの不要な通信を避ける。
 */
export async function signInFirebaseWithLine(auth, signInWithCustomToken, lineUserId) {
    if (!auth || !lineUserId) throw new Error("LINE user is not ready");
    if (typeof auth.authStateReady === "function") await auth.authStateReady();

    const existingUser = auth.currentUser;
    if (existingUser && !existingUser.isAnonymous && existingUser.uid === lineUserId) {
        const tokenResult = await existingUser.getIdTokenResult();
        if (tokenResult.claims.line === true) return existingUser;
    }

    const idToken = liff.getIDToken();
    const accessToken = liff.getAccessToken();
    if (!idToken && !accessToken) {
        throw new Error("LINE authentication tokens are unavailable. Please log in again.");
    }

    const response = await fetch(TOKEN_ENDPOINT, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        cache: "no-store",
        body: JSON.stringify({idToken, accessToken})
    });
    if (!response.ok) throw new Error(`LINE authentication failed (${response.status})`);

    const {customToken} = await response.json();
    if (!customToken) throw new Error("Firebase custom token was not returned");
    const credential = await signInWithCustomToken(auth, customToken);
    if (credential.user.uid !== lineUserId) {
        await auth.signOut();
        throw new Error("LINE and Firebase user IDs did not match");
    }
    return credential.user;
}
