import test from 'node:test';
import assert from 'node:assert/strict';
import { FACTIONS, HOME_BY_TEAM, NODES, EDGES, ROUND_SECONDS, UNIT_STATS } from '../src/siege/config.mjs';
import { neighbors, supplied, rates } from '../src/siege/supply.mjs';

test('map is a 13-node rotation-symmetric graph with 20 undirected roads and distance three to every base', () => {
  assert.equal(NODES[0].kind,'base'); assert.equal(NODES[0].baseTeam,1); assert.equal(FACTIONS[0].base,0); assert.equal(NODES.length, 13); assert.equal(EDGES.length, 20); assert.equal(ROUND_SECONDS, 300);
  assert.deepEqual(HOME_BY_TEAM, {1:0,2:2,3:1,4:3}); assert.deepEqual(FACTIONS.map(f => f.id), [1,2,3,4]);
  assert.deepEqual(UNIT_STATS.map(u => [u.cost,u.hp]), [[20,10],[50,30],[35,8]]);
  const rotate = n => n === 12 ? 12 : Math.floor(n / 4) * 4 + (n + 1) % 4;
  for (const [a,b] of EDGES) { assert(neighbors(a).includes(b)); assert(neighbors(b).includes(a)); assert(neighbors(rotate(a)).includes(rotate(b))); }
  for (const home of [0,1,2,3]) { const dist = new Map([[home,0]]); const queue = [home]; for (const n of queue) for (const x of neighbors(n)) if (!dist.has(x)) {dist.set(x, dist.get(n)+1);queue.push(x);} assert.equal(dist.get(12),3); assert.equal(neighbors(home).length,2); }
});
test('supply takes alternate friendly paths and stops at enemy and neutral nodes', () => {
  const owners = [1,3,2,4,1,0,0,1,1,0,0,0,1]; const before=structuredClone(owners);
  assert.deepEqual(supplied(owners,1).map((yes,i) => yes ? i : null).filter(i => i !== null), [0,4,7,8,12]);
  owners[4]=2; assert.equal(supplied(owners,1)[12],true); assert.deepEqual(rates(owners,1), {income:2,score:1,connected:supplied(owners,1)});
  owners[7]=0; assert.equal(supplied(owners,1)[12],false); assert.deepEqual(rates(owners,1),{income:1,score:0,connected:supplied(owners,1)});
  owners[7]=1; assert.equal(supplied(owners,1)[12],true); assert.deepEqual(before,[1,3,2,4,1,0,0,1,1,0,0,0,1]);
});
test('supply validates all owners, node ids and faction ids and returns fresh arrays', () => {
 const owners=[1,3,2,4,...Array(9).fill(0)]; for(const team of [0,5,1.5,'1']) assert.throws(()=>supplied(owners,team));
 for(const bad of [[],Array(13).fill(5),Array(13).fill(-1),Array(13).fill('1'),Array(13).fill(1.5)]) assert.throws(()=>rates(bad,1));
 for(const n of [-1,13,1.1,'1']) assert.throws(()=>neighbors(n)); const a=neighbors(0); a.length=0; assert.deepEqual(neighbors(0),[4,7]); assert.equal(supplied(owners,1)[0],true);
});

test('sparse owners cannot silently drop nodes from validation',()=>{assert.throws(()=>supplied(new Array(13),1),/owner/i);});
