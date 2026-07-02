// Firebase・LIFF共通設定
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

const firebaseConfig = { 
    apiKey: "AIzaSyAWtITnn5uMOPBgOY0Bd7Rt5IN1ry8XoJI", 
    authDomain: "urakata-app.firebaseapp.com", 
    projectId: "urakata-app", 
    storageBucket: "urakata-app.firebasestorage.app", 
    messagingSenderId: "407777765696", 
    appId: "1:407777765696:web:045c2d94729022b4eab2a5" 
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const MY_LIFF_ID = "2008162165-vVODNp12";

// 共通ユーティリティ
window.showCustomAlert = (msg, title="通知") => {
    // モーダル表示ロジック（既存コードをここに統合）
};

// ナビゲーションの描画ロジック
export function renderNav() {
    const container = document.getElementById('nav-container');
    if (!container) return;
    
    const path = window.location.pathname;
    const isAdmin = localStorage.getItem('lmc_is_admin') === 'true';
    const items = [
        { id: 'index', label: 'マイバンド', icon: 'groups', href: '/index.html' },
        { id: 'booking', label: '合わせ予約', icon: 'calendar_month', href: '/booking.html' },
        { id: 'admin', label: '管理', icon: 'admin_panel_settings', href: '/manage.html', hidden: !isAdmin },
        { id: 'mypage', label: 'マイページ', icon: 'account_circle', onClick: 'location.href="https://mypage.sorairosystem.com"' }
    ];

    let html = '<div class="bottom-nav">';
    items.forEach(item => {
        if(item.hidden) return;
        const isActive = path.includes(item.id) || (path === '/' && item.id === 'index');
        const clickAction = item.onClick ? `onclick="${item.onClick}"` : `onclick="window.location.href='${item.href}'"`;
        html += `
            <div class="nav-item ${isActive ? 'active' : ''}" ${clickAction}>
                <span class="material-icons nav-icon">${item.icon}</span>
                <span>${item.label}</span>
            </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}
