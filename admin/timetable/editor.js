import {initAdminPage, db, escapeHtml, safeImageUrl} from '/js/admin-common.js?v=20261128-timetable';
import {collection, doc, FieldPath, getDoc, getDocs, query, runTransaction, serverTimestamp, where} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import {timetableCueUrl} from '../../js/cue-links.js?v=2';
import {createTimetableDraft, fillTimetableTimes, moveTimetableEntry, timetableEntriesForSave} from './model.js?v=1';

const byId = id => document.getElementById(`tt-${id}`);
const eventSelect = byId('event');
const editor = byId('editor');
const rows = byId('rows');
const detail = byId('band-detail');
const saveButton = byId('save');
const dateLabel = new Intl.DateTimeFormat('ja-JP', {month:'numeric', day:'numeric', weekday:'short', timeZone:'UTC'});
const formatDate = date => dateLabel.format(new Date(`${date}T00:00:00Z`));

let state = null;
let dirty = false;
let saving = false;
let dragId = '';
let initialized = false;

function status(message, error = false) {
    const element = byId('status');
    element.textContent = message;
    element.classList.toggle('text-red-700', error);
}

function flagChange() {
    dirty = true;
    status('未保存の変更があります。');
}

function render() {
    const {entries, dates, day} = state;
    const counts = new Map();
    for (const entry of entries) counts.set(entry.date, (counts.get(entry.date) || 0) + 1);
    byId('days').innerHTML = dates.map(date =>
        `<button type="button" class="tt-day shrink-0 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-extrabold text-gray-600 hover:text-gray-900 transition-colors" data-date="${date}" aria-pressed="${date === day}">
            ${formatDate(date)}<span class="tt-day-count rounded-full bg-gray-200 px-2 py-0.5 text-xs font-bold">${counts.get(date) || 0}組</span>
        </button>`
    ).join('');
    const dayEntries = entries.filter(entry => entry.date === day);
    byId('fill').hidden = dates.length === 0;
    byId('apply-times').disabled = dayEntries.length === 0;
    saveButton.disabled = !dates.length;
    if (!dayEntries.length) {
        rows.innerHTML = `<li class="px-4 py-10 text-center text-sm font-semibold text-gray-500">${dates.length ? 'この日の出演バンドはありません。' : 'イベントに開催日を設定してください。'}</li>`;
        return;
    }
    rows.innerHTML = dayEntries.map((entry, index) => `
        <li class="tt-row px-4 py-4 sm:px-6 hover:bg-gray-50/50 transition-colors" data-band-id="${escapeHtml(entry.bandId)}">
            <div class="tt-band flex min-w-0 items-center gap-2">
                <span class="tt-grip px-1.5 py-2 text-gray-400 hover:text-gray-700" draggable="true" title="ドラッグで並べ替え"><i class="fa-solid fa-grip-vertical" aria-hidden="true"></i></span>
                <span class="w-6 shrink-0 text-center text-xs font-extrabold text-gray-500" aria-hidden="true">${index + 1}</span>
                <button type="button" class="flex min-w-0 items-center gap-2 text-left text-sm font-extrabold text-gray-800 hover:text-sky-700" data-action="detail" aria-label="${escapeHtml(entry.bandName)}の詳細を開く">
                    ${entry.icon ? `<img src="${safeImageUrl(entry.icon)}" class="h-9 w-9 shrink-0 rounded-xl object-cover" alt="">` : '<span class="h-9 w-9 shrink-0 rounded-xl bg-sky-50 text-sky-600 grid place-items-center"><i class="fa-solid fa-users" aria-hidden="true"></i></span>'}
                    <span class="min-w-0 break-words">${escapeHtml(entry.bandName)}</span>
                    <i class="fa-solid fa-chevron-right shrink-0 text-[10px] text-gray-400" aria-hidden="true"></i>
                </button>
            </div>
            <label class="flex min-w-0 flex-col gap-1 text-xs font-bold text-gray-600">出演日
                <select class="tt-control w-full" data-field="date">
                    ${dates.map(date => `<option value="${date}" ${date === entry.date ? 'selected' : ''}>${formatDate(date)}</option>`).join('')}
                </select>
            </label>
            <label class="flex min-w-0 flex-col gap-1 text-xs font-bold text-gray-600">開始時刻
                <input class="tt-control w-full" type="time" data-field="time" value="${escapeHtml(entry.time)}">
            </label>
            <div class="flex gap-1 self-end">
                <button type="button" class="h-10 w-8 sm:w-10 rounded-xl bg-gray-50 text-gray-600 hover:bg-sky-50 hover:text-sky-700 disabled:opacity-40" data-action="up" aria-label="出演順を前へ" ${index === 0 ? 'disabled' : ''}><i class="fa-solid fa-arrow-up" aria-hidden="true"></i></button>
                <button type="button" class="h-10 w-8 sm:w-10 rounded-xl bg-gray-50 text-gray-600 hover:bg-sky-50 hover:text-sky-700 disabled:opacity-40" data-action="down" aria-label="出演順を後ろへ" ${index === dayEntries.length - 1 ? 'disabled' : ''}><i class="fa-solid fa-arrow-down" aria-hidden="true"></i></button>
            </div>
        </li>`).join('');
}

