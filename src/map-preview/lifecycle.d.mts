export function bindPageLifecycle(page: EventTarget, actions: {
    suspend: () => void;
    resume: () => void;
    dispose: () => void;
}): void;
