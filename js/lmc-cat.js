(() => {
    'use strict';

    class LmcCat extends HTMLElement {
        connectedCallback() {
            if (this.dataset.ready === 'true') return;
            this.dataset.ready = 'true';
            this.setAttribute('aria-hidden', 'true');
            this.innerHTML = `
                <svg class="lmc-vector-cat__svg" viewBox="0 0 150 110" focusable="false" aria-hidden="true">
                    <defs>
                        <linearGradient id="lmcCatBodyGradient" x1="32" y1="22" x2="126" y2="103" gradientUnits="userSpaceOnUse">
                            <stop offset="0" stop-color="#5f8cff"/>
                            <stop offset=".56" stop-color="#5364ed"/>
                            <stop offset="1" stop-color="#4338ca"/>
                        </linearGradient>
                        <linearGradient id="lmcCatTailGradient" x1="13" y1="18" x2="49" y2="91" gradientUnits="userSpaceOnUse">
                            <stop offset="0" stop-color="#9167f7"/>
                            <stop offset="1" stop-color="#3730a3"/>
                        </linearGradient>
                    </defs>

                    <g class="lmc-vector-cat__wander">
                        <g class="lmc-vector-cat__tail">
                            <path d="M49 88C25 96 11 79 17 59C21 46 27 40 20 29" fill="none" stroke="url(#lmcCatTailGradient)" stroke-width="10" stroke-linecap="round"/>
                            <rect x="15.5" y="10" width="6" height="21" rx="3" fill="#9167f7"/>
                            <path d="M18 10C25 8 30 11 30 16C26 14 22 16 19 20Z" fill="#9167f7"/>
                            <ellipse cx="14" cy="30" rx="8.5" ry="6.5" transform="rotate(-18 14 30)" fill="#9167f7"/>
                            <path d="M19 43L26 46" stroke="#d8b4fe" stroke-width="3.6" stroke-linecap="round"/>
                        </g>

                        <g class="lmc-vector-cat__body">
                            <path d="M47 36L54 9C55 4 60 4 63 9L76 27C83 24 90 24 96 27C102 14 118 13 130 23C124 28 126 35 132 42C129 44 126 45 123 45C132 60 132 79 122 92C114 102 102 105 87 105H58C37 105 24 94 24 75C24 56 32 43 47 36Z" fill="url(#lmcCatBodyGradient)"/>

                            <path d="M51 32L57 14L69 30Z" fill="#d8b4fe"/>
                            <g class="lmc-vector-cat__ear-fold">
                                <path d="M97 27C104 15 118 16 128 23C120 26 119 32 124 41Z" fill="#312e81"/>
                                <path d="M108 25C113 22 119 22 124 24C120 27 120 31 123 34Z" fill="#d8b4fe"/>
                            </g>

                            <path d="M25 65C29 53 38 49 48 50C54 65 53 84 47 100C32 96 24 87 24 75C24 71 24 68 25 65Z" fill="#3730a3" opacity=".84"/>

                            <g class="lmc-vector-cat__face">
                                <rect class="lmc-vector-cat__eye lmc-vector-cat__eye--left" x="62" y="43" width="8" height="19" rx="4" fill="#fff"/>
                                <rect class="lmc-vector-cat__eye lmc-vector-cat__eye--right" x="94" y="43" width="8" height="19" rx="4" fill="#fff"/>
                                <path d="M77 57C81 64 87 64 91 57" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
                                <path d="M47 55L57 53M46 62L56 61M106 53L116 55M107 61L117 63" stroke="#d8b4fe" stroke-width="3.6" stroke-linecap="round"/>
                            </g>

                            <g class="lmc-vector-cat__wave">
                                <rect class="lmc-vector-cat__wave-bar" x="72" y="73" width="5.5" height="12" rx="2.75" fill="#fbbf6a"/>
                                <rect class="lmc-vector-cat__wave-bar" x="81" y="67" width="5.5" height="23" rx="2.75" fill="#fbbf6a"/>
                                <rect class="lmc-vector-cat__wave-bar" x="90" y="73" width="5.5" height="12" rx="2.75" fill="#fbbf6a"/>
                            </g>

                            <path d="M48 95C55 84 65 83 75 91C83 82 96 84 104 95L105 105H45Z" fill="#c4b5fd" opacity=".92"/>

                            <g class="lmc-vector-cat__paw lmc-vector-cat__paw--left">
                                <ellipse cx="57" cy="100" rx="14" ry="8.5" fill="#818cf8"/>
                                <path d="M57 97V105M64 97V105" stroke="#4338ca" stroke-width="2.7" stroke-linecap="round"/>
                            </g>
                            <g class="lmc-vector-cat__paw lmc-vector-cat__paw--right">
                                <ellipse cx="99" cy="100" rx="14" ry="8.5" fill="#818cf8"/>
                                <path d="M97 97V105M104 97V105" stroke="#4338ca" stroke-width="2.7" stroke-linecap="round"/>
                            </g>
                        </g>
                    </g>
                </svg>`;
        }
    }

    if (!customElements.get('lmc-cat')) customElements.define('lmc-cat', LmcCat);
})();
