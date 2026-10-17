// A cached document keeps its scene and listeners, but stops animation until restored.
export function bindPageLifecycle(page, { suspend, resume, dispose }) {
    let suspended = false;
    let disposed = false;
    function pagehide(event) {
        if (disposed)
            return;
        if (event.persisted) {
            if (!suspended) {
                suspended = true;
                suspend();
            }
        }
        else {
            disposed = true;
            page.removeEventListener('pagehide', pagehide);
            page.removeEventListener('pageshow', pageshow);
            dispose();
        }
    }
    function pageshow(event) {
        if (event.persisted && suspended && !disposed) {
            suspended = false;
            resume();
        }
    }
    page.addEventListener('pagehide', pagehide);
    page.addEventListener('pageshow', pageshow);
}
