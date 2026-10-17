import {loadMapScene} from './helpers/load-map-scene.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { FACTIONS, NODES, EDGES, ROUTES, WORLD_BOUNDS, project, unproject, worldToScreen, screenToWorld, zoomAt, clampCamera, minimapPoint, minimapToWorld, neighbors, legalTarget, routeLength, hitNode, isClickGesture, hitUnit, UNIT_OFFSETS, pointerSelection } from '../src/map-preview/world.mjs';

const near = (a,b) => assert.ok(Math.abs(a-b)<1e-8, `${a} != ${b}`);
test('64 by 32 isometric projection round trips arbitrary tile coordinates', () => {
  for (const [x,y] of [[0,0],[64,64],[12.25,43.75],[-3,7]]) {
    const p=project(x,y), q=unproject(p.x,p.y); near(q.x,x); near(q.y,y);
  }
  assert.deepEqual(project(1,0),{x:32,y:16});
});
test('screen/world transforms preserve picks after pan and zoom',()=>{
  for(const zoom of [.5,1,2]) { const c={x:321,y:1150,zoom,width:900,height:600};
    const p=project(NODES[9].x,NODES[9].y), s=worldToScreen(c,p.x,p.y), q=screenToWorld(c,s.x,s.y);
    near(p.x,q.x); near(p.y,q.y); assert.equal(hitNode(q.x,q.y),9);
  }
});
test('zoom keeps the cursor world point fixed and clamps 0.5 through 2',()=>{
 const c={x:0,y:1024,zoom:1,width:1000,height:700};
 const p=screenToWorld(c,333,222), next=zoomAt(c,1.7,333,222), q=screenToWorld(next,333,222);
 near(p.x,q.x); near(p.y,q.y); assert.equal(zoomAt(c,99,500,350).zoom,2); assert.equal(zoomAt(c,.01,500,350).zoom,.5);
});
test('camera center remains inside world boundaries',()=>{
 const c=clampCamera({x:-99999,y:99999,zoom:1,width:1000,height:700});
 assert.ok(c.x>=WORLD_BOUNDS.minX && c.x<=WORLD_BOUNDS.maxX);
 assert.ok(c.y>=WORLD_BOUNDS.minY && c.y<=WORLD_BOUNDS.maxY);
 for(const [x,y] of [[99999,-99999],[-99999,99999],[99999,99999],[-99999,-99999]]){const bounded=clampCamera({x,y,zoom:2,width:900,height:600}),tile=unproject(bounded.x,bounded.y);assert.ok(tile.x>=0&&tile.x<=64&&tile.y>=0&&tile.y<=64,'camera center must remain on the diamond map, not an empty bounding-box corner');}
});
test('minimap uses the same projected world coordinates and round trips',()=>{
 for(const node of NODES) { const p=project(node.x,node.y), m=minimapPoint(p.x,p.y,240,120), q=minimapToWorld(m.x,m.y,240,120);near(p.x,q.x);near(p.y,q.y); }
});
test('13 nodes, four factions and exact 20 authoritative undirected edges',()=>{
 assert.equal(FACTIONS.length,4);assert.equal(NODES.length,13);assert.equal(EDGES.length,20);
 const expected=['0-4','0-7','1-4','1-5','2-5','2-6','3-6','3-7','4-8','4-9','5-9','5-10','6-10','6-11','7-11','7-8','8-12','9-12','10-12','11-12'];
 assert.deepEqual(EDGES.map(e=>e.join('-')),expected);
 assert.deepEqual(NODES.slice(0,4).map(n=>n.faction),[1,3,2,4]);
 assert.ok(Object.isFrozen(NODES));assert.ok(Object.isFrozen(NODES[0]));assert.ok(Object.isFrozen(ROUTES[0].points));
});
test('each rendered road corresponds to exactly one authoritative edge and reaches its facilities',()=>{
 assert.equal(ROUTES.length,20);
 for(const [a,b] of EDGES) { const r=ROUTES.find(r=>r.from===a&&r.to===b); assert.ok(r); assert.deepEqual(r.points[0],{x:NODES[a].x,y:NODES[a].y}); assert.deepEqual(r.points.at(-1),{x:NODES[b].x,y:NODES[b].y}); }
});
test('road geometry rotates with equal lengths for each of four factions',()=>{
 const rotate=id=>id===12?12:id<4?(id+1)%4:id<8?4+(id-3)%4:8+(id-7)%4;
 for(const r of ROUTES) {const a=rotate(r.from),b=rotate(r.to),q=ROUTES.find(q=>(q.from===a&&q.to===b)||(q.from===b&&q.to===a));assert.ok(q); near(routeLength(r),routeLength(q));}
});
test('legal adjacent targets reject self, nonadjacent nodes and other bases',()=>{
 assert.deepEqual(neighbors(0),[4,7]);assert.equal(legalTarget(0,4),true);assert.equal(legalTarget(0,12),false);assert.equal(legalTarget(4,1),false);assert.equal(legalTarget(8,8),false);assert.equal(legalTarget(8,12),true);
});
test('node interfaces reject noninteger, nonfinite and out of range IDs',()=>{
 for(const id of [-1,13,NaN,Infinity,1.5,'0',null]) {assert.throws(()=>neighbors(id),/node/i); assert.throws(()=>legalTarget(0,id),/node/i);}
 assert.equal(hitNode(9999,9999),null);
});
test('dragging never classifies as a click even when intermediate pointer moves are missing',()=>{
 assert.equal(isClickGesture({x:550,y:300},{x:750,y:400},false),false);
 assert.equal(isClickGesture({x:550,y:300},{x:551,y:302},false),true);
 assert.equal(isClickGesture({x:550,y:300},{x:550,y:300},true),false);
});
test('facility picking includes the visible top of a tall communication mast',()=>{
 const p=project(NODES[9].x,NODES[9].y);assert.equal(hitNode(p.x,p.y-150),9);assert.equal(hitNode(p.x+100,p.y-150),null);
});
test('unit picking includes head and body, not just the feet',()=>{
 const p=project(NODES[1].x,NODES[1].y),u=UNIT_OFFSETS[0];
 assert.deepEqual(hitUnit(p.x+u.x,p.y+u.y-29),{node:1,unit:0});
 assert.deepEqual(hitUnit(p.x+u.x,p.y+u.y-15),{node:1,unit:0});
 assert.equal(hitUnit(p.x+u.x,p.y+u.y-70),null);
});
test('right clicking a visible unit targets its facility without toggling selection',()=>{
 assert.deepEqual(pointerSelection(1,0,0),{node:1,unit:0,asTarget:false});
 assert.deepEqual(pointerSelection(1,0,2),{node:1,unit:undefined,asTarget:true});
});



