# Four-Faction Map and Supply Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提供四向对称的13点道路图和按阵营计算的补给连通/收益速率模块，供后续模型、合约对照和UI共享。

**Architecture:** 只读配置与无副作用纯函数分为两个文件；不依赖DOM、钱包、RPC或计时器。调用方持有所有权快照，模块返回独立的连通数组和当前速率。

**Tech Stack:** JavaScript ES modules、Node内置`node:test`和`node:assert/strict`；沿用已有`npm test`脚本，不新增依赖。

## Global Constraints

- 局长300秒，四阵营1..4，13节点0..12，每阵营1至4席，默认2席。
- 每次招募、调遣、修筑、修复均为真实nonpayable交易；军费是阵营共享局内数值。
- 新版本独立入口；当前公开版本10继续保留。
- 此子项目只输出当前每秒速率，不实现钱包、战斗、累计积分、资源上限或名单校验；这些在总路线图B至E中单列。
- 所有命令在项目根目录`outputs/blitzcanvas`执行并带`rtk`前缀。

权威规则：[四阵营规则](../specs/2026-10-17-four-faction-siege-design.md)。依赖关系：[交付路线图](2026-10-17-four-faction-siege-roadmap.md)。

## Task 1: 四方道路、补给和即时速率

**Files:**
- Create: `src/siege/config.mjs`
- Create: `src/siege/supply.mjs`
- Test: `test/siege-supply.test.mjs`

**Interfaces:**
- Consumes: `owners`恰为13个整数，取值0..4；`team`为1..4整数。
- Produces: `FACTIONS`、`HOME_BY_TEAM`、`NODES`、`EDGES`、`ROUND_SECONDS`只读常量。
- Produces: `neighbors(node): number[]`，返回副本。
- Produces: `supplied(owners, team): boolean[]`，仅经由本方所有节点从本方基地遍历；基地不属于本方时返回全false。
- Produces: `rates(owners, team): {income:number, score:number, connected:boolean[]}`。基地固定军费+1，连通矿场每个+1，连通通信塔每个+1分。累计时间在下一子项目处理。

- [ ] **Step 1: 建立行为测试**

创建`test/siege-supply.test.mjs`，完整内容：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';

const configURL = new URL('../src/siege/config.mjs', import.meta.url);
const supplyURL = new URL('../src/siege/supply.mjs', import.meta.url);
const present = existsSync(configURL) && existsSync(supplyURL);
const config = present ? await import(configURL.href) : null;
const supply = present ? await import(supplyURL.href) : null;
const baseOwners = () => [1,3,2,4,0,0,0,0,0,0,0,0,0];

test('four-faction map and supply exports exist', () => {
  assert.ok(present, 'four-faction map and supply modules are missing');
  for (const name of ['neighbors','supplied','rates']) assert.equal(typeof supply[name], 'function');
});

test('map has four symmetric bases and twenty undirected roads', {skip:!present}, () => {
  const {NODES, EDGES, HOME_BY_TEAM, FACTIONS, ROUND_SECONDS} = config;
  assert.equal(ROUND_SECONDS, 300);
  assert.deepEqual(FACTIONS.map(f => f.id), [1,2,3,4]);
  assert.deepEqual(HOME_BY_TEAM, {1:0,2:2,3:1,4:3});
  assert.equal(NODES.length, 13);
  assert.deepEqual(['base','mine','tower','factory'].map(k => NODES.filter(n => n.kind===k).length), [4,4,4,1]);
  assert.equal(EDGES.length, 20);
  const edgeKey = (a,b) => [a,b].sort((x,y)=>x-y).join('-');
  const set = new Set(EDGES.map(([a,b])=>edgeKey(a,b)));
  assert.equal(set.size, 20);
  const rotate = n => n===12 ? 12 : Math.floor(n/4)*4+(n%4+1)%4;
  for (const [a,b] of EDGES) assert.ok(set.has(edgeKey(rotate(a),rotate(b))));
  for (const home of Object.values(HOME_BY_TEAM)) {
    assert.equal(supply.neighbors(home).length, 2);
    const distance = Array(13).fill(-1), queue = [home]; distance[home]=0;
    for (let i=0;i<queue.length;i++) for (const n of supply.neighbors(queue[i])) {
      if (distance[n]===-1) {distance[n]=distance[queue[i]]+1; queue.push(n);}
    }
    assert.equal(distance[12], 3);
    assert.ok(distance.every(d=>d>=0));
  }
});

