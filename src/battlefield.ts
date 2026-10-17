import { DISTRICTS, canReach } from "./model.mjs";
import { createLayout, districtCenter, pickDistrict } from "./scene-math.mjs";
type State = {
    owners: number[];
    defense: number[];
    selected: number;
    team: number;
    pending: number | null;
    known: boolean;
    mode: string;
    rates: number[];
};
type Hit = {
    district: number;
    team: number;
    unit: number;
    beforeOwner: number;
    afterOwner: number;
    beforeDefense: number;
    afterDefense: number;
};
type Effect = Hit & {
    start: number;
    from: number;
};
const COLORS = ["#b6bda2", "#83e9ad", "#f78168"];
/** Original pixel artwork. World painting stays separate from authoritative game state. */
export function createBattlefield(canvas: HTMLCanvasElement, callbacks: {
    onSelect: (index: number) => void;
    onHover?: (index: number | null) => void;
}) {
    const ctx = canvas.getContext("2d")!;
    let state: State = { owners: Array(9).fill(0), defense: Array(9).fill(0), selected: 1, team: 1, pending: null, known: false, mode: "practice", rates: [] };
    let layout = createLayout(600, 420), effects: Effect[] = [], frame = 0, hovered: number | null = null, destroyed = false;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const rect = (x: number, y: number, w: number, h: number, color: string) => { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
    function label(text: string, x: number, y: number, color: string, size = 12) {
        ctx.font = `600 ${size}px ui-monospace, "PingFang SC", monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = color;
        ctx.fillText(text, Math.round(x), Math.round(y));
    }
    function sprite(x: number, y: number, unit: number, team: number, scale = 2, step = 0) {
        ctx.save();
        ctx.translate(Math.round(x), Math.round(y));
        ctx.scale(scale, scale);
        const c = COLORS[team], dark = team === 2 ? "#773d36" : "#306949";
        if (unit === 0) {
            rect(-3, 1, 7, 3, "#1b2c25");
            rect(-2, -5, 4, 3, c);
            rect(-3, -3, 6, 4, dark);
            rect(-2, -1, 4, 5, c);
            rect(2, -2, 5, 2, "#26372e");
            rect(5, -3, 1, 4, "#e5e1b3");
            rect(-2, 4, 2, 3 + (step % 2), "#17291e");
            rect(1, 4, 2, 4 - (step % 2), "#17291e");
        }
        else if (unit === 1) {
            rect(-8, -6, 16, 3, "#1d2a24");
            rect(-8, 4, 16, 3, "#1d2a24");
            rect(-6, -4, 13, 9, dark);
            rect(-5, -3, 10, 7, c);
            rect(-2, -2, 6, 5, dark);
            rect(1, -1, 12, 2, "#b3b99a");
            for (let k = -7; k < 8; k += 3) {
                rect(k, -6, 1, 2, "#879279");
                rect(k, 5, 1, 2, "#879279");
            }
        }
        else {
            rect(-7, -5, 3, 3, "#182b23");
            rect(4, -5, 3, 3, "#182b23");
            rect(-7, 4, 3, 3, "#182b23");
            rect(4, 4, 3, 3, "#182b23");
            rect(-7, -3, 14, 8, "#dbc98b");
            rect(2, -3, 5, 8, c);
            rect(4, -2, 2, 3, "#3b635f");
            rect(-5, -1, 6, 2, "#7e6544");
            rect(-3, -3, 2, 6, "#eee5b9");
        }
        ctx.restore();
    }
    function building(x: number, y: number, type: string, owner: number, scale: number) {
        const c = COLORS[owner];
        ctx.save();
        ctx.translate(Math.round(x), Math.round(y));
        ctx.scale(scale, scale);
        rect(-21, 12, 44, 5, "#26382b");
        if (type === "base") {
            rect(-21, -8, 42, 23, "#586553");
            rect(-18, -12, 36, 22, "#a4ad82");
            rect(-16, -10, 32, 5, "#ccd0a2");
            rect(-14, -2, 12, 12, "#33463b");
            rect(-11, 1, 6, 9, "#1d342d");
            rect(3, -2, 12, 7, "#425c52");
            rect(7, -23, 5, 14, "#65725c");
            rect(6, -25, 7, 3, "#b8bf99");
            rect(-18, 10, 36, 3, c);
            rect(5, -6, 2, 2, "#8eb1a0");
            rect(9, -6, 2, 2, "#8eb1a0");
        }
        else if (type === "mine") {
            rect(-23, -4, 28, 17, "#68654c");
            rect(-18, -12, 19, 20, "#8c8151");
            rect(-15, -8, 8, 6, "#e4bb4b");
            rect(-20, 3, 9, 6, "#b98e33");
            rect(-6, 3, 10, 7, "#f2cd67");
            rect(6, -10, 13, 23, "#8b9477");
            rect(8, -7, 9, 15, "#465a49");
            rect(-2, -17, 25, 4, "#bab88a");
            rect(0, -17, 3, 25, "#777e58");
            rect(19, -17, 3, 28, "#777e58");
            rect(8, -17, 3, 9, "#d6ad52");
            rect(5, 11, 20, 3, c);
        }
        else if (type === "energy") {
            rect(-22, -9, 44, 25, "#4b6657");
            rect(-19, -12, 38, 21, "#9eae8a");
            rect(-12, -22, 8, 32, "#3b736d");
            rect(4, -22, 8, 32, "#3b736d");
            rect(-10, -19, 4, 24, "#91e5c2");
            rect(6, -19, 4, 24, "#91e5c2");
            rect(-14, -23, 12, 4, "#b6c7a1");
            rect(2, -23, 12, 4, "#b6c7a1");
            rect(-18, 10, 36, 3, c);
            rect(-3, -7, 6, 4, "#f1d47c");
            rect(-1, -4, 3, 5, "#f1d47c");
        }
        else {
            rect(-22, -5, 20, 20, "#8d9a7a");
            rect(-24, -10, 24, 8, "#b9aa7e");
            rect(-20, -8, 16, 3, "#d2c69b");
            rect(-18, 2, 5, 7, "#3e5d51");
            rect(-9, 3, 5, 12, "#3c4a38");
            rect(5, -14, 18, 27, "#7e8f72");
            rect(3, -17, 22, 6, "#b4b48c");
            rect(9, -7, 4, 5, "#b6d2b3");
            rect(16, -7, 4, 5, "#b6d2b3");
            rect(10, 4, 8, 9, "#344f42");
            rect(-21, 14, 44, 2, c);
        }
        ctx.restore();
    }
    function paint(now = performance.now()) {
        if (destroyed)
            return;
        const { width: w, height: h, cellW: cw, cellH: ch } = layout;
        ctx.imageSmoothingEnabled = false;
        rect(0, 0, w, h, "#40533b");
        // Deterministic ground texture and tiny trees; never imply live activity.
        for (let i = 0; i < 360; i++) {
            const x = (i * 97 + 13) % w, y = (i * 71 + 23) % h;
            rect(x, y, 2 + (i % 3), 2, i % 4 === 0 ? "#526747" : "#455a3e");
        }
        for (let i = 0; i < 3; i++) {
            const p = districtCenter(layout, i * 3), q = districtCenter(layout, i);
            rect(0, p.y - 4, w, 13, "#7a8066");
            rect(q.x - 6, 0, 13, h, "#7a8066");
            for (let j = 0; j < w; j += 22)
                rect(j, p.y + 1, 10, 2, "#aaa58a");
            for (let j = 0; j < h; j += 22)
                rect(q.x - 1, j, 2, 10, "#aaa58a");
        }
        // A narrow river on the eastern edge, with three road bridges.
        rect(w - 13, 0, 13, h, "#426e71");
        rect(w - 10, 0, 3, h, "#609293");
        for (let i = 0; i < 3; i++) {
            const p = districtCenter(layout, i * 3);
            rect(w - 20, p.y - 6, 20, 18, "#a1a18a");
        }
        const compact = w < 500, unitScale = compact ? 1 : 2, artScale = cw >= 170 && ch >= 118 ? 2 : 1;
        for (let i = 0; i < 9; i++) {
            const p = districtCenter(layout, i), x = layout.left + (i % 3) * cw, y = layout.top + Math.floor(i / 3) * ch;
            const owner = state.known ? state.owners[i] : 0, color = COLORS[owner];
            const reach = state.known && canReach(state.owners, state.team, i);
            ctx.strokeStyle = i === state.selected ? "#f5df89" : reach ? "#9eb284" : "#5b6e4d";
            ctx.lineWidth = i === state.selected ? 3 : 1;
            ctx.setLineDash(i === state.selected ? [] : [3, 5]);
            ctx.strokeRect(Math.round(x + 4) + .5, Math.round(y + 4) + .5, Math.round(cw - 8), Math.round(ch - 8));
            ctx.setLineDash([]);
            if (i === hovered && i !== state.selected) {
                ctx.fillStyle = "#ffffff0b";
                ctx.fillRect(x + 5, y + 5, cw - 10, ch - 10);
            }
            const by = y + (ch - 34) * .55;
            // Compact maps use one-pixel artwork; wide maps use exact 2× sprites.
            rect(p.x - 25 * artScale, by - 24 * artScale, 50 * artScale, 40 * artScale, "#627358");
            for (let k = 0; k < 3; k++)
                rect(p.x + (-22 + k * 15) * artScale, by + 13 * artScale, 11 * artScale, 2 * artScale, "#75836a");
            building(p.x, by, DISTRICTS[i].type, owner, artScale);
            // Ownership flag and stationed units use confirmed owners only.
            rect(p.x + 22 * artScale, by - 20 * artScale, artScale, 18 * artScale, "#ded7b4");
            rect(p.x + 23 * artScale, by - 20 * artScale, 8 * artScale, 5 * artScale, color);
            if (state.known && owner) {
                sprite(p.x - 20 * artScale, by + 15 * artScale, 0, owner, unitScale);
                sprite(p.x + 18 * artScale, by + 15 * artScale, i === 0 || i === 8 ? 1 : 0, owner, unitScale);
            }
            else if (state.known) {
                rect(p.x - 20 * artScale, by + 10 * artScale, 7 * artScale, 4 * artScale, "#b8b18b");
                rect(p.x - 19 * artScale, by + 11 * artScale, 5 * artScale, artScale, "#726e50");
            }
            // Sparse pixel groves and rock piles anchor each region in shared terrain.
            for (let k = 0; k < 2; k++) {
                const tx = x + 10 + k * 8, ty = y + ch * .4 + k * 9;
                rect(tx + 2, ty + 6, 2, 5, "#5b5134");
                rect(tx, ty, 7, 8, "#2c4932");
                rect(tx + 2, ty - 2, 4, 7, "#65804a");
            }
            const ly = y + ch - 29;
            rect(p.x - cw * .41, ly - 10, cw * .82, 37, "#182b24e8");
            label(`${String(i + 1).padStart(2, "0")} ${DISTRICTS[i].name}`, p.x, ly + 1, "#f3eed7", compact ? 12 : 14);
            label(state.known ? `${owner === 0 ? "中立" : owner === 1 ? "翡翠" : "赤焰"} ${state.defense[i]}  ·  +${state.rates[i] ?? DISTRICTS[i].rate}/s` : "等待链上快照", p.x, ly + 17, color, compact ? 10 : 11);
            rect(p.x - cw * .34, ly + 25, cw * .68, 3, "#14251e");
            if (state.known)
                rect(p.x - cw * .34, ly + 25, cw * .68 * state.defense[i] / 100, 3, color);
            if (i === state.selected) {
                rect(x + 5, y + 5, 28, 15, "#f5df89");
                label("目标", x + 19, y + 12, "#253d2d", 10);
            }
            if (i === state.pending)
                label("待确认", p.x, y + 15, "#ffe5a0", 11);
        }
        effects = effects.filter(e => now - e.start < 2300);
        for (const e of effects) {
            const to = districtCenter(layout, e.district), from = districtCenter(layout, e.from), age = now - e.start;
            const travel = motion.matches ? 1 : Math.min(1, age / 1300);
            const bend = { x: to.x, y: from.y };
            const x = travel < .5 ? from.x + (bend.x - from.x) * travel * 2 : to.x;
            const y = travel < .5 ? from.y : bend.y + (to.y - bend.y) * (travel - .5) * 2;
            ctx.strokeStyle = COLORS[e.team];
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 5]);
            ctx.beginPath();
            ctx.moveTo(from.x, from.y + 14);
            ctx.lineTo(bend.x, bend.y + 14);
            ctx.lineTo(to.x, to.y + 14);
            ctx.stroke();
            ctx.setLineDash([]);
            if (travel < 1) {
                sprite(x, y + 14, e.unit, e.team, unitScale, Math.floor(age / 140));
                if (e.unit === 0)
                    sprite(x - 13, y + 21, 0, e.team, unitScale, Math.floor(age / 140) + 1);
            }
            else {
                const reinforcement = e.beforeOwner === e.team || e.unit === 2;
                const pulse = Math.floor((age - 1300) / 110) % 3;
                for (let k = 0; k < 7; k++) {
                    const angle = k * Math.PI * 2 / 7, r = 10 + pulse * 6;
                    rect(to.x + Math.cos(angle) * r, to.y - 8 + Math.sin(angle) * r, 5, 5, reinforcement ? "#bcffd0" : k % 2 ? "#ffcf68" : "#e88649");
                }
                label(e.afterOwner !== e.beforeOwner ? "占领 +20" : reinforcement ? "增援完成" : "命中", to.x, to.y - 64, "#fff0ab", 13);
            }
        }
    }
    function loop(now: number) { frame = 0; if (document.hidden || destroyed)
        return; paint(now); if (effects.length && !motion.matches)
        frame = requestAnimationFrame(loop); }
    function redraw() { if (!frame && !document.hidden && !destroyed)
        frame = requestAnimationFrame(loop); }
    function resize() { const bounds = canvas.getBoundingClientRect(); const width = Math.max(300, Math.round(bounds.width)), height = Math.max(270, Math.round(bounds.height)); canvas.width = width; canvas.height = height; layout = createLayout(width, height); redraw(); }
    function position(e: PointerEvent) { const b = canvas.getBoundingClientRect(); return pickDistrict(layout, (e.clientX - b.left) * layout.width / b.width, (e.clientY - b.top) * layout.height / b.height); }
    const click = (e: PointerEvent) => { const i = position(e); if (i !== null)
        callbacks.onSelect(i); };
    const hover = (e: PointerEvent) => { hovered = position(e); callbacks.onHover?.(hovered); canvas.style.cursor = hovered === null ? "default" : "crosshair"; redraw(); };
    const leave = () => { hovered = null; redraw(); };
    const visibility = () => { if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
        effects = [];
    }
    else
        redraw(); };
    canvas.addEventListener("pointerdown", click);
    canvas.addEventListener("pointermove", hover);
    canvas.addEventListener("pointerleave", leave);
    document.addEventListener("visibilitychange", visibility);
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    return {
        setState(next: State) { if (next.mode !== state.mode || !next.known)
            effects = []; state = next; redraw(); },
        hit(hit: Hit) {
            const candidates = state.owners.map((owner, index) => ({ owner, index })).filter(v => v.owner === hit.team && v.index !== hit.district);
            candidates.sort((a, b) => Math.abs(a.index % 3 - hit.district % 3) + Math.abs(Math.floor(a.index / 3) - Math.floor(hit.district / 3)) - Math.abs(b.index % 3 - hit.district % 3) - Math.abs(Math.floor(b.index / 3) - Math.floor(hit.district / 3)));
            effects.push({ ...hit, start: performance.now(), from: candidates[0]?.index ?? hit.district });
            redraw();
        },
        resize,
        destroy() { destroyed = true; cancelAnimationFrame(frame); observer.disconnect(); canvas.removeEventListener("pointerdown", click); canvas.removeEventListener("pointermove", hover); canvas.removeEventListener("pointerleave", leave); document.removeEventListener("visibilitychange", visibility); effects = []; },
    };
}
