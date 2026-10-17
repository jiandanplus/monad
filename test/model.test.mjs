import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../src/model.mjs';
const start=1000;
test('exact map rates and three unit rules',()=>{
 assert.equal(m.DISTRICTS.length,9);assert.equal(new Set(m.DISTRICTS.map(x=>x.name)).size,9);assert.ok(m.DISTRICTS.every(x=>x.tag&&x.type));
 assert.deepEqual(m.DISTRICTS.map(x=>x.rate),[1,1,2,1,3,1,2,1,1]);
 assert.deepEqual(m.UNITS.map(x=>[x.cost,x.power,x.cooldown,x.role]),[[20,18,2,'infantry'],[50,50,5,'tank'],[35,35,3,'engineer']]);
 assert.equal(m.ABILITIES,m.UNITS);assert.equal(m.TEAMS.length,3);
});
test('deployment parameters strictly validate even empty contract',()=>{
 const address='0x'+'12'.repeat(20);assert.equal(m.parseDeploymentParams(new URLSearchParams()),null);
 assert.deepEqual(m.parseDeploymentParams(new URLSearchParams({contract:address,start:'10'})),{address,blockNumber:10n});
 for(const contract of ['', 'x','0x'+'00'.repeat(20)])assert.throws(()=>m.parseDeploymentParams(new URLSearchParams({contract})));
 for(const block of ['','-1','1e6','1.2'])assert.throws(()=>m.parseDeploymentParams(new URLSearchParams({contract:address,start:block})));
 assert.equal(m.shortAddress(address),'0x1212…1212');
});
test('initial bases, first engineer capture, owner-time scores and personal income',()=>{
 const p=m.createBattlePractice(start);let s=p.snapshot(start);
 assert.deepEqual(s.owners,[1,0,0,0,0,0,0,0,2]);assert.deepEqual(s.defense,[60,20,20,20,20,20,20,20,60]);
 assert.equal(s.points,100);assert.equal(s.income,0);assert.equal(s.viewerTeam,0);
 assert.deepEqual(p.cast(1,1,2,start),{roundId:1n,district:1,team:1,unit:2,beforeOwner:0,afterOwner:1,beforeDefense:20,afterDefense:30,spent:35,pointsAfter:85});
 s=p.snapshot(start+10);assert.equal(s.points,100-35+20+30+20);assert.equal(s.income,5);assert.deepEqual(s.scores,[20,10]);assert.equal(s.nextActionAt,start+3);
 assert.deepEqual(m.totals(s),{scores:[20,10],actions:1,players:1,owned:[2,1]});
});
test('late joining never accrues personal income before first successful action',()=>{
 const p=m.createBattlePractice(start);assert.equal(p.snapshot(start+90).points,100);assert.equal(p.cast(1,1,2,start+90).pointsAfter,85);
 assert.deepEqual(p.snapshot(start+100).scores,[110,100]);assert.equal(p.snapshot(start+100).points,135);
});
test('Manhattan adjacency, friendly reinforcement and wiped comeback reachability',()=>{
 assert.equal(m.adjacent(0,1),true);assert.equal(m.adjacent(0,3),true);
 for(const [a,b] of [[0,4],[2,3],[0,0],[-1,0],[8,9]])assert.equal(m.adjacent(a,b),false);
 const owners=[1,0,0,0,0,0,0,0,2];assert.equal(m.canReach(owners,1,1),true);assert.equal(m.canReach(owners,1,8),false);
 owners[8]=1;assert.equal(m.canReach(owners,1,8),true);assert.equal(m.canReach(Array(9).fill(2),1,4),true);
});
test('infantry chip, tank breakthrough and reinforcement cap are exact',()=>{
 const p=m.createBattlePractice(start);let e=p.cast(1,1,0,start);assert.equal(e.afterOwner,0);assert.equal(e.afterDefense,2);assert.equal(e.pointsAfter,80);
 e=p.cast(1,1,0,start+2);assert.equal(e.afterOwner,1);assert.equal(e.afterDefense,16);assert.equal(e.pointsAfter,88);
 e=p.cast(2,1,1,start+4);assert.equal(e.afterOwner,1);assert.equal(e.afterDefense,30);assert.equal(e.pointsAfter,68);
 p.cast(2,1,1,start+9);e=p.cast(2,1,2,start+14);assert.equal(e.afterDefense,100);
 const before=p.snapshot(start+17);assert.throws(()=>p.cast(2,1,0,start+17),/No effect/);assert.deepEqual(p.snapshot(start+17),before);
});
test('invalid, locked, cooldown, unreachable and enemy engineer actions are atomic',()=>{
 const p=m.createBattlePractice(start),initial=p.snapshot(start);
 for(const args of [[-1,1,0],[9,1,0],[0,0,0],[0,3,0],[0,1,3],[0.5,1,0],[NaN,1,0],[8,1,1]])assert.throws(()=>p.cast(...args,start));
 assert.deepEqual(p.snapshot(start),initial);p.cast(1,1,2,start);let before=p.snapshot(start+2);
 assert.throws(()=>p.cast(4,1,0,start+2),/Cooldown active/);assert.deepEqual(p.snapshot(start+2),before);
 before=p.snapshot(start+3);assert.throws(()=>p.cast(4,2,0,start+3),/Team locked/);assert.deepEqual(p.snapshot(start+3),before);
 p.cast(4,1,2,start+3);p.cast(5,1,2,start+6);before=p.snapshot(start+9);
 assert.throws(()=>p.cast(8,1,2,start+9),/Engineer cannot attack enemy/);assert.deepEqual(p.snapshot(start+9),before);
});
test('point cap discards overflow at spend and insufficient balance is atomic',()=>{
 const p=m.createBattlePractice(start);p.cast(0,1,1,start);assert.equal(p.snapshot(start+100).points,200);
 assert.equal(p.cast(1,1,1,start+100).pointsAfter,170);assert.equal(p.snapshot(start+101).points,175);
 const q=m.createBattlePractice(start);q.cast(0,1,2,start);q.cast(1,1,1,start+3);assert.equal(q.snapshot(start+8).points,72);
 q.cast(1,1,1,start+8);const poor=q.snapshot(start+13);assert.equal(poor.points,47);
 assert.throws(()=>q.cast(3,1,1,start+13),/Insufficient points/);assert.deepEqual(q.snapshot(start+13),poor);
});
test('previews are pure and expose exact dispatch outcomes and actionable reasons',()=>{
 const p=m.createBattlePractice(start),s=p.snapshot(start);
 assert.deepEqual(m.previewDispatch(s,1,1,2),{valid:true,reason:'',afterOwner:1,afterDefense:30,cost:35,capture:true});
 assert.equal(m.previewDispatch(s,8,1,1).reason,'Unreachable');assert.equal(m.previewDispatch(s,0,1,2).afterDefense,95);assert.deepEqual(p.snapshot(start),s);
 p.cast(1,1,2,start);assert.equal(m.previewDispatch(p.snapshot(start+1),4,1,0).reason,'Cooldown active');assert.equal(m.previewDispatch(p.snapshot(start+180),4,1,0).reason,'Round ended');
});
test('clock projections, scores and resources freeze at exact 180-second end',()=>{
 const p=m.createBattlePractice(start);p.cast(1,1,2,start);const s=p.snapshot(start+10);
 assert.equal(m.estimatedChainTime(s,(start+12)*1000+900),start+12);assert.equal(m.estimatedChainTime(s,(start+9)*1000),start+10);assert.equal(m.remainingSeconds(s,(start+181)*1000),0);
 assert.deepEqual(m.projectedScores(s,(start+20)*1000),[40,20]);assert.equal(m.projectedPoints(s,(start+20)*1000),185);
 assert.deepEqual(m.projectedScores(s,(start+999)*1000),[360,180]);assert.equal(m.projectedPoints(s,(start+999)*1000),200);
 p.cast(0,1,0,start+179);const ended=p.snapshot(start+180);assert.equal(ended.points,185);assert.equal(ended.income,0);
 assert.equal(p.snapshot(start+500).points,185);assert.deepEqual(p.snapshot(start+500).scores,ended.scores);
 assert.throws(()=>p.cast(1,1,0,start+180),/Round ended/);assert.equal(p.rival(start+180),null);
 assert.equal(m.winner([360,180]),1);assert.equal(m.winner([180,360]),2);assert.equal(m.winner([180,180]),3);
});
test('rival waits for human, owns separate economy and respects each cooldown',()=>{
 for(const team of [1,2]){const p=m.createBattlePractice(start);assert.equal(p.rival(start),null);p.cast(team===1?1:7,team,2,start);let last=null,acted=0;
 for(let now=start;now<start+180;now++){const action=p.rival(now);if(!action)continue;assert.equal(action.team,3-team);assert.ok(action.pointsAfter>=0&&action.pointsAfter<=200);assert.equal(action.spent,m.UNITS[action.unit].cost);
 if(last)assert.ok(now>=last.time+m.UNITS[last.unit].cooldown);assert.ok(action.afterDefense>=0&&action.afterDefense<=100);last={time:now,unit:action.unit};acted++;}
 assert.ok(acted>10);assert.equal(m.totals(p.snapshot(start+180)).players,2);}
});
test('sessions, snapshots and constant records share no mutable rule state',()=>{
 const a=m.createBattlePractice(start),b=m.createBattlePractice(start),s=a.snapshot(start);s.owners[0]=2;s.defense[0]=1;s.scores[0]=99;s.actions[0]=99;s.entrants[0]=99;
 assert.equal(a.snapshot(start).owners[0],1);assert.equal(a.snapshot(start).defense[0],60);a.cast(1,1,2,start);assert.equal(b.snapshot(start).owners[1],0);assert.throws(()=>{m.UNITS[0].cost=0;});
});