test('one lost route leaves supply; both lost routes cut income and score', {skip:!present}, () => {
  const owners=baseOwners(); owners[4]=owners[7]=owners[8]=1;
  assert.equal(supply.rates(owners,1).income,3);
  assert.equal(supply.rates(owners,1).score,1);
  owners[4]=2;
  assert.equal(supply.supplied(owners,1)[8],true);
  assert.equal(supply.rates(owners,1).income,2);
  owners[7]=2;
  assert.equal(supply.supplied(owners,1)[8],false);
  assert.equal(supply.rates(owners,1).income,1);
  assert.equal(supply.rates(owners,1).score,0);
  owners[4]=1;
  assert.equal(supply.rates(owners,1).score,1);
});

test('owned center can supply a distant tower but enemy nodes cannot be borrowed', {skip:!present}, () => {
  const owners=baseOwners(); for (const n of [4,8,12,10]) owners[n]=1;
  assert.equal(supply.supplied(owners,1)[10],true);
  owners[8]=3;
  assert.equal(supply.supplied(owners,1)[12],false);
  assert.equal(supply.supplied(owners,1)[10],false);
});

test('all four teams get equivalent connected mine and tower yields', {skip:!present}, () => {
  for (const [team,home,mine,tower] of [[1,0,4,8],[3,1,5,9],[2,2,6,10],[4,3,7,11]]) {
    const owners=baseOwners(); owners[mine]=owners[tower]=team;
    const rate=supply.rates(owners,team);
    assert.equal(rate.income,2); assert.equal(rate.score,1);
    assert.equal(rate.connected[home],true);
  }
});

test('invalid snapshots fail and returned data cannot mutate future results', {skip:!present}, () => {
  assert.throws(()=>supply.supplied(Array(9).fill(0),1),/owners/);
  assert.throws(()=>supply.supplied(Array(13).fill(5),1),/owners/);
  const sparse=Array(13); sparse[0]=1;
  assert.throws(()=>supply.supplied(sparse,1),/owners/);
  assert.throws(()=>supply.supplied(baseOwners(),0),/team/);
  assert.throws(()=>supply.neighbors(13),/node/);
  assert.throws(()=>supply.neighbors(0.5),/node/);
  const owners=baseOwners(), before=[...owners];
  const adjacent=supply.neighbors(0); adjacent.push(12);
  assert.deepEqual(supply.neighbors(0),[4,7]);
  const connected=supply.supplied(owners,1); connected[12]=true;
  assert.equal(supply.supplied(owners,1)[12],false);
  assert.deepEqual(owners,before);
  owners[0]=0;
  assert.ok(supply.supplied(owners,1).every(v=>v===false));
  assert.equal(Object.isFrozen(config.EDGES[0]),true);
});
```

- [ ] **Step 2: 验证RED**

Run: `rtk proxy node --test test/siege-supply.test.mjs`

Expected: 第一项FAIL，消息`four-faction map and supply modules are missing`；其余5项SKIP。若出现语法或路径错误，先修正测试再继续。

- [ ] **Step 3: 写入只读配置**

创建`src/siege/config.mjs`，完整内容：

```js
export const ROUND_SECONDS=300;
export const FACTIONS=Object.freeze([
  {id:1,name:'翡翠联盟',color:'#70dc96',shape:'square'},
  {id:2,name:'赤焰军团',color:'#ff715e',shape:'triangle'},
  {id:3,name:'苍蓝联邦',color:'#68b5ff',shape:'diamond'},
  {id:4,name:'紫曜议会',color:'#c58cff',shape:'circle'},
].map(Object.freeze));
export const HOME_BY_TEAM=Object.freeze({1:0,2:2,3:1,4:3});
export const NODES=Object.freeze(Array.from({length:13},(_,id)=>Object.freeze({
  id,
  kind:id<4?'base':id<8?'mine':id<12?'tower':'factory',
  baseTeam:[1,3,2,4][id]??0,
})));
export const EDGES=Object.freeze([
  [0,4],[0,7],[1,4],[1,5],[2,5],[2,6],[3,6],[3,7],
  [4,8],[4,9],[5,9],[5,10],[6,10],[6,11],[7,11],[7,8],
  [8,12],[9,12],[10,12],[11,12],
].map(Object.freeze));
```

- [ ] **Step 4: 写入纯补给函数**

创建`src/siege/supply.mjs`，完整内容：

```js
import {EDGES, HOME_BY_TEAM, NODES} from './config.mjs';

