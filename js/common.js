// ... existing code ...
export const MY_LIFF_ID = "2008162165-vVODNp12";

// 共通ユーティリティ（略）
window.showCustomAlert = (msg, title="通知") => { ... };

// 【追加】ヘッダーアイコン描画ロジック
window.renderHeaderIcons = (d) => {
    if(!d) return;
    let r=""; const aff=d.affiliations||[], isU=aff.includes("urakata");
    if(d.birthday){
        const t=new Date(), b=new Date(d.birthday);
        if(t.getMonth()===b.getMonth() && t.getDate()===b.getDate()) r="ring-birthday";
    }
    if(!r && isU) r=d.job?`ring-${d.job}`:"ring-rainbow";
    const el = document.getElementById('headerIconBands');
    if(el){ 
        el.innerHTML=`<img src="${d.icon||'https://ul.h3z.jp/Vnukmtvq.jpg'}">`; 
        el.className="header-avatar "+r; 
        el.onclick = () => window.openUserStatusModal(d); 
    }
};

// 【追加】共通のステータスモーダル表示ロジック
window.openUserStatusModal = async (userData) => {
    // 必要なDOMがページ内に存在することを確認
    const modal = document.getElementById('modal-user-status');
    if(!modal) return;

    const year=2026; const status=userData.feeStatus||{};
    document.getElementById('modalUserIcon').src=userData.icon||'https://ul.h3z.jp/Vnukmtvq.jpg';
    document.getElementById('modalUserName').innerHTML = `${userData.name} <span style="font-size:14px; font-weight:normal; color:#536471; margin-left:2px;">さん</span>`;
    // ※currentProfileなどは必要に応じてwindowから参照するか引数で渡す
    
    // ヘッダー背景画像の設定
    const headerBg = document.getElementById('modalHeaderBg');
    headerBg.style.background = userData.headerImage ? `url(${userData.headerImage}) center/cover no-repeat` : `linear-gradient(135deg, #c2e7ff 0%, #0b57d0 100%)`;

    // 部費状況などの更新（DOMIDがページ内にある前提）
    const t1=document.getElementById('statusFeeTerm1'), t2=document.getElementById('statusFeeTerm2');
    if(t1) {
        t1.innerText=`前期: ${status[`${year}_1`]?'済':'未納'}`; 
        t1.className=`fee-status-badge ${status[`${year}_1`]?'fee-paid':'fee-unpaid'}`;
    }
    if(t2) {
        t2.innerText=`後期: ${status[`${year}_2`]?'済':'未納'}`; 
        t2.className=`fee-status-badge ${status[`${year}_2`]?'fee-paid':'fee-unpaid'}`;
    }
    document.getElementById('myQRCodeArea').innerHTML=`<img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${userData.id}" style="width:100%;height:100%;">`;
    
    modal.classList.add('open');
};

// ナビゲーションの描画ロジック（既存）
export function renderNav() {
// ... existing code ...
```

---

### 2. `index.html` の修正
`index.html` 内の冗長な関数を削除し、共通の関数を呼び出すように変更します。

**478行目付近からの `renderHeaderIcons` を削除し、以下に置き換えます**
```javascript
// ... index.html 内の <script type="module"> セクション ...

// 【修正】削除対象：index.html内にあった function renderHeaderIcons(d) { ... } は削除します。
// 代わりに、common.jsの関数を呼び出すようにします。

// 【修正】削除対象：index.html内にあった window.openUserStatusModal = async () => { ... } は削除します。
```

**750行目付近（`main()`関数内）の呼び出しを修正**
```javascript
// ... existing code ...
// 3. 最新データを取得
const userSnap = await getDoc(doc(db, "users", currentUser));
if(!userSnap.exists()){ location.href=MY_PAGE_URL; return; }
currentUserData = userSnap.data();
currentUserData.id = currentUser; // IDを付与しておく

localStorage.setItem(CACHE_KEY_USER, JSON.stringify(currentUserData));

// 【修正】common.js側のrenderHeaderIconsを呼び出す
window.renderHeaderIcons(currentUserData); 
// ... existing code ...
```

### 今後の運用ルール
1.  **各HTMLページ:** `modal-user-status` のようなモーダルのHTML構造（`<div>`タグ群）は、各ページ（`booking.html`など）に記述しておく必要があります。
2.  **ロジック:** モーダルを開く `window.openUserStatusModal` やヘッダーを制御する `window.renderHeaderIcons` はすべて `common.js` に集約されます。

こうすることで、`booking.html` にアイコンを置いて `onclick="window.renderHeaderIcons(data)"` と書くだけで、どのページでも同じ挙動が実現できるようになります。