async function loadEvent(eventId, preferredDay = '', successMessage = '') {
    state = null;
    dirty = false;
    editor.hidden = true;
    eventSelect.disabled = true;
    status('出演バンドとタイムテーブルを読み込んでいます…');
    try {
        const eventRef = doc(db, 'events', eventId);
        const [eventDoc, bands] = await Promise.all([
            getDoc(eventRef),
            getDocs(query(collection(db, 'bands'), where('events', 'array-contains', eventId)))
        ]);
        if (!eventDoc.exists()) throw new Error('イベントが見つかりません。');
        const participants = bands.docs.map(snapshot => ({...snapshot.data(), id:snapshot.id}))
            .filter(band => band.isArchived !== true && !band.mergedIntoBandId);
        const event = eventDoc.data();
        const draft = createTimetableDraft(eventId, event, participants);
        state = {
            ...draft, eventId, eventRef, event,
            day: draft.dates.includes(preferredDay) ? preferredDay : draft.dates[0],
            performanceDates: new Map(participants.map(band => [band.id, band.performanceDates?.[eventId]]))
        };
        byId('published').checked = draft.published;
        byId('show-times').checked = draft.showTimes;
        editor.hidden = false;
        render();
        status(successMessage || (draft.published ? '公開中' : '下書き'));
    } catch (error) {
        console.error('Timetable load failed:', error);
        status('タイムテーブルを読み込めませんでした。ページを再読み込みしてください。', true);
    } finally {
        eventSelect.disabled = false;
    }
}

eventSelect.addEventListener('change', () => {
    if (dirty && !window.confirm('未保存の変更を破棄してイベントを切り替えますか？')) {
        eventSelect.value = state.eventId;
        return;
    }
    const url = new URL(location.href);
    url.searchParams.set('eventID', eventSelect.value);
    history.replaceState(null, '', url);
    void loadEvent(eventSelect.value);
});

byId('days').addEventListener('click', event => {
    const tab = event.target.closest('button[data-date]');
    if (!state || !tab) return;
    state.day = tab.dataset.date;
    render();
});

byId('published').addEventListener('change', flagChange);
byId('show-times').addEventListener('change', flagChange);
rows.addEventListener('change', event => {
    const {field} = event.target.dataset;
    const id = event.target.closest('[data-band-id]')?.dataset.bandId;
    const entry = state?.entries.find(item => item.bandId === id);
    const value = event.target.value;
    if (!entry || !field || entry[field] === value) return;
    if (field === 'time') entry.time = value;
    if (field === 'date' && state.dates.includes(value)) {
        entry.date = value;
        state.entries.splice(state.entries.indexOf(entry), 1);
        state.entries.push(entry);
        render();
    }
    flagChange();
});

function reorder(fromId, toId, focusAction) {
    if (!state || !moveTimetableEntry(state.entries, fromId, toId)) return;
    flagChange();
    render();
    if (focusAction) {
        const row = [...rows.children].find(item => item.dataset.bandId === fromId);
        (row?.querySelector(`button[data-action="${focusAction}"]:enabled`) || row?.querySelector('button[data-action="detail"]'))?.focus();
    }
}

rows.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    const id = button?.closest('[data-band-id]').dataset.bandId;
    const dayEntries = state?.entries.filter(entry => entry.date === state.day);
    const index = dayEntries?.findIndex(entry => entry.bandId === id);
    if (!button || index === undefined || index < 0) return;
    const {action} = button.dataset;
    const entry = dayEntries[index];
    if (action === 'detail') {
        byId('band-title').textContent = entry.bandName;
        byId('band-date').textContent = [formatDate(entry.date), entry.time].filter(Boolean).join('  ');
        byId('cue-link').href = timetableCueUrl(entry.bandId, state.eventId);
        detail.showModal();
        return;
    }
    const target = dayEntries[index + (action === 'up' ? -1 : 1)];
    if (target) reorder(id, target.bandId, action);
});

