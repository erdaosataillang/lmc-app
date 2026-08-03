import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

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
export const renderHeaderIcons = (d, targetId = 'headerIconCal') => {
    if (!d) return;
    const el = document.getElementById(targetId);
    if (!el) return;
    el.innerHTML = `<img src="${d.icon || 'https://ul.h3z.jp/Vnukmtvq.jpg'}">`;
    el.onclick = () => openUserStatusModal(d);
};

export const openUserStatusModal = async (userData) => {
    const modal = document.getElementById('modal-user-status');
    if (!modal) return;
    
    // バンド数取得処理など
    const { collection, query, where, getDocs } = await import("https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js");
    const q = query(collection(db, "bands"), where("memberIds", "array-contains", userData.id || auth.currentUser.uid));
    const snap = await getDocs(q);
    
    document.getElementById('modalUserIcon').src = userData.icon || 'https://ul.h3z.jp/Vnukmtvq.jpg';
    document.getElementById('modalUserName').innerHTML = `${userData.name} さん`;
    document.getElementById('modalUserBandCount').innerText = snap.size;
    
    modal.classList.add('open');
};

// 【重要】windowオブジェクトに紐付ける（HTMLの onclick="..." で使うため）
window.renderHeaderIcons = renderHeaderIcons;
window.openUserStatusModal = openUserStatusModal;
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
        el.innerHTML = `<img src="${d.icon || 'https://ul.h3z.jp/Vnukmtvq.jpg'}">`;
        el.className = "header-avatar " + r;
        el.onclick = () => window.openUserStatusModal(d);
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

// 【修正版】共通のステータスモーダル表示ロジック
window.openUserStatusModal = async (userData = null) => {
    // 1. ユーザーIDを取得する（userDataが渡されていればそれを使用し、なければ現在のログインユーザーを使用）
    let uid = null;
    let targetUser = userData;

    if (userData && userData.id) {
        uid = userData.id;
    } else if (auth.currentUser) {
        uid = auth.currentUser.uid;
    } else {
        // まだユーザーがロードされていない場合、キャッシュから取得を試みる
        const cached = localStorage.getItem('lmc_user_cache');
        if (cached) {
            const parsed = JSON.parse(cached);
            uid = parsed.id;
            targetUser = parsed;
        }
    }

    if (!uid) {
        console.error("ユーザーIDが特定できませんでした");
        return;
    }

    const modal = document.getElementById('modal-user-status');
    if (!modal) return;

    // ...以降の処理は同じ...
    document.getElementById('modalUserIcon').src = targetUser.icon || 'https://ul.h3z.jp/Vnukmtvq.jpg';
    document.getElementById('modalUserName').innerHTML = `${targetUser.name} <span style="font-size:14px; font-weight:normal; color:#536471; margin-left:2px;">さん</span>`;
    
    // バンド数をリセット
    const elBandCount = document.getElementById('modalUserBandCount');
    if (elBandCount) elBandCount.innerText = "...";

    // Firestoreからバンド数をカウント
    try {
        const { collection, query, where, getDocs } = await import("https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js");
        const q = query(collection(db, "bands"), where("memberIds", "array-contains", uid));
        const querySnapshot = await getDocs(q);
        if (elBandCount) elBandCount.innerText = querySnapshot.size;
    } catch (error) {
        console.error("バンド数取得失敗:", error);
    }

    // ヘッダー背景の設定
    const headerBg = document.getElementById('modalHeaderBg');
    headerBg.style.background = targetUser.headerImage 
        ? `url(${targetUser.headerImage}) center/cover no-repeat` 
        : `linear-gradient(135deg, #c2e7ff 0%, #0b57d0 100%)`;

    modal.classList.add('open');
};

export function renderNav() {
    const container = document.getElementById('nav-container');
    if (!container) return;
    
    const path = window.location.pathname;
    const isAdmin = localStorage.getItem('lmc_is_admin') === 'true';
    
    const items = [
        { id: 'index', label: 'マイバンド', icon: 'groups', href: '/index.html' },
        { id: 'booking', label: '合わせ予約', icon: 'calendar_month', href: '/booking.html' },
        { id: 'admin', label: '管理', icon: 'admin_panel_settings', href: '/manage.html', hidden: !isAdmin },
        { id: 'mypage', label: 'マイページ', icon: 'account_circle', onClick: 'window.location.href="https://mypage.sorairosystem.com"' }
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
