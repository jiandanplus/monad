import test from 'node:test';
import assert from 'node:assert/strict';
import {createLobby, configureRoster, markReady, consumeReady} from '../src/siege/roster.mjs';
const addr=n=>'0x'+n.toString(16).padStart(40,'0'); const host=addr(100);
const roster=seats=>({players:Array.from({length:seats*4},(_,i)=>addr(i+1)),teams:Array.from({length:seats*4},(_,i)=>Math.floor(i/seats)+1),seatsPerFaction:seats});
const configured=(seats=2)=>configureRoster(createLobby(host),{actor:host,expectedVersion:0,...roster(seats),active:false});
test('lobby defaults and balanced four-faction rosters support exactly 4,8,12,16 seats',()=>{
 assert.deepEqual(createLobby(host),{host,rosterVersion:0,seatsPerFaction:2,players:[],teams:[],readyFlags:[],roundId:0});
 for(const seats of [1,2,3,4]) {const l=configured(seats);assert.equal(l.rosterVersion,1);assert.equal(l.players.length,seats*4);assert.deepEqual(l.readyFlags,Array(seats*4).fill(false));}
});
test('roster rejects duplicate, zero, malformed addresses, invalid teams and unbalanced seats atomically',()=>{
 const l=createLobby(host),before=structuredClone(l),r=roster(1);
 for(const change of [{players:[r.players[0],r.players[0],...r.players.slice(2)]},{players:[addr(0),...r.players.slice(1)]},{players:['bad',...r.players.slice(1)]},{teams:[1,1,3,4]},{teams:[1,2,3,5]},{teams:[1,2,3,'4']},{seatsPerFaction:0},{seatsPerFaction:5},{players:r.players.slice(1)}]) assert.throws(()=>configureRoster(l,{actor:host,expectedVersion:0,...r,...change,active:false}));
 const mixed='0x'+('ab'.repeat(20));assert.throws(()=>configureRoster(l,{actor:host,expectedVersion:0,...r,players:[mixed,mixed.toUpperCase().replace('0X','0x'),...r.players.slice(2)],active:false}));assert.deepEqual(l,before);
 for(const value of [0,5,1.5])assert.throws(()=>createLobby(host,value));assert.throws(()=>createLobby(addr(0)));
});
test('host-only changes, active-round guards and versioned ready prevent stale participation',()=>{
 const l=configured(1),before=structuredClone(l);assert.throws(()=>configureRoster(l,{actor:addr(1),expectedVersion:1,...roster(1),active:false}),/host/i);assert.throws(()=>configureRoster(l,{actor:host,expectedVersion:1,...roster(1),active:true}),/active/i);
 assert.throws(()=>markReady(l,{actor:addr(1),expectedVersion:0}),/version/i);assert.throws(()=>markReady(l,{actor:addr(999),expectedVersion:1}),/player|roster/i);
 const ready=markReady(l,{actor:addr(1),expectedVersion:1});assert.equal(ready.readyFlags[0],true);assert.deepEqual(l,before);
 const replaced=configureRoster(ready,{actor:host,expectedVersion:1,...roster(1),active:false});assert.equal(replaced.rosterVersion,2);assert.deepEqual(replaced.readyFlags,[false,false,false,false]);assert.throws(()=>markReady(replaced,{actor:addr(1),expectedVersion:1}),/version/i);
});
test('only host consumes complete ready for matching round and version; every ready resets for next round',()=>{
 let l=configured(1);assert.throws(()=>consumeReady(l,{actor:host,expectedRoundId:0,expectedVersion:1,active:false}),/ready/i);
 for(const actor of l.players)l=markReady(l,{actor,expectedVersion:1});const before=structuredClone(l);
 for(const params of [{actor:addr(1)},{expectedRoundId:1},{expectedVersion:0},{active:true}])assert.throws(()=>consumeReady(l,{actor:host,expectedRoundId:0,expectedVersion:1,active:false,...params}));
 const next=consumeReady(l,{actor:host,expectedRoundId:0,expectedVersion:1,active:false});assert.equal(next.roundId,1);assert.deepEqual(next.readyFlags,[false,false,false,false]);assert.deepEqual(l,before);assert.throws(()=>consumeReady(next,{actor:host,expectedRoundId:1,expectedVersion:1,active:false}),/ready/i);
});

test('sparse player lists and overflowing roster or round versions are rejected',()=>{const players=new Array(4);players[1]=addr(2);players[2]=addr(3);players[3]=addr(4);assert.throws(()=>configureRoster(createLobby(host),{actor:host,expectedVersion:0,players,teams:[1,2,3,4],seatsPerFaction:1,active:false}),/address/i);const l=configured(1);l.rosterVersion=Number.MAX_SAFE_INTEGER;assert.throws(()=>configureRoster(l,{actor:host,expectedVersion:l.rosterVersion,...roster(1),active:false}),/overflow/i);l.rosterVersion=1;l.roundId=Number.MAX_SAFE_INTEGER;l.readyFlags.fill(true);assert.throws(()=>consumeReady(l,{actor:host,expectedRoundId:l.roundId,expectedVersion:1,active:false}),/overflow/i);});
