// Small procedural cues. Audio is silent until explicitly enabled by the player.
export function createAudio() {
    let context: AudioContext | null = null;
    let enabled = false;
    function play(kind: "select" | "hit" | "rival") {
        if (!enabled || document.hidden)
            return;
        try {
            context ??= new AudioContext();
            if (context.state === "suspended")
                void context.resume();
            const now = context.currentTime;
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.type = kind === "rival" ? "triangle" : "sine";
            const frequency = kind === "select" ? 520 : kind === "hit" ? 390 : 180;
            oscillator.frequency.setValueAtTime(frequency, now);
            oscillator.frequency.exponentialRampToValueAtTime(kind === "hit" ? 880 : frequency * 0.6, now + 0.13);
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(kind === "select" ? 0.035 : 0.07, now + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
            oscillator.connect(gain).connect(context.destination);
            oscillator.start(now);
            oscillator.stop(now + 0.18);
        }
        catch {
            /* Audio availability never blocks game input. */
        }
    }
    const onVisibility = () => {
        if (document.hidden && context)
            void context.suspend();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return {
        toggle() {
            enabled = !enabled;
            if (enabled)
                play("select");
            else if (context)
                void context.suspend();
            return enabled;
        },
        play,
        destroy() {
            enabled = false;
            document.removeEventListener("visibilitychange", onVisibility);
            if (context)
                void context.close();
            context = null;
        },
    };
}
