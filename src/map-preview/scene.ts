/// <reference types="vite/client" />
import { NODES, FACTIONS, ROUTES, project, worldToScreen, screenToWorld, zoomAt, clampCamera, minimapPoint, minimapToWorld, hitNode, legalTarget, isClickGesture, hitUnit, pointerSelection, UNIT_OFFSETS, validNode } from './world.mjs';
import {copyLiveBoard,displayNode,unitOffset,hitLiveUnit,boxUnits,roadPoint,liveTarget,type LiveNode} from './live-world.mjs';
export type Camera = {
    x: number;
    y: number;
    zoom: number;
    width: number;
    height: number;
};
type Selection = {
    source: number | null;
    target: number | null;
    units: number[];
};
type Options = {
    onSelect: (id: number, unit?: number, asTarget?: boolean) => void;
    onCamera: (camera: Camera) => void;
    onAssets: (loaded: boolean) => void;
    live?: boolean;
    team?: () => number;
    onBoxSelect?: (result: ReturnType<typeof boxUnits>) => void;
};
type ConfirmedReplay={hash:string;from:number;to:number;team:number;returned:boolean;count:number};
const colorFor = (id: number) => FACTIONS.find(f => f.id === id)?.color || '#d5c996';
const random = (x: number, y: number) => {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
};
const river = (x: number, y: number) => Math.abs(x - (36 + 3 * Math.sin(y / 7))) < 1.4;
const distanceSegment = (x: number, y: number, a: {
    x: number;
    y: number;
}, b: {
    x: number;
    y: number;
}) => {
    const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
};
const nearRoad = (x: number, y: number) => ROUTES.some(r => r.points.slice(1).some((p, i) => distanceSegment(x, y, r.points[i], p) < 1.25));
const unitOffsets = UNIT_OFFSETS;
export const demoUnits = (id: number) => id < 4 ? ['步兵', '步兵', '步兵', '坦克', '工程师'] : ['步兵', '步兵'];
export class MapScene {
    canvas: HTMLCanvasElement;
    mini: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    minictx: CanvasRenderingContext2D;
    camera: Camera = { x: 0, y: 1024, zoom: .8, width: 1000, height: 700 };
    selection: Selection = { source: 0, target: null, units: [] };
    private terrain = document.createElement('canvas');
    private image = new Image();
    private ready = false;
    private disposed = false;
    private paused = false;
    private options: Options;
    private raf = 0;
    private last = 0;
    private keys = new Set<string>();
    private cleanups: (() => void)[] = [];
    private spriteRects: Record<string, number[]> = {};
    private abort = new AbortController();
    private drag: {
        id: number;
        x: number;
        y: number;
        startX: number;
        startY: number;
        moved: boolean;
        selecting: boolean;
    } | null = null;
    private trees: {
        x: number;
        y: number;
        size: number;
    }[] = [];
    private dirty = true;
    private hover: number | null = null;
    private liveBoard: LiveNode[] | null = null;
    private replays: (ConfirmedReplay & {at:number})[] = [];
    private replayKeys = new Set<string>();
    constructor(canvas: HTMLCanvasElement, mini: HTMLCanvasElement, options: Options) {
        this.canvas = canvas;
        this.mini = mini;
        this.options = options;
        this.ctx = canvas.getContext('2d')!;
        this.minictx = mini.getContext('2d')!;
        this.terrain.width = 6144;
        this.terrain.height = 3400;
        this.bakeTerrain();
        this.createTrees();
        void this.loadAssets();
        this.bind();
        this.resize();
        this.raf = requestAnimationFrame(this.tick);
    }
    private on(target: EventTarget, event: string, callback: EventListener, opts?: AddEventListenerOptions) {
        target.addEventListener(event, callback, opts);
        this.cleanups.push(() => target.removeEventListener(event, callback, opts));
    }
    private point(e: PointerEvent | WheelEvent) {
        const r = this.canvas.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    private bind() {
        this.on(this.canvas, 'pointerdown', this.handlePointerDown as EventListener);
        this.on(this.canvas, 'pointermove', this.handlePointerMove as EventListener);
        this.on(this.canvas, 'pointerup', this.handlePointerUp as EventListener);
        this.on(this.canvas, 'pointercancel', ((e: PointerEvent) => this.endDrag(e.pointerId)) as EventListener);
        this.on(this.canvas, 'lostpointercapture', (() => {
            if (this.drag?.selecting)this.dirty=true;
            this.drag = null;
            this.canvas.classList.remove('is-dragging');
        }) as EventListener);
        this.on(this.canvas, 'contextmenu', (e => e.preventDefault()) as EventListener);
        this.on(this.canvas, 'wheel', this.handleWheel as EventListener, { passive: false });
        this.on(this.mini, 'pointerdown', this.handleMinimapPointer as EventListener);
        this.on(window, 'keydown', this.handleKeyDown as EventListener);
        this.on(window, 'keyup', ((e: KeyboardEvent) => {
            this.keys.delete(e.key.toLowerCase());
        }) as EventListener);
        this.on(window, 'blur', (() => {
            this.keys.clear();
            if (this.drag)
                this.endDrag(this.drag.id);
        }) as EventListener);
    }
    private handlePointerDown = (e: PointerEvent) => {
        if (e.button !== 0 && e.button !== 2)
            return;
        const p = this.point(e);
        const w=screenToWorld(this.camera,p.x,p.y);
        const selecting=!!this.options.live&&e.button===0&&(e.shiftKey||!!hitLiveUnit(this.liveBoard,w.x,w.y));
        this.drag = { id: e.pointerId, x: p.x, y: p.y, startX: p.x, startY: p.y, moved: false, selecting };
        this.canvas.setPointerCapture(e.pointerId);
        this.canvas.classList.add('is-dragging');
    };
    private handlePointerMove = (e: PointerEvent) => {
        const p = this.point(e);
        if (this.drag && this.drag.id === e.pointerId) {
            const d = this.drag;
            if (Math.hypot(p.x - d.startX, p.y - d.startY) > 5)
                d.moved = true;
            if (d.moved && !d.selecting) {
                this.camera = clampCamera({ ...this.camera, x: this.camera.x - (p.x - d.x) / this.camera.zoom, y: this.camera.y - (p.y - d.y) / this.camera.zoom });
                this.changed();
            }
            d.x = p.x;
            d.y = p.y;
            if(d.selecting)this.dirty=true;
        }
        else {
            const w = screenToWorld(this.camera, p.x, p.y), h = hitNode(w.x, w.y);
            if (this.hover !== h) {
                this.hover = h;
                this.dirty = true;
            }
            this.canvas.style.cursor = h !== null ? 'pointer' : 'grab';
        }
    };
    private handlePointerUp = (e: PointerEvent) => {
        const d = this.drag;
        if (!d || d.id !== e.pointerId)
            return;
        const p = this.point(e);
        this.endDrag(e.pointerId);
        if(d.selecting&&d.moved){
            const a=screenToWorld(this.camera,d.startX,d.startY),b=screenToWorld(this.camera,p.x,p.y);
            this.options.onBoxSelect?.(boxUnits(this.liveBoard,{x1:a.x,y1:a.y,x2:b.x,y2:b.y},this.options.team?.()??0));
            this.dirty=true;return;
        }
        if (d.moved || !isClickGesture({ x: d.startX, y: d.startY }, p))
            return;
        const w = screenToWorld(this.camera, p.x, p.y);
        const picked = this.options.live ? hitLiveUnit(this.liveBoard,w.x,w.y) : hitUnit(w.x, w.y);
        const id = picked?.node ?? hitNode(w.x, w.y);
        if (id !== null) {
            const intent = pointerSelection(id, picked?.unit, e.button);
            this.options.onSelect(intent.node, intent.unit, intent.asTarget);
        }
    };
    private handleWheel = (e: WheelEvent) => {
        e.preventDefault();
        const p = this.point(e);
        this.camera = zoomAt(this.camera, this.camera.zoom * Math.exp(-e.deltaY * .0012), p.x, p.y);
        this.changed();
    };
    private handleMinimapPointer = (e: PointerEvent) => {
        const r = this.mini.getBoundingClientRect(), p = minimapToWorld(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
        this.camera = clampCamera({ ...this.camera, x: p.x, y: p.y });
        this.changed();
    };
    private handleKeyDown = (e: KeyboardEvent) => {
        if (e.target instanceof HTMLElement && e.target.closest('input,button,select,textarea,[contenteditable="true"]'))
            return;
        if (['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright'].includes(e.key.toLowerCase())) {
            e.preventDefault();
            this.keys.add(e.key.toLowerCase());
        }
    };
    private endDrag(id: number) {
        if (this.drag?.id !== id)
            return;
        if (this.drag.selecting)this.dirty=true;
        this.drag = null;
        this.canvas.classList.remove('is-dragging');
        if (this.canvas.hasPointerCapture(id))
            this.canvas.releasePointerCapture(id);
    }
    resize() {
        const r = this.canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.camera = { ...this.camera, width: r.width, height: r.height };
        this.canvas.width = Math.round(r.width * dpr);
        this.canvas.height = Math.round(r.height * dpr);
        const m = this.mini.getBoundingClientRect();
        this.mini.width = Math.round(m.width * dpr);
        this.mini.height = Math.round(m.height * dpr);
        this.changed();
    }
    centerOn(id: number) {
        const n = NODES[validNode(id)];
        const p = project(n.x, n.y);
        this.camera = clampCamera({ ...this.camera, x: p.x, y: p.y, zoom: Math.max(.8, this.camera.zoom) });
        this.changed();
    }
    reset() {
        this.camera = { ...this.camera, x: 0, y: 1024, zoom: .5 };
        this.changed();
    }
    zoom(delta: number) {
        this.camera = zoomAt(this.camera, this.camera.zoom + delta, this.camera.width / 2, this.camera.height / 2);
        this.changed();
    }
    setSelection(selection: Selection) {
        if (selection.source !== null)
            validNode(selection.source);
        if (selection.target !== null)
            validNode(selection.target);
        this.selection = { ...selection, units: [...selection.units] };
        this.dirty = true;
    }
    pause() {
        if (this.disposed || this.paused)
            return;
        this.paused = true;
        cancelAnimationFrame(this.raf);
        this.keys.clear();
        if (this.drag)
            this.endDrag(this.drag.id);
    }
    setState(nodes:LiveNode[]|null){
        this.liveBoard=nodes===null?null:copyLiveBoard(nodes);
        if(nodes===null)this.replays=[];
        this.dirty=true;
    }
    private nodeState(id:number){return displayNode(this.liveBoard??null,id,!!this.options.live);}
    private offset(i:number){return this.options.live?unitOffset(i):unitOffsets[i];}
    playConfirmedOrder(order:ConfirmedReplay){
        const now=performance.now();
        const active=this.replays.filter(r=>now-r.at<(r.returned?3600:2200));
        if(active.length!==this.replays.length)this.dirty=true;
        this.replays=active;
        if(!this.options.live||!this.liveBoard||!order.hash||this.replayKeys.has(order.hash)||active.some(r=>r.hash===order.hash)||!roadPoint(order.from,order.to,0))return;
        if(!Number.isInteger(order.count)||order.count<1||order.count>6||order.team<1||order.team>4)return;
        this.replayKeys.add(order.hash);
        if(this.replayKeys.size>100)this.replayKeys.delete(this.replayKeys.values().next().value!);
        if(this.replays.length>=100)this.replays.shift();
        this.replays.push({...order,at:now});this.dirty=true;
    }
    resume() {
        if (this.disposed || !this.paused)
            return;
        this.paused = false;
        this.last = 0;
        this.resize();
        this.raf = requestAnimationFrame(this.tick);
    }
    private changed() {
        this.dirty = true;
        this.options.onCamera({ ...this.camera });
    }
    destroy() {
        this.disposed = true;
        cancelAnimationFrame(this.raf);
        this.cleanups.forEach(fn => fn());
        this.cleanups = [];
        this.keys.clear();
        if (this.drag)
            this.endDrag(this.drag.id);
        this.abort.abort();
        this.replays=[];this.replayKeys.clear();
        this.image.onload = null;
        this.image.onerror = null;
    }
    private async loadAssets() {
        try {
            const response = await fetch(`${import.meta.env.BASE_URL}map-assets/siege-atlas.json`, { signal: this.abort.signal });
            if (!response.ok)
                throw new Error('Atlas metadata unavailable');
            const metadata = await response.json();
            if (!metadata.sprites || !['base', 'mine', 'tower', 'factory', 'infantry', 'tank', 'engineer', 'tree'].every(key => Array.isArray(metadata.sprites[key]) && metadata.sprites[key].length === 4 && metadata.sprites[key][2] > 0 && metadata.sprites[key][3] > 0 && metadata.sprites[key].every((value: number) => Number.isFinite(value) && value >= 0)))
                throw new Error('Invalid atlas metadata');
            this.spriteRects = metadata.sprites;
            await new Promise<void>((resolve, reject) => {
                this.image.onload = () => resolve();
                this.image.onerror = () => reject(new Error('Atlas unavailable'));
                this.image.src = `${import.meta.env.BASE_URL}map-assets/siege-atlas.png`;
            });
            if (this.disposed)
                return;
            this.ready = true;
            this.dirty = true;
            this.options.onAssets(true);
        }
        catch {
            if (!this.disposed)
                this.options.onAssets(false);
        }
    }
    private tick = (now: number) => {
        if (this.disposed || this.paused)
            return;
        const dt = Math.min((now - this.last) / 1000, .05);
        this.last = now;
        if(this.replays.length){this.replays=this.replays.filter(r=>now-r.at<(r.returned?3600:2200));this.dirty=true;}
        let dx = 0, dy = 0;
        for (const k of this.keys) {
            if (k === 'a' || k === 'arrowleft')
                dx--;
            if (k === 'd' || k === 'arrowright')
                dx++;
            if (k === 'w' || k === 'arrowup')
                dy--;
            if (k === 's' || k === 'arrowdown')
                dy++;
        }
        if (dx || dy) {
            this.camera = clampCamera({ ...this.camera, x: this.camera.x + dx * dt * 500 / this.camera.zoom, y: this.camera.y + dy * dt * 500 / this.camera.zoom });
            this.changed();
        }
        if (this.dirty) {
            this.draw();
            this.drawMini();
            this.dirty = false;
        }
        this.raf = requestAnimationFrame(this.tick);
    };
    private diamond(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string) {
        c.fillStyle = fill;
        c.beginPath();
        c.moveTo(x, y - h / 2);
        c.lineTo(x + w / 2, y);
        c.lineTo(x, y + h / 2);
        c.lineTo(x - w / 2, y);
        c.closePath();
        c.fill();
    }
    private bakeTerrain() {
        const c = this.terrain.getContext('2d')!;
        c.translate(3072, 608);
        c.imageSmoothingEnabled = false;
        for (let sum = -32; sum < 159; sum++)
            for (let x = -16; x < 80; x++) {
                const y = sum - x;
                if (y < -16 || y >= 80)
                    continue;
                const p = project(x, y), r = random(x, y), water = river(x, y);
                this.diamond(c, p.x, p.y, 65, 33, water ? (r > .5 ? '#355c61' : '#3c6869') : ['#68754a', '#69764b', '#6a774b', '#69764a', '#68764a'][Math.floor(r * 5)]);
                if (water) {
                    c.fillStyle = '#68908a55';
                    c.fillRect(p.x - 12, p.y, 18, 2);
                }
                else {
                    c.fillStyle = r > .5 ? '#8b955657' : '#3c532b66';
                    for (let i = 0; i < 3; i++)
                        c.fillRect(p.x - 15 + random(x + i, y + 3) * 30, p.y - 5 + random(x, y + i + 6) * 9, 3, 2);
                }
            }
        // Exposed rock faces around the island give the terrain real volume.
        for (let i = 0; i < 64; i++) {
            for (const [x, y] of [[63, i], [i, 63]]) {
                const p = project(x, y);
                c.fillStyle = '#3c4336';
                c.beginPath();
                c.moveTo(p.x, p.y + 16);
                c.lineTo(p.x + 32, p.y);
                c.lineTo(p.x + 32, p.y + 26);
                c.lineTo(p.x, p.y + 43);
                c.closePath();
                c.fill();
                c.fillStyle = '#525843';
                c.fillRect(p.x, p.y + 24, 3, 12);
            }
        }
        // Roads are drawn from the authoritative graph only.
        for (const r of ROUTES) {
            c.lineJoin = 'round';
            c.lineCap = 'round';
            for (const [width, color] of [[27, '#465239'], [21, '#928c65'], [15, '#a59c76']] as const) {
                c.lineWidth = width;
                c.strokeStyle = color;
                c.beginPath();
                r.points.forEach((p, i) => {
                    const q = project(p.x, p.y);
                    if (i === 0)
                        c.moveTo(q.x, q.y);
                    else
                        c.lineTo(q.x, q.y);
                });
                c.stroke();
            }
            c.setLineDash([3, 18]);
            c.lineWidth = 2;
            c.strokeStyle = '#786f4b88';
            c.stroke();
            c.setLineDash([]);
            for (let i = 1; i < r.points.length; i++) {
                const a = r.points[i - 1], b = r.points[i], count = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2);
                for (let j = 0; j < count; j++) {
                    const t = (j + .5) / count, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
                    if (!river(x, y))
                        continue;
                    const p = project(x, y);
                    const direction = project(b.x - a.x, b.y - a.y);
                    const angle = Math.atan2(direction.y, direction.x);
                    c.save();
                    c.translate(p.x, p.y);
                    c.rotate(angle);
                    c.fillStyle = '#4b4535';
                    c.fillRect(-13, -26, 27, 52);
                    c.fillStyle = '#b6a581';
                    c.fillRect(-13, -19, 27, 38);
                    c.fillStyle = '#776c51';
                    c.fillRect(-2, -19, 3, 38);
                    c.fillStyle = '#d4c394';
                    c.fillRect(-12, -26, 24, 4);
                    c.fillRect(-12, 22, 24, 4);
                    c.restore();
                }
            }
        }
        for (const n of NODES) {
            const p = project(n.x, n.y);
            this.diamond(c, p.x, p.y + 4, n.type === 'factory' ? 215 : 175, n.type === 'factory' ? 110 : 88, '#45533c');
            this.diamond(c, p.x, p.y, 160, 80, '#878568');
            c.strokeStyle = '#b9b08a66';
            c.lineWidth = 2;
            c.strokeRect(p.x - 33, p.y + 12, 31, 3);
        }
    }
    private createTrees() {
        for (let x = -12; x < 76; x++)
            for (let y = -12; y < 76; y++) {
                const grove = Math.sin(x * .31) + Math.cos(y * .28) > .5;
                if (random(x, y) > (grove ? .38 : .075) || river(x, y) || nearRoad(x, y) || NODES.some(n => Math.hypot(n.x - x, n.y - y) < 3.2))
                    continue;
                const p = project(x, y);
                this.trees.push({ x: p.x, y: p.y, size: .55 + random(y, x) * .5 });
            }
    }
    private sprite(index: number, x: number, y: number, w: number, h: number) {
        if (!this.ready)
            return false;
        const rect = this.spriteRects[['base', 'mine', 'tower', 'factory', 'infantry', 'tank', 'engineer', 'tree'][index]];
        if (!rect || rect.length !== 4)
            return false;
        const [sx, sy, sw, sh] = rect;
        const scale = Math.min(w / sw, h / sh);
        const dw = sw * scale, dh = sh * scale;
        this.ctx.drawImage(this.image, sx, sy, sw, sh, x - dw / 2, y - dh, dw, dh);
        return true;
    }
    private box(x: number, y: number, w: number, d: number, h: number, roof: string, side: string) {
        const c = this.ctx;
        this.diamond(c, x, y, w, d, '#29392a');
        c.fillStyle = side;
        c.beginPath();
        c.moveTo(x - w / 2, y - h);
        c.lineTo(x, y + d / 2 - h);
        c.lineTo(x, y + d / 2);
        c.lineTo(x - w / 2, y);
        c.closePath();
        c.fill();
        c.fillStyle = '#414c38';
        c.beginPath();
        c.moveTo(x + w / 2, y - h);
        c.lineTo(x, y + d / 2 - h);
        c.lineTo(x, y + d / 2);
        c.lineTo(x + w / 2, y);
        c.closePath();
        c.fill();
        this.diamond(c, x, y - h, w, d, roof);
    }
    private building(n: typeof NODES[number]) {
        const state=this.nodeState(n.id);
        const c = this.ctx, p = project(n.x, n.y), color = colorFor(state.owner), chosen = this.selection.source === n.id, target = this.selection.target === n.id;
        if(state.fortified){this.diamond(c,p.x,p.y+9,203,103,'#d1b57344');c.strokeStyle='#e9c879';c.lineWidth=3;c.stroke();}
        if (chosen || target || this.hover === n.id) {
            c.strokeStyle = target ? '#edcd76' : color;
            c.lineWidth = 3;
            this.diamond(c, p.x, p.y + 8, 192, 96, chosen ? '#c5da7922' : '#eed88611');
            c.stroke();
            c.fillStyle = color;
            for (const sign of [-1, 1])
                c.fillRect(p.x + sign * 93 - 3, p.y + 4, 6, 8);
        }
        const index = n.type === 'base' ? 0 : n.type === 'mine' ? 1 : n.type === 'tower' ? 2 : 3;
        if (!this.sprite(index, p.x, p.y + 16, n.type === 'factory' ? 192 : 168, n.type === 'tower' ? 184 : 154)) {
            if (n.type === 'base') {
                this.box(p.x, p.y, 120, 62, 45, '#b1b394', '#68745a');
                this.box(p.x - 26, p.y - 10, 59, 30, 69, '#a0ab86', '#596b50');
                this.box(p.x + 38, p.y + 2, 39, 28, 32, '#828f70', '#58664c');
                c.fillStyle = '#25382a';
                c.fillRect(p.x - 19, p.y - 28, 30, 14);
                c.fillStyle = color;
                c.fillRect(p.x - 30, p.y - 66, 54, 5);
            }
            if (n.type === 'mine') {
                this.box(p.x + 16, p.y, 74, 48, 40, '#b5a678', '#72694e');
                c.strokeStyle = '#b1aa86';
                c.lineWidth = 7;
                c.beginPath();
                c.moveTo(p.x - 44, p.y - 8);
                c.lineTo(p.x - 37, p.y - 66);
                c.lineTo(p.x + 24, p.y - 68);
                c.lineTo(p.x + 38, p.y - 11);
                c.stroke();
                c.strokeStyle = '#565c40';
                c.lineWidth = 4;
                c.beginPath();
                c.moveTo(p.x - 37, p.y - 66);
                c.lineTo(p.x + 38, p.y - 11);
                c.moveTo(p.x + 24, p.y - 68);
                c.lineTo(p.x - 44, p.y - 8);
                c.stroke();
                c.fillStyle = '#303a2c';
                c.fillRect(p.x - 13, p.y - 11, 25, 20);
            }
            if (n.type === 'tower') {
                this.box(p.x, p.y, 75, 42, 25, '#b4b69b', '#667357');
                c.strokeStyle = '#c2c7af';
                c.lineWidth = 6;
                c.beginPath();
                c.moveTo(p.x - 19, p.y - 18);
                c.lineTo(p.x, p.y - 115);
                c.lineTo(p.x + 19, p.y - 18);
                c.moveTo(p.x - 12, p.y - 54);
                c.lineTo(p.x + 12, p.y - 54);
                c.moveTo(p.x - 8, p.y - 80);
                c.lineTo(p.x + 8, p.y - 80);
                c.stroke();
                c.fillStyle = '#92b4b2';
                c.beginPath();
                c.ellipse(p.x + 17, p.y - 90, 21, 9, -.5, 0, Math.PI * 2);
                c.fill();
                c.fillStyle = '#f6d28a';
                c.fillRect(p.x - 3, p.y - 119, 6, 7);
            }
            if (n.type === 'factory') {
                this.box(p.x, p.y, 158, 82, 50, '#a5aa91', '#657256');
                this.box(p.x - 37, p.y - 21, 51, 30, 65, '#b7b99e', '#5a6950');
                this.box(p.x + 18, p.y - 2, 54, 36, 28, '#8b977b', '#55664a');
                c.fillStyle = '#3a4939';
                c.fillRect(p.x + 43, p.y - 98, 13, 56);
                c.fillRect(p.x + 63, p.y - 79, 10, 43);
                c.fillStyle = '#e0cd8f';
                c.fillRect(p.x + 43, p.y - 98, 13, 8);
            }
        }
        // Faction markers are independent of the shared sprite artwork.
        c.fillStyle = '#252e23';
        c.fillRect(p.x - 66, p.y - 41, 3, 55);
        c.fillStyle = color;
        c.beginPath();
        c.moveTo(p.x - 63, p.y - 42);
        c.lineTo(p.x - 32, p.y - 34);
        c.lineTo(p.x - 63, p.y - 24);
        c.fill();
        c.fillStyle = '#283326';
        c.fillRect(p.x - 55, p.y - 36, 4, 6);
        if(this.options.live&&state.owner>0&&!state.supplied&&n.type!=='base'){
            c.fillStyle='#382e25';c.fillRect(p.x-52,p.y-5,40,19);c.fillStyle='#ffc38c';c.font='bold 11px sans-serif';c.textAlign='center';c.fillText('断补给',p.x-32,p.y+8);
        }
    }
    private tree(x: number, y: number, size: number) {
        const c = this.ctx;
        c.save();
        c.translate(x, y);
        c.scale(size, size);
        if (!this.sprite(7, 0, 8, 70, 106)) {
            this.diamond(c, 5, 6, 51, 21, '#2b402966');
            c.fillStyle = '#554b32';
            c.fillRect(-4, -31, 8, 36);
            for (let i = 0; i < 3; i++) {
                c.fillStyle = ['#2f4935', '#3b5a3b', '#4e6b42'][i];
                c.beginPath();
                c.moveTo(0, -81 + i * 18);
                c.lineTo(28 - i * 3, -29 + i * 9);
                c.lineTo(-28 + i * 3, -29 + i * 9);
                c.closePath();
                c.fill();
                c.fillStyle = '#6e835344';
                c.fillRect(-3, -70 + i * 18, 4, 12);
            }
        }
        c.restore();
    }
    private troop(id: number, i: number) {
        const state=this.nodeState(id),u=state.units[i];if(!u)return;
        const c = this.ctx, n = NODES[id], p = project(n.x, n.y), o = this.offset(i), kind = ['步兵','坦克','工程师'][u.kind], color = colorFor(state.owner), selected = this.selection.source === id && this.selection.units.includes(i);
        c.save();
        c.translate(p.x + o.x, p.y + o.y);
        this.diamond(c, 0, 1, kind === '坦克' ? 34 : 19, kind === '坦克' ? 17 : 10, selected ? '#d7ed9a' : '#24362499');
        if (!this.sprite(kind === '坦克' ? 5 : kind === '工程师' ? 6 : 4, 0, 3, kind === '坦克' ? 48 : 29, kind === '坦克' ? 39 : 39)) {
            if (kind === '坦克') {
                this.box(0, 0, 35, 20, 10, '#98a37b', '#536149');
                c.fillStyle = color;
                c.fillRect(-8, -18, 17, 10);
                c.fillStyle = '#344232';
                c.fillRect(5, -20, 23, 5);
            }
            else {
                c.fillStyle = '#293b2c';
                c.fillRect(-5, -3, 4, 9);
                c.fillRect(2, -3, 4, 9);
                c.fillStyle = color;
                c.fillRect(-6, -21, 13, 18);
                c.fillStyle = '#d6c8a0';
                c.fillRect(-4, -29, 9, 8);
                c.fillStyle = kind === '工程师' ? '#dfbd66' : '#5c7546';
                c.fillRect(-6, -32, 13, 6);
                c.fillStyle = '#324033';
                c.fillRect(5, -19, 5, 19);
            }
        }
        if(this.options.live){const width=u.kind===1?34:23;c.fillStyle='#16261b';c.fillRect(-width/2,-44,width,4);c.fillStyle=u.hp/[10,30,8][u.kind]<.4?'#e7906f':color;c.fillRect(-width/2,-44,width*u.hp/[10,30,8][u.kind],4);}
        c.restore();
    }
    private draw() {
        const c = this.ctx, { width, height, zoom } = this.camera, dpr = this.canvas.width / width;
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.fillStyle = '#26392e';
        c.fillRect(0, 0, width, height);
        c.save();
        c.translate(width / 2 - this.camera.x * zoom, height / 2 - this.camera.y * zoom);
        c.scale(zoom, zoom);
        c.imageSmoothingEnabled = false;
        c.drawImage(this.terrain, -3072, -608);
        if(this.options.live&&this.liveBoard){
            for(const r of ROUTES){const a=this.nodeState(r.from),b=this.nodeState(r.to);if(!a.owner||a.owner!==b.owner)continue;
                c.strokeStyle=a.supplied&&b.supplied?colorFor(a.owner)+'bb':'#e9ae7488';c.lineWidth=4;c.setLineDash(a.supplied&&b.supplied?[]:[9,8]);c.beginPath();r.points.forEach((p,i)=>{const q=project(p.x,p.y);if(i)c.lineTo(q.x,q.y);else c.moveTo(q.x,q.y);});c.stroke();c.setLineDash([]);
            }
        }
        const objects: ({
            depth: number;
            draw: () => void;
        })[] = this.trees.map(t => ({ depth: t.y, draw: () => this.tree(t.x, t.y, t.size) }));
        for (const n of NODES) {
            const p = project(n.x, n.y);
            if (n.type === 'tower') {
                for (const [ox, oy, w, d, h] of [[-108, -21, 53, 34, 31], [-65, -51, 44, 27, 48], [92, -28, 57, 33, 26], [108, 23, 34, 26, 13], [-105, 25, 34, 25, 12]]) {
                    objects.push({ depth: p.y + oy, draw: () => {
                            this.box(p.x + ox, p.y + oy, w, d, h, '#8b9274', '#677255');
                            c.fillStyle = '#323f30';
                            c.fillRect(p.x + ox - 5, p.y + oy - h + 4, 7, 7);
                            c.fillStyle = '#b2ac86';
                            c.fillRect(p.x + ox - 12, p.y + oy + 3, 8, 4);
                            c.fillRect(p.x + ox + 9, p.y + oy + 6, 5, 3);
                        } });
                }
            }
            if (n.type === 'base') {
                for (const [ox, oy] of [[-98, 20], [105, -11]])
                    objects.push({ depth: p.y + oy, draw: () => {
                            this.box(p.x + ox, p.y + oy, 41, 27, 19, '#8d9678', '#626e51');
                            c.fillStyle = colorFor(this.nodeState(n.id).owner);
                            c.fillRect(p.x + ox - 10, p.y + oy - 18, 20, 3);
                        } });
            }
            objects.push({ depth: p.y, draw: () => this.building(n) });
            this.nodeState(n.id).units.forEach((_, i) => objects.push({ depth: p.y + this.offset(i).y, draw: () => this.troop(n.id, i) }));
        }
        objects.sort((a, b) => a.depth - b.depth).forEach(o => o.draw());
        if (this.selection.source !== null && this.selection.target !== null) {
            const a = this.selection.source, b = this.selection.target, r = ROUTES.find(r => (r.from === a && r.to === b) || (r.to === a && r.from === b));
            if (r && (this.options.live?liveTarget(this.liveBoard,a,b,this.options.team?.()??0):legalTarget(a, b))) {
                c.strokeStyle = '#ffe39b';
                c.lineWidth = 7;
                c.setLineDash([12, 9]);
                c.beginPath();
                r.points.forEach((p, i) => {
                    const q = project(p.x, p.y);
                    if (i === 0)
                        c.moveTo(q.x, q.y);
                    else
                        c.lineTo(q.x, q.y);
                });
                c.stroke();
                c.setLineDash([]);
            }
        }
        for(const r of this.replays){const elapsed=performance.now()-r.at;const returning=r.returned&&elapsed>1900;const t=Math.min(1,(returning?elapsed-1900:elapsed)/(returning?1500:1900));const p=roadPoint(returning?r.to:r.from,returning?r.from:r.to,t);if(!p)continue;
            this.diamond(c,p.x,p.y,29,16,colorFor(r.team));c.fillStyle='#15221b';c.textAlign='center';c.font='bold 10px sans-serif';c.fillText(String(r.count),p.x,p.y+4);c.fillStyle='#f4edd2';c.fillText(returning?'确认回放·返回':'确认回放',p.x,p.y-13);
        }
        c.restore();
        // Labels remain readable at every zoom level.
        for (const n of NODES) {
            const p = project(n.x, n.y), s = worldToScreen(this.camera, p.x, p.y);
            if (s.x < -100 || s.x > width + 100 || s.y < -100 || s.y > height + 100)
                continue;
            const selected = this.selection.source === n.id, ty = s.y + 34 * zoom + 15;
            const label = `${String(n.id).padStart(2, '0')}  ${n.name.replace('前进', '')}`;
            c.font = `${selected ? '600' : '500'} 11px "PingFang SC",sans-serif`;
            const w = c.measureText(label).width + 18;
            c.fillStyle = selected ? '#24311ff0' : '#1b271edb';
            c.fillRect(s.x - w / 2, ty - 11, w, 21);
            c.fillStyle = colorFor(this.nodeState(n.id).owner);
            c.fillRect(s.x - w / 2, ty - 11, 2, 21);
            c.fillStyle = selected ? '#f1edcf' : '#d6d9bb';
            c.textAlign = 'center';
            c.fillText(label, s.x, ty + 3);
        }
        if(this.drag?.selecting&&this.drag.moved){const d=this.drag;c.strokeStyle='#e5e9a2';c.fillStyle='#d9e69322';c.lineWidth=1;c.fillRect(d.startX,d.startY,d.x-d.startX,d.y-d.startY);c.strokeRect(d.startX,d.startY,d.x-d.startX,d.y-d.startY);}
    }
    private drawMini() {
        const c = this.minictx, r = this.mini.getBoundingClientRect(), w = r.width, h = r.height, dpr = this.mini.width / w;
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.fillStyle = '#18241b';
        c.fillRect(0, 0, w, h);
        c.fillStyle = '#5d7048';
        c.beginPath();
        c.moveTo(w / 2, 0);
        c.lineTo(w, h / 2);
        c.lineTo(w / 2, h);
        c.lineTo(0, h / 2);
        c.fill();
        c.strokeStyle = '#b1ab7d';
        c.lineWidth = 1;
        for (const route of ROUTES) {
            c.beginPath();
            route.points.forEach((p, i) => {
                const q = project(p.x, p.y), m = minimapPoint(q.x, q.y, w, h);
                if (i === 0)
                    c.moveTo(m.x, m.y);
                else
                    c.lineTo(m.x, m.y);
            });
            c.stroke();
        }
        for (const n of NODES) {
            const p = project(n.x, n.y), m = minimapPoint(p.x, p.y, w, h);
            c.fillStyle = colorFor(this.nodeState(n.id).owner);
            c.fillRect(m.x - 2.5, m.y - 2.5, 5, 5);
        }
        const a = screenToWorld(this.camera, 0, 0), b = screenToWorld(this.camera, this.camera.width, this.camera.height), ma = minimapPoint(a.x, a.y, w, h), mb = minimapPoint(b.x, b.y, w, h);
        c.strokeStyle = '#e9e8b8';
        c.fillStyle = '#eff5c20b';
        c.lineWidth = 1;
        c.fillRect(ma.x, ma.y, mb.x - ma.x, mb.y - ma.y);
        c.strokeRect(ma.x, ma.y, mb.x - ma.x, mb.y - ma.y);
    }
}
