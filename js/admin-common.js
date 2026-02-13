import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Firebase Configuration ---
const firebaseConfig = {
    apiKey: "AIzaSyAWtITnn5uMOPBgOY0Bd7Rt5IN1ry8XoJI",
    authDomain: "urakata-app.firebaseapp.com",
    projectId: "urakata-app",
    storageBucket: "urakata-app.firebasestorage.app",
    messagingSenderId: "407777765696",
    appId: "1:407777765696:web:045c2d94729022b4eab2a5"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// --- LINE LIFF ID (もし使う場合) ---
export const LIFF_ID = "2008162165-WaEbbUrr"; 

/**
 * 管理画面の初期化関数
 * @param {string} activePageId - 現在のページID (例: 'dashboard', 'bands', 'users'...)
 * @param {function} [callback] - 認証成功時に実行するコールバック関数 (任意)
 */
export function initAdminPage(activePageId, callback) {
    // 認証状態の監視
    onAuthStateChanged(auth, (user) => {
        if (!user) {
            // ログインしていなければログイン画面へリダイレクト
            // ※現在地がすでにログイン画面ならリダイレクトしない
            if (!window.location.href.includes('/admin/login.html')) {
                window.location.href = "/admin/login.html";
            }
        } else {
            // ログイン済みならサイドバーを描画して画面を表示
            renderSidebar(activePageId, user);
            
            // bodyのhiddenクラスを削除して画面を表示
            document.body.classList.remove('hidden');
            
            // DB接続ステータスの更新（あれば）
            const dbStatus = document.getElementById('db-status');
            if(dbStatus) {
                dbStatus.innerHTML = '<i class="fa-solid fa-circle text-[8px] text-green-500 animate-pulse"></i> Connected';
            }

            // 個別の処理を実行
            if (callback) callback(user);
        }
    });
}

/**
 * サイドバーを生成してbodyの先頭に挿入する関数
 */
function renderSidebar(activePage, user) {
    // アクティブなボタンのスタイル定義
    const getActiveClass = (id) => {
        if (activePage === id) {
            // ページごとのテーマカラー設定
            switch(id) {
                case 'dashboard': return 'bg-blue-50 text-blue-600 font-bold shadow-sm';
                case 'bands':     return 'bg-purple-50 text-purple-600 font-bold shadow-sm';
                case 'cuesheets': return 'bg-pink-50 text-pink-600 font-bold shadow-sm';
                case 'users':     return 'bg-indigo-50 text-indigo-600 font-bold shadow-sm';
                case 'reservation': return 'bg-red-50 text-red-600 font-bold shadow-sm';
                case 'fees':      return 'bg-orange-50 text-orange-600 font-bold shadow-sm';
                case 'events':    return 'bg-sky-50 text-sky-600 font-bold shadow-sm';
                default:          return 'bg-gray-100 text-gray-800 font-bold';
            }
        }
        return 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors';
    };

    const sidebarHTML = `
    <aside class="w-[260px] bg-white border-r border-gray-200 flex flex-col fixed h-full z-30 shadow-sm text-left font-sans">
        <div class="p-8">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
                    <i class="fa-solid fa-guitar text-xl"></i>
                </div>
                <div>
                    <h1 class="text-xl font-extrabold tracking-tighter leading-none">LMC <span class="text-blue-600">Admin</span></h1>
                    <p class="text-[9px] text-gray-400 uppercase font-bold tracking-[0.2em] mt-1 leading-none">Control Panel</p>
                </div>
            </div>
        </div>

        <nav class="flex-1 px-4 space-y-1.5 overflow-y-auto">
            <p class="text-[10px] font-extrabold text-gray-400 px-4 mb-3 uppercase tracking-widest">Main Menu</p>
            
            <a href="/admin/" class="nav-btn w-full flex items-center p-3.5 rounded-2xl ${getActiveClass('dashboard')}">
                <i class="fa-solid fa-house w-6 text-center"></i>
                <span class="ml-3 text-sm font-bold">ダッシュボード</span>
            </a>
            
            <a href="/admin/band/" class="nav-btn w-full flex items-center p-3.5 rounded-2xl ${getActiveClass('bands')}">
                <i class="fa-solid fa-users-rectangle w-6 text-center"></i>
                <span class="ml-3 text-sm font-bold">バンド管理</span>
            </a>
            
            <a href="/admin/cue/" class="nav-btn w-full flex items-center p-3.5 rounded-2xl ${getActiveClass('cuesheets')}">
                <i class="fa-solid fa-file-invoice w-6 text-center"></i>
                <span class="ml-3 text-sm font-bold">Cueシート</span>
            </a>
            
            <a href="/admin/user/" class="nav-btn w-full flex items-center p-3.5 rounded-2xl ${getActiveClass('users')}">
                <i class="fa-solid fa-user-gear w-6 text-center"></i>
                <span class="ml-3 text-sm font-bold">個人管理</span>
            </a>
            
            <a href="/admin/booking/" class="nav-btn w-full flex items-center p-3.5 rounded-2xl ${getActiveClass('reservation')}">
                <i class="fa-solid fa-calendar-check w-6 text-center"></i>
                <span class="ml-3 text-sm font-bold">予約管理</span>
            </a>
            
            <a href="/admin/expenses/" class="nav-btn w-full flex items-center p-3.5 rounded-2xl ${getActiveClass('fees')}">
                <i class="fa-solid fa-coins w-6 text-center"></i>
                <span class="ml-3 text-sm font-bold">部費管理</span>
            </a>
            
            <a href="/admin/event/" class="nav-btn w-full flex items-center p-3.5 rounded-2xl ${getActiveClass('events')}">
                <i class="fa-solid fa-bullhorn w-6 text-center"></i>
                <span class="ml-3 text-sm font-bold">イベント管理</span>
            </a>
        </nav>

        <div class="p-6 border-t border-gray-100">
            <div class="flex items-center gap-3 bg-gray-50 p-3 rounded-2xl border border-gray-100">
                <div class="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold shadow-inner">
                    ${user.displayName ? user.displayName[0] : 'A'}
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-bold text-gray-800 truncate text-left">${user.displayName || 'Admin User'}</p>
                    <p class="text-[10px] text-gray-500 font-medium tracking-tight text-left">Logged In</p>
                </div>
                <button onclick="handleSignOut()" class="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all" title="ログアウト">
                    <i class="fa-solid fa-right-from-bracket"></i>
                </button>
            </div>
        </div>
    </aside>`;
    
    document.body.insertAdjacentHTML('afterbegin', sidebarHTML);
}

// --- Global Functions ---

// ログアウト処理（HTMLのonclickから呼べるようにwindowに登録）
window.handleSignOut = async () => {
    if (confirm("ログアウトしますか？")) {
        try {
            await signOut(auth);
            window.location.href = "/admin/login.html";
        } catch (error) {
            console.error("Logout failed", error);
            alert("ログアウトに失敗しました");
        }
    }
};