function validNode(node) {
  if (!Number.isInteger(node)||node<0||node>=NODES.length) throw new RangeError('invalid node');
}
function validate(owners,team) {
  if (!Number.isInteger(team)||team<1||team>4) throw new RangeError('invalid team');
  if (!Array.isArray(owners)||owners.length!==NODES.length) throw new RangeError('invalid owners');
  for (let i=0;i<owners.length;i++) {
    if (!Number.isInteger(owners[i])||owners[i]<0||owners[i]>4) throw new RangeError('invalid owners');
  }
}
const adjacency=NODES.map(()=>[]);
for (const [a,b] of EDGES) {adjacency[a].push(b); adjacency[b].push(a);}
for (const row of adjacency) Object.freeze(row.sort((a,b)=>a-b));
Object.freeze(adjacency);

export function neighbors(node) {
  validNode(node);
  return [...adjacency[node]];
}
export function supplied(owners,team) {
  validate(owners,team);
  const connected=Array(NODES.length).fill(false), home=HOME_BY_TEAM[team];
  if (owners[home]!==team) return connected;
  const queue=[home]; connected[home]=true;
  for (let i=0;i<queue.length;i++) for (const next of adjacency[queue[i]]) {
    if (!connected[next]&&owners[next]===team) {connected[next]=true; queue.push(next);}
  }
  return connected;
}
export function rates(owners,team) {
  const connected=supplied(owners,team);
  let income=1, score=0;
  for (const node of NODES) if (connected[node.id]) {
    if (node.kind==='mine') income++;
    else if (node.kind==='tower') score++;
  }
  return {income,score,connected};
}
```

- [ ] **Step 5: 验证GREEN与旧版回归**

Run: `rtk proxy node --test test/siege-supply.test.mjs`

Expected: 6项PASS，0项SKIP、0项FAIL。

Run: `rtk proxy npm test`

Expected: 旧版62项加新增6项，共68项PASS、0项FAIL；若原测试集之后增加，应以实际测试总数报告，不能为了达到68删除测试。

- [ ] **Step 6: 提交独立模块**

Run: `rtk proxy git diff --check`

Expected: 无输出，退出0。

Run: `rtk proxy git add src/siege/config.mjs src/siege/supply.mjs test/siege-supply.test.mjs`

Run: `rtk proxy git commit -m "feat: add symmetric four-faction map and supply rules"`

只提交上述三个文件。不构建或发布新网页，不改旧合约和部署配置。完成后记录实际测试命令、结果与提交哈希，再进入路线图B。

## 计划自检

本子项目覆盖完整设计第2节的阵营标识、第3节地图、第4节的即时补给速率；不声称实现固定名单、时间积分或真实交易。全部函数接口在本文件定义，消费方签名与路线图A一致。测试覆盖替代路线、四方对称、孤岛、无效输入与输入/返回值隔离。
