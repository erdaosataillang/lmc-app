const TOKEN_ENDPOINT = "https://asia-northeast1-urakata-app.cloudfunctions.net/createLineFirebaseToken";

/**
 * LINEが検証したユーザーIDをFirebase Authの固定UIDとして使用する。
 * 既存の有効なセッションは再利用し、FunctionsとLINEへの不要な通信を避ける。
 */
export async function signInFirebaseWithLine(auth, signInWithCustomToken, lineUserId, options = {}) {
    if (!auth || !lineUserId) throw new Error("LINE user is not ready");
    if (typeof auth.authStateReady === "function") await auth.authStateReady();

    const requiredClaims = Array.isArray(options.requiredClaims)
        ? options.requiredClaims.filter(claim => typeof claim === "string" && claim)
        : [];

    const existingUser = auth.currentUser;
    if (existingUser && !existingUser.isAnonymous && existingUser.uid === lineUserId) {
        try {
            // 管理画面など権限が必要な入口では、変更後のクレームを必ず取り直す。
            const tokenResult = await existingUser.getIdTokenResult(requiredClaims.length > 0);
            const hasRequiredClaims = requiredClaims.every(claim => tokenResult.claims[claim] === true);
            if (tokenResult.claims.line === true && tokenResult.claims.registered === true && hasRequiredClaims) {
                return existingUser;
            }
        } catch (error) {
            // 権限変更でリフレッシュトークンが失効している場合は、LINEから再認証する。
            console.warn("Firebase session refresh failed; re-authenticating with LINE.", error);
        }
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

    if (requiredClaims.length > 0) {
        const tokenResult = await credential.user.getIdTokenResult();
        const missingClaim = requiredClaims.find(claim => tokenResult.claims[claim] !== true);
        if (missingClaim) {
            const error = new Error(`Required Firebase claim is missing: ${missingClaim}`);
            error.code = "auth/required-claim-missing";
            error.claim = missingClaim;
            throw error;
        }
    }
    return credential.user;
}
