export async function hasCueAdminAccess(user) {
    const token = await user?.getIdTokenResult();
    return token?.claims.line === true &&
        token.claims.registered === true &&
        token.claims.admin === true;
}

export function timetableCueUrl(bandId, eventId) {
    if (!bandId || !eventId) return '';
    const params = new URLSearchParams({bandID: bandId, eventID: eventId, view: '1'});
    return `/lmc/app/cue.html?${params}`;
}

export function normalizeAppleMusicTrackId(value) {
    const id = typeof value === 'string' || Number.isSafeInteger(value) ? String(value).trim() : '';
    return /^[1-9]\d{0,19}$/.test(id) ? id : '';
}

function directAppleMusicTrackUrl(value, trackId) {
    if (!value) return '';
    let url;
    try { url = new URL(value); }
    catch { return ''; }
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return '';
    if (url.hostname === 'itunes.apple.com') url.hostname = 'music.apple.com';
    if (url.hostname !== 'music.apple.com') return '';

    const match = url.pathname.match(/^\/[a-z]{2}\/(album|song)\/(?:[^/]+\/)?(\d+)\/?$/i);
    if (!match) return '';
    const urlTrackId = match[1].toLowerCase() === 'song' ? match[2] : url.searchParams.get('i');
    if (!normalizeAppleMusicTrackId(urlTrackId) || (trackId && urlTrackId !== trackId)) return '';
    return url.href;
}

export function appleMusicTrackUrl(value, trackId) {
    const id = normalizeAppleMusicTrackId(trackId);
    return directAppleMusicTrackUrl(value, id) || (id ? `https://music.apple.com/jp/song/${id}` : '');
}

export function appleMusicSearchUrl(title) {
    const params = new URLSearchParams({term: title});
    return `https://music.apple.com/jp/search?${params}`;
}
