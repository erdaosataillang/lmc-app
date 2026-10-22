const STYLE_ID = 'lmc-part-avatar-ring-style';

const PART_COLORS = [
    { keys: ['vocal', 'vo', 'ボーカル', 'ヴォーカル'], color: '#f2aaca', glow: 'rgba(242,170,202,.42)' },
    { keys: ['guitar', 'gt', 'ギター'], color: '#9fc8f2', glow: 'rgba(159,200,242,.42)' },
    { keys: ['bass', 'ba', 'ベース'], color: '#bcaeee', glow: 'rgba(188,174,238,.42)' },
    { keys: ['drums', 'drum', 'dr', 'ドラム'], color: '#9ddbc5', glow: 'rgba(157,219,197,.42)' },
    { keys: ['keyboard', 'keys', 'key', 'キーボード', 'ピアノ'], color: '#f3d894', glow: 'rgba(243,216,148,.42)' },
    { keys: ['other', 'その他'], color: '#efb7a4', glow: 'rgba(239,183,164,.42)' }
];

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        .part-avatar-ring { overflow:visible!important; background:transparent!important; box-shadow:none!important; isolation:isolate; }
        .part-avatar-ring > img { position:relative; z-index:2; }
        .part-ring-layer { position:absolute; inset:-2px; z-index:3; border-radius:50%; pointer-events:none; }
        .part-ring-layer svg { position:absolute; inset:0; width:100%; height:100%; overflow:visible; transform:rotate(-90deg); }
        .part-ring-circle { fill:none; stroke:var(--part-ring-color,#b9c8df); stroke-width:3; stroke-linecap:round; stroke-dasharray:100; stroke-dashoffset:0; filter:drop-shadow(0 0 3px var(--part-ring-glow,rgba(185,200,223,.4))); }
        .part-ring-orbit { position:absolute; inset:0; opacity:0; }
        .part-ring-dot { position:absolute; inset:0; transform:rotate(var(--part-dot-angle)); }
        .part-ring-dot::after { content:""; position:absolute; left:50%; top:-1px; width:var(--part-dot-size); height:var(--part-dot-size); transform:translateX(-50%); border-radius:50%; background:var(--part-ring-color,#b9c8df); opacity:var(--part-dot-opacity); box-shadow:0 0 6px 1px var(--part-ring-glow,rgba(185,200,223,.4)); }
        .part-avatar-ring.part-ring-animate .part-ring-circle { animation:lmcPartRingSweep 2s cubic-bezier(.2,.72,.15,1) both; }
        .part-avatar-ring.part-ring-animate .part-ring-orbit { animation:lmcPartRingOrbit 2s cubic-bezier(.3,.08,.2,1) both; }
        @keyframes lmcPartRingSweep { from { stroke-dashoffset:100; } to { stroke-dashoffset:0; } }
        @keyframes lmcPartRingOrbit { 0% { transform:rotate(0); opacity:0; } 6% { opacity:1; } 90% { opacity:1; } 100% { transform:rotate(360deg); opacity:0; } }
        @media (prefers-reduced-motion:reduce) { .part-avatar-ring.part-ring-animate .part-ring-circle { animation:none; stroke-dashoffset:0; } .part-avatar-ring.part-ring-animate .part-ring-orbit { display:none; animation:none; } }
    `;
    document.head.appendChild(style);
}

function partText(part) {
    if (Array.isArray(part)) return part.join(' ');
    if (part && typeof part === 'object') return Object.entries(part).filter(([, enabled]) => Boolean(enabled)).map(([name]) => name).join(' ');
    return String(part || '');
}

export function getPartRingColor(part) {
    const value = partText(part).toLowerCase();
    const match = PART_COLORS.find(entry => entry.keys.some(key => value.includes(key)));
    return match || { color: '#b9c8df', glow: 'rgba(185,200,223,.42)' };
}

export function applyPartAvatarRing(element, userData = {}) {
    if (!element) return;
    injectStyles();
    const palette = getPartRingColor(userData.part);
    element.style.setProperty('--part-ring-color', palette.color);
    element.style.setProperty('--part-ring-glow', palette.glow);
    element.classList.add('part-avatar-ring');

    let layer = element.querySelector('.part-ring-layer');
    if (!layer) {
        layer = document.createElement('span');
        layer.className = 'part-ring-layer';
        layer.setAttribute('aria-hidden', 'true');
        layer.innerHTML = '<svg viewBox="0 0 40 40"><circle class="part-ring-circle" cx="20" cy="20" r="18" pathLength="100"></circle></svg><span class="part-ring-orbit"><i class="part-ring-dot" style="--part-dot-angle:0deg;--part-dot-size:6px;--part-dot-opacity:1"></i><i class="part-ring-dot" style="--part-dot-angle:-13deg;--part-dot-size:5px;--part-dot-opacity:.78"></i><i class="part-ring-dot" style="--part-dot-angle:-26deg;--part-dot-size:4px;--part-dot-opacity:.56"></i><i class="part-ring-dot" style="--part-dot-angle:-39deg;--part-dot-size:3px;--part-dot-opacity:.36"></i></span>';
        element.appendChild(layer);
    }

    const signature = `${palette.color}:${partText(userData.part)}`;
    if (element.dataset.partRingAnimated !== signature) {
        element.dataset.partRingAnimated = signature;
        element.classList.remove('part-ring-animate');
        void element.offsetWidth;
        element.classList.add('part-ring-animate');
    }
}
