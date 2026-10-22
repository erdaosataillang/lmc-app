import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {openUnifiedProfileModal} from "./profile-popover.js?v=20261022-3";
import {applyPartAvatarRing} from "./avatar-ring.js?v=20261022-1";

const firebaseConfig = { 
    apiKey: "AIzaSyAWtITnn5uMOPBgOY0Bd7Rt5IN1ry8XoJI", 
    authDomain: "urakata-app.firebaseapp.com", 
    projectId: "urakata-app", 
    storageBucket: "urakata-app.firebasestorage.app", 
    messagingSenderId: "407777765696", 
    appId: "1:407777765696:web:045c2d94729022b4eab2a5", 
    measurementId: "G-9ZRMD26XNJ" 
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const MY_LIFF_ID = "2008162165-vVODNp12";
const safeImageUrl = value => { try { const url = new URL(value || 'https://ul.h3z.jp/Vnukmtvq.jpg', location.href); return ['https:','http:'].includes(url.protocol) ? url.href : 'https://ul.h3z.jp/Vnukmtvq.jpg'; } catch (_) { return 'https://ul.h3z.jp/Vnukmtvq.jpg'; } };
export const renderHeaderIcons = (d, targetId = 'headerIconCal') => {
    if (!d) return;
    const el = document.getElementById(targetId);
    if (!el) return;
    el.replaceChildren(Object.assign(document.createElement('img'), {src: safeImageUrl(d.icon), alt: ''}));
    applyPartAvatarRing(el, d);
    el.onclick = () => openUnifiedProfileModal(d);
};

export const openUserStatusModal = (userData = null) => openUnifiedProfileModal(userData);

// 【重要】windowオブジェクトに紐付ける（HTMLの onclick="..." で使うため）
window.renderHeaderIcons = renderHeaderIcons;
window.closeModal = (id) => document.getElementById(id).classList.remove('open');

window.renderHeaderIcons = (d) => {
    if (!d) return;
    let r = ""; 
    const aff = d.affiliations || [], isU = aff.includes("urakata");
    if (d.birthday) {
        const t = new Date(), b = new Date(d.birthday);
        if (t.getMonth() === b.getMonth() && t.getDate() === b.getDate()) r = "ring-birthday";
    }
    if (!r && isU) r = d.job ? `ring-${d.job}` : "ring-rainbow";
    
    const el = document.getElementById('headerIconBands');
    if (el) {
        el.replaceChildren(Object.assign(document.createElement('img'), {src: safeImageUrl(d.icon), alt: ''}));
        el.className = "header-avatar " + r;
        applyPartAvatarRing(el, d);
        el.onclick = () => openUnifiedProfileModal(d);
    }
    
    // 管理者タブ表示制御
    const hasLmcAll = d.roll && (Array.isArray(d.roll) ? d.roll.includes('lmc_all') : d.roll === 'lmc_all');
    const navAdminEl = document.getElementById('nav-admin');
    if (navAdminEl) {
        if (isU && (d.role || hasLmcAll)) {
            navAdminEl.classList.remove('hidden');
        } else {
            navAdminEl.classList.add('hidden');
        }
    }
};

window.openUserStatusModal = openUserStatusModal;

export function renderNav() {
    const container = document.getElementById('nav-container');
    if (!container) return;
    
    const path = window.location.pathname;
    const isAdmin = localStorage.getItem('lmc_is_admin') === 'true';
    
    const items = [
        { id: 'index', label: 'マイバンド', icon: 'groups', href: '/index.html' },
        { id: 'timetable', label: 'タイムテーブル', icon: 'view_timeline', href: '/timetable.html' },
        { id: 'booking', label: '合わせ予約', icon: 'calendar_month', href: '/booking.html' },
        { id: 'admin', label: '管理', icon: 'admin_panel_settings', href: '/manage.html', hidden: !isAdmin },
        { id: 'mypage', label: 'マイページ', icon: 'account_circle', href: '/mypage.html' }
    ];

    let html = '<div class="bottom-nav">';
    items.forEach(item => {
        if (item.hidden) return;
        const isActive = path.includes(item.id) || (path === '/' && item.id === 'index');
        const clickAction = item.onClick ? `onclick="${item.onClick}"` : `onclick="window.location.href='${item.href}'"`;
        html += `
            <div class="nav-item ${isActive ? 'active' : ''}" ${item.id ? `id="nav-${item.id}"` : ''} ${clickAction}>
                <span class="material-icons nav-icon">${item.icon}</span>
                <span>${item.label}</span>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}
