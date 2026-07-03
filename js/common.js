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

window.showCustomAlert = (msg, title = "通知") => {
    const m = document.getElementById('modal-custom-dialog');
    if (!m) return;
    const t = document.getElementById('dialogTitle');
    const b = document.getElementById('dialogMessage');
    const c = document.getElementById('dialogBtnCancel');
    const ok = document.getElementById('dialogBtnOk');
    
    if(t) t.innerText = title;
    if(b) b.innerText = msg;
    if(c) c.classList.add('hidden');
    if(ok) ok.onclick = () => { m.classList.remove('open'); };
    m.classList.add('open');
};

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
    // 引数userDataがない場合はcurrentUserDataを使う（index.html等で呼び出す用）
    const targetUser = userData || currentUserData;
    const uid = targetUser.id || currentUser;

    const modal = document.getElementById('modal-user-status');
    if (!modal) return;

    // モーダルの初期表示（ローディング中など）
    document.getElementById('modalUserIcon').src = targetUser.icon || 'https://ul.h3z.jp/Vnukmtvq.jpg';
    document.getElementById('modalUserName').innerHTML = `${targetUser.name} <span style="font-size:14px; font-weight:normal; color:#536471; margin-left:2px;">さん</span>`;
    
    // バンド数を一度リセット
    const elBandCount = document.getElementById('modalUserBandCount');
    if (elBandCount) elBandCount.innerText = "...";

    // 1. Firestoreからこのユーザーがメンバーとして含まれるバンドを取得
    try {
        const { collection, query, where, getDocs } = await import("https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js");
        
        // memberIds 配列の中に uid が含まれているデータを検索
        const q = query(collection(db, "bands"), where("memberIds", "array-contains", uid));
        const querySnapshot = await getDocs(q);
        
        // バンド数を表示
        if (elBandCount) {
            elBandCount.innerText = querySnapshot.size;
        }
    } catch (error) {
        console.error("バンド数の取得に失敗しました:", error);
        if (elBandCount) elBandCount.innerText = "0";
    }

    // ヘッダー背景画像の設定
    const headerBg = document.getElementById('modalHeaderBg');
    headerBg.style.background = targetUser.headerImage 
        ? `url(${targetUser.headerImage}) center/cover no-repeat` 
        : `linear-gradient(135deg, #c2e7ff 0%, #0b57d0 100%)`;

    // モーダルを開く
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
