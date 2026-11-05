(() => {
    'use strict';

    class LmcCat extends HTMLElement {
        connectedCallback() {
            if (this.dataset.ready === 'true') return;
            this.dataset.ready = 'true';
            this.setAttribute('aria-hidden', 'true');
            this.innerHTML = `
                <svg class="lmc-vector-cat__svg" viewBox="0 0 120 100" focusable="false" aria-hidden="true">
                    <defs>
                        <linearGradient id="lmcCatBodyGradient" x1="24" y1="24" x2="101" y2="88" gradientUnits="userSpaceOnUse">
                            <stop offset="0" stop-color="#5b86ff"/>
                            <stop offset=".58" stop-color="#4f5ee9"/>
                            <stop offset="1" stop-color="#4338ca"/>
                        </linearGradient>
                        <linearGradient id="lmcCatTailGradient" x1="8" y1="20" x2="38" y2="78" gradientUnits="userSpaceOnUse">
                            <stop offset="0" stop-color="#8b5cf6"/>
                            <stop offset="1" stop-color="#3730a3"/>
                        </linearGradient>
                    </defs>

                    <g class="lmc-vector-cat__tail">
                        <path d="M39 76C19 82 7 68 12 51C15 41 21 36 15 27" fill="none" stroke="url(#lmcCatTailGradient)" stroke-width="9" stroke-linecap="round"/>
                        <rect x="10.7" y="12" width="5.5" height="18" rx="2.75" fill="#8b5cf6"/>
                        <path d="M13 12C19 10 23 12 24 16C20 15 17 16 14 19Z" fill="#8b5cf6"/>
                        <ellipse cx="9.5" cy="28.5" rx="7.5" ry="6" transform="rotate(-18 9.5 28.5)" fill="#8b5cf6"/>
                        <path d="M14 38L20 41" stroke="#c4b5fd" stroke-width="3.2" stroke-linecap="round"/>
                    </g>

                    <g class="lmc-vector-cat__body">
                        <path d="M36 32L43 8C44 4 48 4 51 8L63 25C69 23 75 23 81 25C86 14 98 12 108 20C103 24 104 30 109 37C107 38 105 39 102 40C108 53 108 69 101 80C95 90 85 94 73 94H45C28 94 18 84 18 68C18 51 25 39 36 32Z" fill="url(#lmcCatBodyGradient)"/>

                        <path d="M40 29L45.5 13L56 27Z" fill="#d8b4fe"/>
                        <g class="lmc-vector-cat__ear-fold">
                            <path d="M82 25C87 15 98 15 106 20C99 23 97 27 101 36Z" fill="#312e81"/>
                            <path d="M91 24C95 21 99 21 103 22C100 25 100 28 102 31Z" fill="#d8b4fe"/>
                        </g>

                        <path d="M19 59C23 50 31 46 39 47C44 59 44 75 39 89C26 86 19 79 18 68C18 65 18 62 19 59Z" fill="#3730a3" opacity=".82"/>

                        <g class="lmc-vector-cat__face">
                            <rect class="lmc-vector-cat__eye lmc-vector-cat__eye--left" x="47" y="40" width="7" height="17" rx="3.5" fill="#fff"/>
                            <rect class="lmc-vector-cat__eye lmc-vector-cat__eye--right" x="77" y="40" width="7" height="17" rx="3.5" fill="#fff"/>
                            <path d="M61 53C64 59 70 59 73 53" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round"/>
                            <path d="M35 51L44 49M34 57L43 56M88 49L97 51M89 56L98 58" stroke="#d8b4fe" stroke-width="3.2" stroke-linecap="round"/>
                        </g>

                        <g class="lmc-vector-cat__wave">
                            <rect class="lmc-vector-cat__wave-bar" x="57" y="67" width="5" height="11" rx="2.5" fill="#fbbf6a"/>
                            <rect class="lmc-vector-cat__wave-bar" x="65" y="62" width="5" height="20" rx="2.5" fill="#fbbf6a"/>
                            <rect class="lmc-vector-cat__wave-bar" x="73" y="67" width="5" height="11" rx="2.5" fill="#fbbf6a"/>
                        </g>

                        <path d="M38 86C44 77 53 76 61 82C68 75 79 77 86 86L88 94H36Z" fill="#c4b5fd" opacity=".9"/>

                        <g class="lmc-vector-cat__paw lmc-vector-cat__paw--left">
                            <ellipse cx="44" cy="89" rx="13" ry="8" fill="#818cf8"/>
                            <path d="M44 87V94M50 87V94" stroke="#4338ca" stroke-width="2.5" stroke-linecap="round"/>
                        </g>
                        <g class="lmc-vector-cat__paw lmc-vector-cat__paw--right">
                            <ellipse cx="82" cy="89" rx="13" ry="8" fill="#818cf8"/>
                            <path d="M80 87V94M86 87V94" stroke="#4338ca" stroke-width="2.5" stroke-linecap="round"/>
                        </g>
                    </g>
                </svg>`;
        }
    }

    if (!customElements.get('lmc-cat')) customElements.define('lmc-cat', LmcCat);
})();
