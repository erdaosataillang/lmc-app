const API_ENDPOINT = "https://asia-northeast1-urakata-app.cloudfunctions.net/lmcAppApi";

async function api(path, options = {}) {
    const auth = options.auth;
    if (!auth?.currentUser) throw new Error("ログインが必要です。");
    const token = await auth.currentUser.getIdToken();
    const response = await fetch(`${API_ENDPOINT}${path}`, {
        method: options.method || "GET",
        headers: {
            Authorization: `Bearer ${token}`,
            ...(options.body === undefined ? {} : {"Content-Type": "application/json"})
        },
        cache: "no-store",
        body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    let payload = null;
    if (response.status !== 204) payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.message || `処理に失敗しました (${response.status})`);
    return payload;
}

export const loadPublicProfiles = auth => api("/profiles", {auth}).then(result => result.profiles || []);
export const loadPublicProfile = (auth, uid) => api(`/profiles/${encodeURIComponent(uid)}`, {auth}).then(result => result.profile);
export const createBandInvite = (auth, bandId) => api(`/bands/${encodeURIComponent(bandId)}/invites`, {auth, method:"POST"});
export const acceptBandInvite = (auth, token) => api("/invites/accept", {auth, method:"POST", body:{token}});
export const leaveBandSecurely = (auth, bandId) => api(`/bands/${encodeURIComponent(bandId)}/leave`, {auth, method:"POST"});
export const createBooking = (auth, booking) => api("/bookings", {auth, method:"POST", body:booking});
export const updateBooking = (auth, id, booking) => api(`/bookings/${encodeURIComponent(id)}`, {auth, method:"PATCH", body:booking});
export const removeBooking = (auth, id) => api(`/bookings/${encodeURIComponent(id)}`, {auth, method:"DELETE"});
export const sendEmailCode = (auth, email) => api("/email/send-code", {auth, method:"POST", body:{email}});
export const verifyEmailCode = (auth, code) => api("/email/verify", {auth, method:"POST", body:{code}});
