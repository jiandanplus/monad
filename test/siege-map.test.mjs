import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {NODES,project,ROUTES} from '../src/map-preview/world.mjs';
import {loadMapScene} from './helpers/load-map-scene.mjs';
const url=new URL('../src/map-preview/live-world.mjs',import.meta.url);
const present=existsSync(url);
const live=present?await import(url.href):null;
const board=()=>NODES.map(()=>({owner:0,units:[],supplied:false,fortified:false}));
test('live map adapter exists',()=>assert.ok(present,'live state projection and picking are missing'));
test('unknown live state never synthesizes preview units or ownership',{skip:!present},()=>{
 assert.deepEqual(live.displayNode(null,0,true),{owner:0,units:[],supplied:false,fortified:false});
 const b=board();b[0]={owner:3,units:[{kind:1,hp:7}],supplied:true,fortified:false};
 assert.deepEqual(live.displayNode(b,0,true),b[0]);
 assert.equal(live.displayNode(null,0,false).units.length,5);
 assert.equal(live.displayNode(null,4,false).units.length,2);
 assert.throws(()=>live.displayNode(b,13,true),/node/i);
});
test('every one of twelve actual units is selectable, including wounded tanks',{skip:!present},()=>{
 const b=board();b[8].owner=2;b[8].units=Array.from({length:12},(_,i)=>({kind:i%3,hp:[1,7,8][i%3]}));
 const p=project(NODES[8].x,NODES[8].y);
 for(let i=0;i<12;i++){const o=live.unitOffset(i);assert.deepEqual(live.hitLiveUnit(b,p.x+o.x,p.y+o.y-15),{node:8,unit:i});}
 assert.equal(live.hitLiveUnit(board(),p.x+64,p.y),null);
 assert.equal(live.hitLiveUnit(null,p.x+64,p.y),null);
 assert.throws(()=>live.unitOffset(12),/unit/i);
});
test('box selection stays at one friendly source and has six-unit cap',{skip:!present},()=>{
 const b=board();b[0].owner=1;b[0].units=Array.from({length:12},()=>({kind:0,hp:10}));b[1].owner=3;b[1].units=[{kind:1,hp:30}];
 const p=project(NODES[0].x,NODES[0].y);
 assert.deepEqual(live.boxUnits(b,{x1:p.x+20,y1:p.y-30,x2:p.x+250,y2:p.y+160},1),{source:0,units:[0,1,2,3,4,5],mixed:false,truncated:true});
 assert.equal(live.boxUnits(b,{x1:-2000,y1:0,x2:2000,y2:2000},1).source,0);
 b[1].owner=1;
 const result=live.boxUnits(b,{x1:-2000,y1:0,x2:2000,y2:2000},1);
 assert.equal(result.mixed,true);assert.equal(result.source,null);assert.deepEqual(result.units,[]);
});
test('confirmed replay follows every road segment in either direction',{skip:!present},()=>{
 for(const r of ROUTES){const a=project(r.points[0].x,r.points[0].y),z=project(r.points.at(-1).x,r.points.at(-1).y);
  assert.deepEqual(live.roadPoint(r.from,r.to,0),a);assert.deepEqual(live.roadPoint(r.from,r.to,1),z);
  assert.deepEqual(live.roadPoint(r.to,r.from,0),z);assert.deepEqual(live.roadPoint(r.to,r.from,1),a);
  const m=live.roadPoint(r.from,r.to,.31),n=live.roadPoint(r.to,r.from,.69);assert.ok(Math.hypot(m.x-n.x,m.y-n.y)<1e-7);
 }
 assert.equal(live.roadPoint(0,12,.5),null);
});
test('live node snapshots are validated and copied before rendering',{skip:!present},()=>{
 const b=board();b[0].owner=1;b[0].units=[{kind:0,hp:3}];const copy=live.copyLiveBoard(b);
 b[0].units[0].hp=9;assert.equal(copy[0].units[0].hp,3);
 const bad=board();bad[0].units=[{kind:1,hp:31}];assert.throws(()=>live.copyLiveBoard(bad),/unit/i);
 assert.throws(()=>live.copyLiveBoard([]),/13/);
});
test('live movement allows retreat to own base but rejects enemy bases',{skip:!present},()=>{
 const b=board();b[0].owner=b[4].owner=1;b[1].owner=3;
 assert.equal(live.liveTarget(b,4,0,1),true);assert.equal(live.liveTarget(b,4,1,1),false);
 assert.equal(live.liveTarget(b,0,4,1),true);assert.equal(live.liveTarget(b,0,12,1),false);
 assert.equal(live.liveTarget(null,4,0,1),false);
});
test('live renderer switches authoritative armies atomically and clears unknown state',async()=>{
 const MapScene=await loadMapScene();const scene=Object.create(MapScene.prototype);scene.options={live:true};
 assert.equal(typeof scene.setState,'function','renderer live snapshot support is missing');
 const b=board();b[0].owner=2;b[0].units=[{kind:1,hp:7}];scene.setState(b);
 b[0].units[0].hp=30;assert.equal(scene.nodeState(0).units[0].hp,7);
 assert.equal(scene.nodeState(0).owner,2);scene.setState(null);
 assert.equal(scene.nodeState(0).units.length,0);assert.equal(scene.nodeState(0).owner,0);
 assert.throws(()=>scene.setState([]),/13/);
});
test('live snapshots reject holes in every board and unit position',()=>{
 assert.throws(()=>live.copyLiveBoard(Array(13)),/node/i);
 for(let i=0;i<13;i++){
  const b=board();delete b[i];assert.throws(()=>live.copyLiveBoard(b),/node/i);
 }
 for(let i=0;i<12;i++){
  const b=board();b[0].units=Array.from({length:12},()=>({kind:0,hp:10}));delete b[0].units[i];
  assert.throws(()=>live.copyLiveBoard(b),/unit/i);
 }
});
test('confirmed replay ingestion bounds active markers and preserves active deduplication even while paused',async()=>{
 const MapScene=await loadMapScene();
 for(const paused of [false,true]){
  const scene=Object.create(MapScene.prototype);
  Object.assign(scene,{options:{live:true},liveBoard:board(),replays:[],replayKeys:new Set(),paused});
  const order={from:0,to:4,count:1,team:1};
  for(let i=0;i<125;i++){
   scene.playConfirmedOrder({...order,hash:`order-${i}`});
   assert.ok(scene.replays.length<=100,'active marker capacity');
   assert.ok(scene.replayKeys.size<=100,'recent hash capacity');
  }
  scene.playConfirmedOrder({...order,hash:'order-0'});
  assert.ok(scene.replays.length<=100);
  assert.equal(new Set(scene.replays.map(r=>r.hash)).size,scene.replays.length);
  for(const replay of [...scene.replays])scene.playConfirmedOrder(replay);
  assert.equal(scene.replays.length,100,'retained active hashes remain deduplicated');
 }
});
test('paused replay ingestion expires elapsed markers before checking a duplicate hash',async t=>{
 const MapScene=await loadMapScene();let now=100;
 t.mock.method(performance,'now',()=>now);
 const scene=Object.create(MapScene.prototype);
 Object.assign(scene,{options:{live:true},liveBoard:board(),replays:[],replayKeys:new Set(),paused:true});
 const order={from:0,to:4,count:1,team:1,hash:'expired'};
 scene.playConfirmedOrder(order);
 scene.playConfirmedOrder({...order,hash:'returning',returned:true});
 now=2400;scene.playConfirmedOrder(order);
 assert.deepEqual(scene.replays.map(r=>r.hash),['returning']);
 now=3800;scene.playConfirmedOrder(order);
 assert.deepEqual(scene.replays,[]);
 assert.equal(scene.replayKeys.size,2,'recent hashes remain deduplicated after marker expiry');
});
test('a longer returning replay stays unique after short markers expire and FIFO keys evict',async t=>{
 const MapScene=await loadMapScene();let now=100;t.mock.method(performance,'now',()=>now);
 const scene=Object.create(MapScene.prototype);
 Object.assign(scene,{options:{live:true},liveBoard:board(),replays:[],replayKeys:new Set(),paused:true});
 const order={from:0,to:4,count:1,team:1};
 scene.playConfirmedOrder({...order,hash:'long',returned:true});
 for(let i=0;i<99;i++)scene.playConfirmedOrder({...order,hash:`short-${i}`});
 now=2400;scene.playConfirmedOrder({...order,hash:'new'});
 scene.playConfirmedOrder({...order,hash:'long',returned:true});
 assert.deepEqual(scene.replays.map(r=>r.hash),['long','new']);
});
test('pointer cancellation, capture loss and blur invalidate a drawn selection marquee',async()=>{
 const MapScene=await loadMapScene();const originalWindow=globalThis.window;
 const listeners=new Map();const windowListeners=new Map();
 const surface=events=>({addEventListener:(name,fn)=>events.set(name,fn),removeEventListener(){},classList:{remove(){}},hasPointerCapture:()=>false});
 const scene=Object.create(MapScene.prototype);
 Object.assign(scene,{canvas:surface(listeners),mini:surface(new Map()),cleanups:[],keys:new Set()});
 globalThis.window=surface(windowListeners);
 try{
  scene.bind();
  for(const [events,name] of [[listeners,'pointercancel'],[listeners,'lostpointercapture'],[windowListeners,'blur']]){
   scene.drag={id:7,selecting:true,moved:true,startX:0,startY:0,x:50,y:50};scene.dirty=false;
   events.get(name)({pointerId:7});
   assert.equal(scene.drag,null,name);
   assert.equal(scene.dirty,true,`${name} must redraw the cleared marquee`);
  }
 }finally{
  if(originalWindow===undefined)delete globalThis.window;else globalThis.window=originalWindow;
 }
});
