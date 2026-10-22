const DEFAULT_ICON = "https://ul.h3z.jp/Vnukmtvq.jpg";

function safeImageUrl(value, fallback = DEFAULT_ICON) {
    try {
        const url = new URL(value || fallback, window.location.href);
        return ["https:", "http:"].includes(url.protocol) ? url.href : fallback;
    } catch (_) {
        return fallback;
    }
}

function readCachedUser() {
    try {
        return JSON.parse(localStorage.getItem("lmc_user_cache") || "{}");
    } catch (_) {
        return {};
    }
}

function joinedBandCount(user) {
    try {
        const bands = JSON.parse(localStorage.getItem("lmc_bands_cache") || "[]");
        const uid = user.id || user.lineUserId || "";
        return Array.isArray(bands) ? bands.filter(band => Array.isArray(band.memberIds) && band.memberIds.includes(uid)).length : 0;
    } catch (_) {
        return 0;
    }
}

function ensureProfilePopover() {
    let root = document.getElementById("unified-profile-popover");
    if (root) return root;

    const style = document.createElement("style");
    style.textContent = `
        .unified-profile-backdrop{position:fixed;inset:0;z-index:12000;background:rgba(15,23,42,.42);display:none;align-items:flex-end;justify-content:center;padding:16px;padding-bottom:max(16px,env(safe-area-inset-bottom));backdrop-filter:blur(4px)}
        .unified-profile-backdrop.open{display:flex;animation:unifiedProfileFade .16s ease-out}
        .unified-profile-card{width:min(100%,420px);background:#fff;border-radius:26px;overflow:hidden;box-shadow:0 24px 70px rgba(15,23,42,.28);animation:unifiedProfileUp .22s cubic-bezier(.2,.8,.2,1)}
        .unified-profile-cover{height:112px;background:linear-gradient(135deg,#c2e7ff,#0b57d0);background-position:center;background-size:cover;position:relative}
        .unified-profile-close{position:absolute;top:14px;right:14px;width:34px;height:34px;border:0;border-radius:50%;background:rgba(0,0,0,.42);color:#fff;display:grid;place-items:center;padding:0;cursor:pointer}
        .unified-profile-body{padding:0 20px 22px}
        .unified-profile-avatar{width:82px;height:82px;border-radius:50%;border:4px solid #fff;background:#fff;object-fit:cover;margin-top:-42px;position:relative;box-shadow:0 4px 14px rgba(15,23,42,.14)}
        .unified-profile-name{font-size:22px;font-weight:800;color:#0f1419;margin-top:8px;line-height:1.25;overflow-wrap:anywhere}
        .unified-profile-sub{font-size:13px;color:#536471;margin-top:4px;min-height:18px}
        .unified-profile-tags{display:flex;flex-wrap:wrap;gap:7px;margin-top:14px}
        .unified-profile-tag{font-size:12px;font-weight:700;color:#31506f;background:#eef5ff;border-radius:999px;padding:6px 10px}
        .unified-profile-stats{display:flex;gap:6px;margin-top:18px;padding:14px 16px;background:#f7f9fc;border-radius:16px}
        .unified-profile-stat-value{font-size:18px;font-weight:800;color:#1f1f1f}
        .unified-profile-stat-label{font-size:12px;color:#536471;margin-left:5px}
        .unified-profile-action{width:100%;border:0;border-radius:999px;background:#0b57d0;color:#fff;font:inherit;font-size:14px;font-weight:800;padding:13px 18px;margin-top:18px;cursor:pointer}
        @keyframes unifiedProfileFade{from{opacity:0}to{opacity:1}}
        @keyframes unifiedProfileUp{from{transform:translateY(24px);opacity:.7}to{transform:translateY(0);opacity:1}}
        @media(min-width:700px){.unified-profile-backdrop{align-items:center}.unified-profile-card{border-radius:24px}}
    `;
    document.head.appendChild(style);

    root = document.createElement("div");
    root.id = "unified-profile-popover";
    root.className = "unified-profile-backdrop";
    root.setAttribute("aria-hidden", "true");
    root.innerHTML = `
        <section class="unified-profile-card" role="dialog" aria-modal="true" aria-label="マイプロフィール">
            <div class="unified-profile-cover" data-profile-cover>
                <button class="unified-profile-close" type="button" aria-label="閉じる"><span class="material-icons">close</span></button>
            </div>
            <div class="unified-profile-body">
                <img class="unified-profile-avatar" data-profile-icon alt="プロフィール画像">
                <div class="unified-profile-name" data-profile-name></div>
                <div class="unified-profile-sub" data-profile-sub></div>
                <div class="unified-profile-tags" data-profile-tags></div>
                <div class="unified-profile-stats"><span class="unified-profile-stat-value" data-profile-band-count>0</span><span class="unified-profile-stat-label">参加バンド</span></div>
                <button class="unified-profile-action" type="button">マイページを開く</button>
            </div>
        </section>`;
    document.body.appendChild(root);

    const close = () => {
        root.classList.remove("open");
        root.setAttribute("aria-hidden", "true");
        document.documentElement.style.overflow = "";
    };
    root.addEventListener("click", event => { if (event.target === root) close(); });
    root.querySelector(".unified-profile-close").addEventListener("click", close);
    root.querySelector(".unified-profile-action").addEventListener("click", () => { window.location.href = "/mypage.html"; });
    document.addEventListener("keydown", event => { if (event.key === "Escape" && root.classList.contains("open")) close(); });
    return root;
}

export function openUnifiedProfileModal(userData = null) {
    const user = userData && Object.keys(userData).length ? userData : readCachedUser();
    const root = ensureProfilePopover();
    const cover = root.querySelector("[data-profile-cover]");
    const icon = root.querySelector("[data-profile-icon]");
    const name = root.querySelector("[data-profile-name]");
    const sub = root.querySelector("[data-profile-sub]");
    const tags = root.querySelector("[data-profile-tags]");

    cover.style.backgroundImage = user.headerImage ? `url("${safeImageUrl(user.headerImage)}")` : "linear-gradient(135deg,#c2e7ff,#0b57d0)";
    icon.src = safeImageUrl(user.icon);
    name.textContent = `${user.name || "名称未設定"} さん`;
    const lineName = user.lineDisplayName || user.displayName || user.lineName || "";
    sub.textContent = lineName ? `@${lineName.replace(/^@/, "")}` : "LMC Mobile";
    root.querySelector("[data-profile-band-count]").textContent = String(joinedBandCount(user));

    tags.replaceChildren();
    const tagValues = [user.grade || user.year, user.part, user.faculty, ...(Array.isArray(user.affiliations) ? user.affiliations.map(value => value === "lmc" ? "LMC" : value === "urakata" ? "裏方" : value) : [])]
        .filter((value, index, values) => value && values.indexOf(value) === index)
        .slice(0, 5);
    tagValues.forEach(value => {
        const tag = document.createElement("span");
        tag.className = "unified-profile-tag";
        tag.textContent = String(value);
        tags.appendChild(tag);
    });
    tags.hidden = tagValues.length === 0;

    root.classList.add("open");
    root.setAttribute("aria-hidden", "false");
    document.documentElement.style.overflow = "hidden";
    root.querySelector(".unified-profile-close").focus({preventScroll: true});
}

window.openUnifiedProfileModal = openUnifiedProfileModal;