rows.addEventListener('dragstart', event => {
    const grip = event.target.closest('.tt-grip');
    if (!grip || saving) return;
    dragId = grip.closest('[data-band-id]').dataset.bandId;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', dragId);
});

function clearDropTarget() {
    rows.querySelector('[data-drop-target]')?.removeAttribute('data-drop-target');
}

rows.addEventListener('dragover', event => {
    if (!dragId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    clearDropTarget();
    event.target.closest('[data-band-id]')?.toggleAttribute('data-drop-target', true);
});
rows.addEventListener('drop', event => {
    if (!dragId) return;
    event.preventDefault();
    const toId = event.target.closest('[data-band-id]')?.dataset.bandId;
    if (toId) reorder(dragId, toId);
    dragId = '';
    clearDropTarget();
});
rows.addEventListener('dragend', () => {
    dragId = '';
    clearDropTarget();
});

byId('apply-times').addEventListener('click', () => {
    if (fillTimetableTimes(state.entries, state.day, byId('start').value, Number(byId('interval').value))) {
        flagChange();
        render();
    } else {
        status('開始時刻と出演間隔を確認してください。出演時刻は翌日にまたがるようには設定できません。', true);
    }
});

saveButton.addEventListener('click', async () => {
    if (!state || saving || !state.dates.length) return;
    const {eventRef, eventId, event, day, performanceDates} = state;
    const entries = timetableEntriesForSave(state.entries);
    const published = byId('published').checked;
    const showTimes = byId('show-times').checked;
    saving = true;
    editor.disabled = true;
    eventSelect.disabled = true;
    status('変更を保存しています…');
    try {
        await runTransaction(db, async transaction => {
            const current = (await transaction.get(eventRef)).data();
            const previousStamp = event.timetableUpdatedAt;
            const currentStamp = current?.timetableUpdatedAt;
            const sameRevision = (!previousStamp && !currentStamp) || previousStamp?.isEqual?.(currentStamp);
            if (!current || !sameRevision || current.startDate !== event.startDate ||
                current.date !== event.date || current.endDate !== event.endDate) {
                throw new Error('他の画面でイベントが更新されました。再読み込みしてから編集してください。');
            }
            transaction.update(eventRef, {
                timetable: {...(current.timetable || {}), published, showTimes, entries},
                timetableUpdatedAt: serverTimestamp()
            });
            for (const {bandId, date} of entries) {
                if (date === performanceDates.get(bandId)) continue;
                transaction.update(doc(db, 'bands', bandId), new FieldPath('performanceDates', eventId), date);
            }
        });
        const message = published ? 'タイムテーブルを保存・公開しました。' : '下書きを保存しました。';
        await loadEvent(eventId, day, message);
    } catch (error) {
        console.error('Timetable save failed:', error);
        const message = error.message.startsWith('他の画面') ? error.message : '保存に失敗しました。時間をおいて再度お試しください。';
        status(message, true);
    } finally {
        saving = false;
        editor.disabled = false;
        eventSelect.disabled = false;
    }
});

window.addEventListener('beforeunload', event => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = '';
});

initAdminPage('timetable', async () => {
    if (initialized) return;
    initialized = true;
    status('イベント一覧を読み込んでいます…');
    try {
        const [events, settings] = await Promise.all([
            getDocs(collection(db, 'events')),
            getDoc(doc(db, 'system', 'settings'))
        ]);
        const available = events.docs.map(snapshot => ({...snapshot.data(), id:snapshot.id}))
            .sort((a, b) => String(b.startDate || b.date || '').localeCompare(String(a.startDate || a.date || '')));
        if (!available.length) {
            status('イベントが登録されていません。');
            return;
        }
        for (const event of available) {
            const name = event.event || event.name || event.id;
            eventSelect.add(new Option(name, event.id));
        }
        const requested = new URLSearchParams(location.search).get('eventID');
        const active = settings.data()?.activeEventId;
        const selected = [requested, active].find(id => available.some(event => event.id === id)) || available[0].id;
        eventSelect.value = selected;
        await loadEvent(selected);
    } catch (error) {
        console.error('Event list load failed:', error);
        status('イベント一覧を読み込めませんでした。ページを再読み込みしてください。', true);
    }
});
