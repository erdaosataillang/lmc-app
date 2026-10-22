let notificationRoot = null;

function ensureNotificationPopover() {
    if (notificationRoot) return notificationRoot;

    const style = document.createElement("style");
    style.textContent = `
        .unified-notification-backdrop{position:fixed;inset:0;z-index:12100;background:rgba(15,23,42,.42);display:none;align-items:flex-end;justify-content:center;padding:16px;padding-bottom:max(16px,env(safe-area-inset-bottom));backdrop-filter:blur(4px)}
        .unified-notification-backdrop.open{display:flex;animation:unifiedNotificationFade .16s ease-out}
        .unified-notification-card{width:min(100%,420px);max-height:min(78vh,680px);background:#fff;border-radius:26px;overflow:hidden;box-shadow:0 24px 70px rgba(15,23,42,.28);display:flex;flex-direction:column;animation:unifiedNotificationUp .22s cubic-bezier(.2,.8,.2,1)}
        .unified-notification-handle{width:38px;height:4px;border-radius:999px;background:#d7dce3;margin:9px auto 2px;flex:none}
        .unified-notification-head{display:flex;align-items:center;justify-content:space-between;padding:12px 18px 14px;border-bottom:1px solid #edf0f4;flex:none}
        .unified-notification-title{font-size:19px;font-weight:800;color:#172033}
        .unified-notification-close{width:34px;height:34px;border:0;border-radius:50%;background:#f1f3f6;color:#536471;display:grid;place-items:center;padding:0;cursor:pointer}
        .unified-notification-list{overflow-y:auto;overscroll-behavior:contain;padding:5px 0 12px}
        .unified-notification-list .notification-item,.unified-notification-list .notice{display:flex!important;align-items:flex-start!important;gap:13px!important;padding:15px 18px!important;border-bottom:1px solid #f0f2f5!important;background:#fff!important;color:#172033!important}
        .unified-notification-list .notification-item.clickable,.unified-notification-list .notice.clickable,.unified-notification-list [onclick]{cursor:pointer}
        .unified-notification-list .notif-icon-box,.unified-notification-list .row-icon,.unified-notification-list .notification-item>.material-icons{width:40px!important;height:40px!important;border-radius:50%!important;display:grid!important;place-items:center!important;flex:0 0 40px!important;background:#edf4ff;color:#0b57d0}
        .unified-notification-list .notif-icon-box.warning{background:#fdecec!important;color:#d93025!important}
        .unified-notification-list .notif-content,.unified-notification-list .row-copy{min-width:0;flex:1}
        .unified-notification-list .notif-text,.unified-notification-list .row-value{font-size:14px!important;font-weight:800!important;line-height:1.45!important;color:#172033!important}
        .unified-notification-list .row-label{font-size:12px!important;line-height:1.5!important;color:#667085!important}
        .unified-notification-empty{padding:54px 20px;text-align:center;color:#8a94a3;font-size:14px}
        .unified-notification-loading{padding:44px 20px;text-align:center;color:#8a94a3;font-size:14px}
        @keyframes unifiedNotificationFade{from{opacity:0}to{opacity:1}}
        @keyframes unifiedNotificationUp{from{transform:translateY(24px);opacity:.7}to{transform:translateY(0);opacity:1}}
        @media(min-width:700px){.unified-notification-backdrop{align-items:center}.unified-notification-card{border-radius:24px}.unified-notification-handle{display:none}.unified-notification-head{padding-top:18px}}
    `;
    document.head.appendChild(style);

    notificationRoot = document.createElement("div");
    notificationRoot.id = "unified-notification-popover";
    notificationRoot.className = "unified-notification-backdrop";
    notificationRoot.setAttribute("aria-hidden", "true");
    notificationRoot.innerHTML = `
        <section class="unified-notification-card" role="dialog" aria-modal="true" aria-labelledby="unified-notification-title">
            <div class="unified-notification-handle"></div>
            <header class="unified-notification-head">
                <div class="unified-notification-title" id="unified-notification-title">通知</div>
                <button class="unified-notification-close" type="button" aria-label="閉じる"><span class="material-icons material-icons-round">close</span></button>
            </header>
            <div class="unified-notification-list"></div>
        </section>`;
    document.body.appendChild(notificationRoot);

    notificationRoot.addEventListener("click", event => {
        if (event.target === notificationRoot) closeUnifiedNotificationModal();
        if (event.target.closest(".unified-notification-list [onclick],.unified-notification-list a,.unified-notification-list button")) {
            setTimeout(closeUnifiedNotificationModal, 0);
        }
    });
    notificationRoot.querySelector(".unified-notification-close").addEventListener("click", closeUnifiedNotificationModal);
    document.addEventListener("keydown", event => { if (event.key === "Escape" && notificationRoot?.classList.contains("open")) closeUnifiedNotificationModal(); });
    return notificationRoot;
}

export function setUnifiedNotificationContent(html) {
    const root = ensureNotificationPopover();
    root.querySelector(".unified-notification-list").innerHTML = html || '<div class="unified-notification-empty">新しい通知はありません</div>';
}

export function openUnifiedNotificationModal(html = null) {
    const root = ensureNotificationPopover();
    setUnifiedNotificationContent(html === null ? '<div class="unified-notification-loading">読み込み中...</div>' : html);
    root.classList.add("open");
    root.setAttribute("aria-hidden", "false");
    document.documentElement.style.overflow = "hidden";
    root.querySelector(".unified-notification-close").focus({preventScroll: true});
}

export function openUnifiedNotificationItems(items = []) {
    const root = ensureNotificationPopover();
    const list = root.querySelector(".unified-notification-list");
    list.replaceChildren();
    if (!items.length) {
        const empty = document.createElement("div");
        empty.className = "unified-notification-empty";
        empty.textContent = "新しい通知はありません";
        list.appendChild(empty);
    } else {
        items.forEach(item => {
            const row = document.createElement("div");
            row.className = "notification-item";
            const iconBox = document.createElement("div");
            iconBox.className = "notif-icon-box";
            const icon = document.createElement("span");
            icon.className = "material-icons material-icons-round";
            icon.textContent = item.icon || "notifications";
            iconBox.appendChild(icon);
            const copy = document.createElement("div");
            copy.className = "notif-content";
            const title = document.createElement("div");
            title.className = "notif-text";
            title.textContent = item.title || "お知らせ";
            copy.appendChild(title);
            if (item.body) {
                const body = document.createElement("div");
                body.className = "row-label";
                body.style.marginTop = "4px";
                body.textContent = item.body;
                copy.appendChild(body);
            }
            row.append(iconBox, copy);
            list.appendChild(row);
        });
    }
    root.classList.add("open");
    root.setAttribute("aria-hidden", "false");
    document.documentElement.style.overflow = "hidden";
    root.querySelector(".unified-notification-close").focus({preventScroll: true});
}

export function closeUnifiedNotificationModal() {
    if (!notificationRoot) return;
    notificationRoot.classList.remove("open");
    notificationRoot.setAttribute("aria-hidden", "true");
    document.documentElement.style.overflow = "";
}

window.closeUnifiedNotificationModal = closeUnifiedNotificationModal;
