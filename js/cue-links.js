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

export function appleMusicTrackUrl(value) {
    if (!value) return '';
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password || url.port) return '';
        if (url.hostname === 'itunes.apple.com') url.hostname = 'music.apple.com';
        const trackPath = /^\/[a-z]{2}\/(?:album|song)\/.+\/\d+\/?$/i;
        return url.hostname === 'music.apple.com' && trackPath.test(url.pathname) ? url.href : '';
    } catch {
        return '';
    }
}

export function appleMusicSearchUrl(title) {
    const params = new URLSearchParams({term: title});
    return `https://music.apple.com/jp/search?${params}`;
}
