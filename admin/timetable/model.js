const dateFormat = /^\d{4}-\d{2}-\d{2}$/;
const timeFormat = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function dateKey(value) {
    if (typeof value !== 'string' || !dateFormat.test(value)) return '';
    const time = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(time.getTime()) && time.toISOString().slice(0, 10) === value ? value : '';
}

export function createTimetableDraft(eventId, event, bands) {
    const timetable = event.timetable || {};
    const saved = new Map();
    for (const entry of Array.isArray(timetable.entries) ? timetable.entries : []) {
        if (entry?.bandId && !saved.has(entry.bandId)) saved.set(entry.bandId, entry);
    }
    const start = dateKey(event.startDate || event.date);
    const end = dateKey(event.endDate) || start;
    const dates = new Set();
    if (start && start <= end) {
        const day = new Date(`${start}T00:00:00Z`);
        while (dates.size < 366 && day.toISOString().slice(0, 10) <= end) {
            dates.add(day.toISOString().slice(0, 10));
            day.setUTCDate(day.getUTCDate() + 1);
        }
    }
    const entries = bands.map(band => {
        const entry = saved.get(band.id) || {};
        const date = dateKey(entry.date) || dateKey(band.performanceDates?.[eventId]) || start;
        if (date) dates.add(date);
        return {
            bandId: band.id,
            bandName: band.name || entry.bandName || '名称未設定',
            icon: band.icon || entry.icon || '',
            date,
            time: timeFormat.test(entry.time || '') ? entry.time : '',
            order: Number.isFinite(entry.order) ? entry.order : Infinity
        };
    }).sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order || a.bandName.localeCompare(b.bandName, 'ja'));
    const orderedDates = [...dates].sort();
    entries.forEach(entry => { if (!entry.date) entry.date = orderedDates[0] || ''; });
    return {entries, dates: orderedDates, published: timetable.published === true, showTimes: timetable.showTimes !== false};
}

export function moveTimetableEntry(entries, fromId, toId) {
    const from = entries.findIndex(entry => entry.bandId === fromId);
    const to = entries.findIndex(entry => entry.bandId === toId);
    if (from < 0 || to < 0 || from === to || entries[from].date !== entries[to].date) return false;
    const [entry] = entries.splice(from, 1);
    entries.splice(to, 0, entry);
    return true;
}

export function fillTimetableTimes(entries, date, start, interval) {
    if (!timeFormat.test(start) || !Number.isInteger(interval) || interval < 1 || interval > 180) return false;
    const dayEntries = entries.filter(entry => entry.date === date);
    const [hour, minute] = start.split(':').map(Number);
    const first = hour * 60 + minute;
    if (!dayEntries.length || first + (dayEntries.length - 1) * interval >= 1440) return false;
    dayEntries.forEach((entry, index) => {
        const time = first + index * interval;
        entry.time = `${String(Math.floor(time / 60)).padStart(2, '0')}:${String(time % 60).padStart(2, '0')}`;
    });
    return true;
}

export function timetableEntriesForSave(entries) {
    const orders = new Map();
    return entries.map(({bandId, bandName, icon, date, time}) => {
        const order = orders.get(date) || 0;
        orders.set(date, order + 1);
        return {bandId, bandName, icon, date, time, order};
    });
}
