import type {Lobby,Snapshot} from './types.ts';
export function parseLobby(raw:readonly any[]):Lobby;
export function parseSnapshot(raw:any,block:{blockNumber:bigint,timestamp:bigint}):Snapshot;
