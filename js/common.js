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
};

window.openUserStatusModal = async (userData) => {
    const modal = document.getElementById('modal-user-status');
    if (!modal) return;

    const year = 2026;
    const status = userData.feeStatus || {};
    const icon = document.getElementById('modalUserIcon');
    const name = document.getElementById('modalUserName');
    
    if (icon) icon.src = userData.icon || 'https://ul.h3z.jp/Vnukmtvq.jpg';
    if (name) name.innerHTML = `${userData.name} <span style="font-size:14px; font-weight:normal; color:#536471; margin-left:2px;">さん</span>`;

    const headerBg = document.getElementById('modalHeaderBg');
    if (headerBg) {
        headerBg.style.background = userData.headerImage 
            ? `url(${userData.headerImage}) center/cover no-repeat` 
            : `linear-gradient(135deg, #c2e7ff 0%, #0b57d0 100%)`;
    }

    const t1 = document.getElementById('statusFeeTerm1');
    const t2 = document.getElementById('statusFeeTerm2');
    if (t1) {
        t1.innerText = `前期: ${status[`${year}_1`] ? '済' : '未納'}`;
        t1.className = `fee-status-badge ${status[`${year}_1`] ? 'fee-paid' : 'fee-unpaid'}`;
    }
    if (t2) {
        t2.innerText = `後期: ${status[`${year}_2`] ? '済' : '未納'}`;
        t2.className = `fee-status-badge ${status[`${year}_2`] ? 'fee-paid' : 'fee-unpaid'}`;
    }
    
    const qrArea = document.getElementById('myQRCodeArea');
    if (qrArea) {
        qrArea.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${userData.id}" style="width:100%;height:100%;">`;
    }
    
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
