(() => {
    'use strict';

    const LOADER_SELECTOR = '.lmc-loading-state, .lmc-wave-loader';
    const INVALID_GHOST_HOSTS = new Set(['TABLE', 'TBODY', 'THEAD', 'TFOOT', 'TR', 'SELECT', 'OPTION']);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const elementFromNode = node => node?.nodeType === Node.ELEMENT_NODE ? node : null;

    function loaderFromNodes(nodes) {
        for (const node of nodes) {
            const element = elementFromNode(node);
            if (!element) continue;
            if (element.id === 'initial-loader') continue;
            if (element.matches(LOADER_SELECTOR)) return element;
            const loader = element.querySelector(LOADER_SELECTOR);
            if (loader && !loader.closest('#initial-loader')) return loader;
        }
        return null;
    }

    function revealElements(target, addedNodes) {
        const added = [...addedNodes].map(elementFromNode).filter(Boolean);
        const elements = added.length ? added : [...target.children];
        elements
            .filter(element => !element.classList.contains('lmc-loader-transition-ghost'))
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
        if (INVALID_GHOST_HOSTS.has(target.tagName)) return;
        if (target.getBoundingClientRect().height < 18) return;

        const ghost = document.createElement('div');
        ghost.className = 'lmc-loader-transition-ghost';
        const loaderVisual = loader.matches('.lmc-wave-loader')
            ? loader
            : loader.querySelector('.lmc-wave-loader') || loader;
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

        if (typeof ghost.animate !== 'function') {
            ghost.remove();
            if (addedHostClass) target.classList.remove('lmc-loader-transition-host');
            return;
        }

        const animation = ghost.animate([
            { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' },
            { opacity: 0, transform: 'scale(.94)', filter: 'blur(2px)' }
        ], {
            duration: 170,
            easing: 'cubic-bezier(.4,0,.8,.2)',
            fill: 'both'
        });
        animation.finished.then(() => {
            ghost.remove();
            if (addedHostClass) target.classList.remove('lmc-loader-transition-host');
        }).catch(() => ghost.remove());
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
