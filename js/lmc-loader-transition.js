(() => {
    'use strict';

    const LOADER_SELECTOR = '.lmc-loading-state, .lmc-wave-loader';
    const INVALID_GHOST_HOSTS = new Set(['TABLE', 'TBODY', 'THEAD', 'TFOOT', 'TR', 'SELECT', 'OPTION']);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const activeGhosts = new WeakMap();

    const elementFromNode = node => node?.nodeType === Node.ELEMENT_NODE ? node : null;

    function loaderFromNodes(nodes) {
        for (const node of nodes) {
            const element = elementFromNode(node);
            if (!element) continue;
            if (element.matches('.lmc-loader-transition-ghost') || element.closest('.lmc-loader-transition-ghost')) continue;
            if (element.id === 'initial-loader') continue;
            if (element.matches(LOADER_SELECTOR)) return element;
            const loader = element.querySelector(LOADER_SELECTOR);
            if (loader && !loader.closest('#initial-loader') && !loader.closest('.lmc-loader-transition-ghost')) return loader;
        }
        return null;
    }

    function revealElements(target, addedNodes) {
        const added = [...addedNodes].map(elementFromNode).filter(Boolean);
        const elements = added.length ? added : [...target.children];
        elements
            .filter(element => element.isConnected &&
                !element.classList.contains('lmc-loader-transition-ghost') &&
                !element.matches(LOADER_SELECTOR))
            .slice(0, 30)
            .forEach(element => {
                if (typeof element.animate !== 'function') return;
                const animation = element.animate([
                    { opacity: 0, transform: 'translateY(3px) scale(.99)' },
                    { opacity: 1, transform: 'translateY(0) scale(1)' }
                ], {
                    duration: 230,
                    delay: 115,
                    easing: 'cubic-bezier(.2,.8,.2,1)',
                    fill: 'both'
                });
                animation.finished.then(() => animation.cancel()).catch(() => {});
            });
    }

    function fadeLoader(loader, target) {
        if (!target.isConnected || target.closest('.lmc-loader-transition-ghost')) return;
        if (INVALID_GHOST_HOSTS.has(target.tagName)) return;
        if (target.getBoundingClientRect().height < 18) return;

        const loaderVisual = loader.matches('.lmc-wave-loader')
            ? loader
            : loader.querySelector('.lmc-wave-loader') || loader;
        // ボタン内は短時間で何度も内容が変わるため、複製オーバーレイを作らない。
        if (loaderVisual.matches('.lmc-wave-loader--button')) return;
        activeGhosts.get(target)?.remove();
        const ghost = document.createElement('div');
        ghost.className = 'lmc-loader-transition-ghost';
        ghost.dataset.lmcTransitionGhost = 'true';
        const clone = loaderVisual.cloneNode(true);
        clone.removeAttribute('id');
        clone.removeAttribute('role');
        clone.removeAttribute('aria-live');
        clone.classList.remove('hidden', 'is-leaving');
        clone.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
        ghost.append(clone);
        const addedHostClass = getComputedStyle(target).position === 'static';
        if (addedHostClass) target.classList.add('lmc-loader-transition-host');
        target.append(ghost);
        activeGhosts.set(target, ghost);

        const cleanup = () => {
            if (activeGhosts.get(target) === ghost) activeGhosts.delete(target);
            ghost.remove();
            if (addedHostClass && !activeGhosts.has(target)) target.classList.remove('lmc-loader-transition-host');
        };

        if (typeof ghost.animate !== 'function') {
            cleanup();
            return;
        }

        const animation = ghost.animate([
            { opacity: 1, transform: 'translate3d(0,0,0) scale(1)' },
            { opacity: 0, transform: 'translate3d(0,-2px,0) scale(.96)' }
        ], {
            duration: 170,
            easing: 'cubic-bezier(.4,0,.8,.2)',
            fill: 'both'
        });
        animation.finished.then(cleanup).catch(cleanup);
    }

    function handleMutations(mutations) {
        if (reduceMotion.matches) return;
        const transitions = new Map();

        for (const mutation of mutations) {
            if (mutation.type !== 'childList' || !(mutation.target instanceof HTMLElement)) continue;
            const loader = loaderFromNodes(mutation.removedNodes);
            if (!loader) continue;
            const current = transitions.get(mutation.target);
            if (current) {
                current.addedNodes.push(...mutation.addedNodes);
            } else {
                transitions.set(mutation.target, { loader, addedNodes: [...mutation.addedNodes] });
            }
        }

        transitions.forEach(({ loader, addedNodes }, target) => {
            fadeLoader(loader, target);
            revealElements(target, addedNodes);
        });
    }

    const observer = new MutationObserver(handleMutations);
    observer.observe(document.documentElement, { childList: true, subtree: true });

    window.LmcLoaderTransition = {
        reveal(element) {
            if (!(element instanceof HTMLElement) || reduceMotion.matches) return;
            revealElements(element, [...element.children]);
        }
    };
})();