test('scene entry points reject invalid IDs and own a copy of selection', async () => {
 const MapScene = await loadMapScene();
 const scene = Object.create(MapScene.prototype);
 scene.camera = { x: 0, y: 1024, zoom: 1, width: 900, height: 600 };
 scene.options = { onCamera() {} };
 for (const id of [-1, 13, NaN, Infinity, 1.5, '0', undefined, {}, true]) {
   assert.throws(() => scene.centerOn(id), /node/i);
   assert.throws(() => scene.setSelection({ source: id, target: null, units: [] }), /node/i);
   assert.throws(() => scene.setSelection({ source: 0, target: id, units: [] }), /node/i);
 }
 assert.throws(() => scene.centerOn(null), /node/i);
 const selection = { source: null, target: null, units: [0, 1] };
 scene.setSelection(selection);
 selection.source = 4;
 selection.units.push(2);
 assert.deepEqual(scene.selection, { source: null, target: null, units: [0, 1] });
 scene.centerOn(4);
 assert.equal(scene.camera.x, project(NODES[4].x, NODES[4].y).x);
});

test('persisted page lifecycle suspends and resumes repeatedly without disposing the restored map', async () => {
 const { bindPageLifecycle } = await import('../src/map-preview/lifecycle.mjs');
 const page = new EventTarget();
 const actions = [];
 bindPageLifecycle(page, {
   suspend: () => actions.push('suspend'),
   resume: () => actions.push('resume'),
   dispose: () => actions.push('dispose'),
 });
 const dispatch = (type, persisted) => {
   const event = new Event(type);
   Object.defineProperty(event, 'persisted', { value: persisted });
   page.dispatchEvent(event);
 };
 dispatch('pageshow', false);
 dispatch('pagehide', true);
 dispatch('pagehide', true);
 dispatch('pageshow', true);
 dispatch('pageshow', true);
 dispatch('pagehide', true);
 dispatch('pageshow', true);
 assert.deepEqual(actions, ['suspend', 'resume', 'suspend', 'resume']);
 dispatch('pagehide', false);
 dispatch('pageshow', true);
 dispatch('pagehide', false);
 assert.deepEqual(actions, ['suspend', 'resume', 'suspend', 'resume', 'dispose']);
});


test('scene suspension cancels animation and resume schedules only one loop', async () => {
 const MapScene = await loadMapScene();
 const scene = Object.create(MapScene.prototype);
 const originalRequest = globalThis.requestAnimationFrame;
 const originalCancel = globalThis.cancelAnimationFrame;
 const cancelled = [];
 let requested = 0;
 let resized = 0;
 globalThis.requestAnimationFrame = () => ++requested;
 globalThis.cancelAnimationFrame = id => cancelled.push(id);
 try {
   scene.disposed = false;
   scene.paused = false;
   scene.raf = 7;
   scene.keys = new Set(['w']);
   scene.drag = null;
   scene.resize = () => resized++;
   scene.pause();
   scene.pause();
   assert.deepEqual(cancelled, [7]);
   assert.equal(scene.keys.size, 0);
   scene.resume();
   scene.resume();
   assert.equal(requested, 1);
   assert.equal(resized, 1);
   scene.pause();
   scene.disposed = true;
   scene.resume();
   assert.equal(requested, 1);
 } finally {
   if (originalRequest) globalThis.requestAnimationFrame = originalRequest;
   else delete globalThis.requestAnimationFrame;
   if (originalCancel) globalThis.cancelAnimationFrame = originalCancel;
   else delete globalThis.cancelAnimationFrame;
 }
});
