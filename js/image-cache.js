// Register the shared image cache as early as possible on every app page.
if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('/image-cache-sw.js', {scope: '/'}).catch(error => {
        console.warn('Image cache registration failed:', error);
    });
}
