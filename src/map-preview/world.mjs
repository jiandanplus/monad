const freeze = value => {
    if (value && typeof value === 'object') {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
    }
    return value;
};
export const FACTIONS = freeze([
    { id: 1, name: '翡翠联盟', color: '#a8ce72', shape: '■', base: 0, short: '翡翠' },
    { id: 2, name: '赤焰军团', color: '#e7876b', shape: '▲', base: 2, short: '赤焰' },
    { id: 3, name: '苍蓝联邦', color: '#7dbed5', shape: '◆', base: 1, short: '苍蓝' },
    { id: 4, name: '紫曜议会', color: '#b59bd3', shape: '●', base: 3, short: '紫曜' },
]);
const positions = [[8, 32], [32, 8], [56, 32], [32, 56], [16, 16], [48, 16], [48, 48], [16, 48], [23, 32], [32, 23], [41, 32], [32, 41], [32, 32]];
const names = ['翡翠前进基地', '苍蓝前进基地', '赤焰前进基地', '紫曜前进基地', '北部矿场', '东部矿场', '南部矿场', '西部矿场', '西北通信塔', '东北通信塔', '东南通信塔', '西南通信塔', '中央兵工厂'];
export const NODES = freeze(positions.map(([x, y], id) => ({ id, x, y, name: names[id], type: id < 4 ? 'base' : id < 8 ? 'mine' : id < 12 ? 'tower' : 'factory', faction: id < 4 ? [1, 3, 2, 4][id] : 0 })));
export const EDGES = freeze([[0, 4], [0, 7], [1, 4], [1, 5], [2, 5], [2, 6], [3, 6], [3, 7], [4, 8], [4, 9], [5, 9], [5, 10], [6, 10], [6, 11], [7, 11], [7, 8], [8, 12], [9, 12], [10, 12], [11, 12]]);
const rotateId = id => id === 12 ? 12 : id < 4 ? (id + 1) % 4 : id < 8 ? 4 + (id - 3) % 4 : 8 + (id - 7) % 4;
const seeds = [{ from: 0, to: 4, points: [[8, 32], [8, 22], [16, 22], [16, 16]] }, { from: 0, to: 7, points: [[8, 32], [8, 42], [16, 42], [16, 48]] }, { from: 4, to: 8, points: [[16, 16], [23, 32]] }, { from: 4, to: 9, points: [[16, 16], [32, 23]] }, { from: 8, to: 12, points: [[23, 32], [32, 32]] }];
const routes = [];
for (const seed of seeds) {
    let { from, to, points } = seed;
    for (let i = 0; i < 4; i++) {
        routes.push({ from, to, points: points.map(([x, y]) => ({ x, y })) });
        from = rotateId(from);
        to = rotateId(to);
        points = points.map(([x, y]) => [64 - y, x]);
    }
}
export const ROUTES = freeze(EDGES.map(([from, to]) => {
    const r = routes.find(r => (r.from === from && r.to === to) || (r.from === to && r.to === from));
    return { from, to, points: r.from === from ? r.points : [...r.points].reverse() };
}));
export const WORLD_BOUNDS = freeze({ minX: -2048, maxX: 2048, minY: 0, maxY: 2048 });
export function project(x, y) {
    return { x: (x - y) * 32, y: (x + y) * 16 };
}
export function unproject(x, y) {
    return { x: x / 64 + y / 32, y: y / 32 - x / 64 };
}
export function worldToScreen(c, x, y) {
    return { x: (x - c.x) * c.zoom + c.width / 2, y: (y - c.y) * c.zoom + c.height / 2 };
}
export function screenToWorld(c, x, y) {
    return { x: (x - c.width / 2) / c.zoom + c.x, y: (y - c.height / 2) / c.zoom + c.y };
}
export function clampCamera(c) {
    const tile = unproject(c.x, c.y), p = project(Math.max(2, Math.min(62, tile.x)), Math.max(2, Math.min(62, tile.y)));
    return { ...c, x: p.x, y: p.y, zoom: Math.max(.5, Math.min(2, c.zoom)) };
}
export function zoomAt(c, zoom, x, y) {
    const p = screenToWorld(c, x, y);
    const z = Math.max(.5, Math.min(2, zoom));
    return clampCamera({ ...c, zoom: z, x: p.x - (x - c.width / 2) / z, y: p.y - (y - c.height / 2) / z });
}
export function minimapPoint(x, y, width, height) {
    return { x: (x + 2048) / 4096 * width, y: y / 2048 * height };
}
export function minimapToWorld(x, y, width, height) {
    return { x: x / width * 4096 - 2048, y: y / height * 2048 };
}
export function validNode(id) {
    if (!Number.isInteger(id) || !Number.isFinite(id) || id < 0 || id >= NODES.length)
        throw new RangeError('Invalid node ID: expected integer 0..12');
    return id;
}
export function neighbors(id) {
    validNode(id);
    return EDGES.flatMap(([a, b]) => a === id ? [b] : b === id ? [a] : []);
}
export function legalTarget(from, to) {
    validNode(from);
    validNode(to);
    return neighbors(from).includes(to) && NODES[to].type !== 'base';
}
export function routeLength(route) {
    return route.points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - route.points[i].x, p.y - route.points[i].y), 0);
}
export function hitNode(x, y) {
    let match = null;
    let nearest = Infinity;
    for (const n of NODES) {
        const p = project(n.x, n.y), width = n.type === 'tower' ? 110 : n.type === 'factory' ? 192 : 168, height = n.type === 'tower' ? 184 : 154;
        if (x < p.x - width / 2 || x > p.x + width / 2 || y < p.y + 16 - height || y > p.y + 20)
            continue;
        const d = Math.hypot(x - p.x, (y - (p.y - height / 2 + 16)) * .5);
        if (d < nearest) {
            nearest = d;
            match = n.id;
        }
    }
    return match;
}
export function isClickGesture(start, end, cancelled = false) {
    return !cancelled && Math.hypot(end.x - start.x, end.y - start.y) <= 5;
}
export const UNIT_OFFSETS = freeze([{ x: 68, y: 14 }, { x: 87, y: 25 }, { x: 48, y: 26 }, { x: 68, y: 43 }, { x: 105, y: 41 }]);
export function hitUnit(x, y) {
    let hit = null, nearest = Infinity;
    for (const node of NODES) {
        const p = project(node.x, node.y);
        for (let i = 0; i < (node.id < 4 ? 5 : 2); i++) {
            const u = UNIT_OFFSETS[i], ux = p.x + u.x, uy = p.y + u.y, w = i === 3 ? 48 : 29;
            if (x >= ux - w / 2 && x <= ux + w / 2 && y >= uy - 36 && y <= uy + 6) {
                const distance = Math.hypot(x - ux, (y - (uy - 14)) * .5);
                if (distance < nearest) {
                    nearest = distance;
                    hit = { node: node.id, unit: i };
                }
            }
        }
    }
    return hit;
}
export function pointerSelection(node, unit, button = 0) {
    validNode(node);
    return { node, unit: button === 2 ? undefined : unit, asTarget: button === 2 };
}
