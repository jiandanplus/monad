export type Point = {
    x: number;
    y: number;
};
export type Faction = {
    id: number;
    name: string;
    color: string;
    shape: string;
    base: number;
    short: string;
};
export type Node = {
    id: number;
    x: number;
    y: number;
    name: string;
    type: 'base' | 'mine' | 'tower' | 'factory';
    faction: number;
};
export type Route = {
    from: number;
    to: number;
    points: Point[];
};
export type Camera = {
    x: number;
    y: number;
    zoom: number;
    width: number;
    height: number;
};
export const FACTIONS: ReadonlyArray<Faction>;
export const NODES: ReadonlyArray<Node>;
export const EDGES: ReadonlyArray<readonly [
    number,
    number
]>;
export const ROUTES: ReadonlyArray<Route>;
export const WORLD_BOUNDS: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
};
export function project(x: number, y: number): Point;
export function unproject(x: number, y: number): Point;
export function worldToScreen(c: Camera, x: number, y: number): Point;
export function screenToWorld(c: Camera, x: number, y: number): Point;
export function clampCamera(c: Camera): Camera;
export function zoomAt(c: Camera, zoom: number, x: number, y: number): Camera;
export function minimapPoint(x: number, y: number, width: number, height: number): Point;
export function minimapToWorld(x: number, y: number, width: number, height: number): Point;
export function neighbors(id: number): number[];
export function legalTarget(from: number, to: number): boolean;
export function routeLength(route: Route): number;
export function hitNode(x: number, y: number): number | null;
export function isClickGesture(start: Point, end: Point, cancelled?: boolean): boolean;
export const UNIT_OFFSETS: ReadonlyArray<Point>;
export function hitUnit(x: number, y: number): {
    node: number;
    unit: number;
} | null;
export function pointerSelection(node: number, unit: number | undefined, button?: number): {
    node: number;
    unit: number | undefined;
    asTarget: boolean;
};
export function validNode(id: number): number;
