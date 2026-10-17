const clone = value => structuredClone(value);
const integer = (value,min,max,label) => {if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Invalid ${label}`);};
function address(value) { if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value) || /^0x0{40}$/.test(value)) throw new Error('Invalid nonzero address'); return value.toLowerCase(); }
function hostOnly(lobby,actor) { if (address(actor) !== lobby.host) throw new Error('Only host'); }
function version(lobby,expectedVersion) { integer(expectedVersion,0,Number.MAX_SAFE_INTEGER,'roster version'); if (expectedVersion !== lobby.rosterVersion) throw new Error('Stale roster version'); }
function inactive(active) { if (typeof active !== 'boolean') throw new Error('Invalid active flag'); if (active) throw new Error('Round active'); }
export function createLobby(host,seats = 2) {
  integer(seats,1,4,'seats'); return {host:address(host),rosterVersion:0,seatsPerFaction:seats,players:[],teams:[],readyFlags:[],roundId:0};
}
export function configureRoster(lobby,{actor,expectedVersion,players,teams,seatsPerFaction,active}) {
  hostOnly(lobby,actor); version(lobby,expectedVersion); inactive(active); integer(seatsPerFaction,1,4,'seats');
  if (!Array.isArray(players) || !Array.isArray(teams) || players.length !== 4*seatsPerFaction || teams.length !== players.length) throw new Error('Invalid roster length');
  const normalized = Array.from(players,address);
  if (new Set(normalized).size !== normalized.length) throw new Error('Duplicate roster address');
  const counts=[0,0,0,0]; for (const team of teams) {integer(team,1,4,'team');counts[team-1]++;}
  if (counts.some(count => count !== seatsPerFaction)) throw new Error('Unbalanced roster');
  if(lobby.rosterVersion===Number.MAX_SAFE_INTEGER)throw new Error('Roster version overflow');
  const next=clone(lobby);next.rosterVersion++;next.seatsPerFaction=seatsPerFaction;next.players=normalized;next.teams=[...teams];next.readyFlags=normalized.map(()=>false);return next;
}
export function markReady(lobby,{actor,expectedVersion}) {
  version(lobby,expectedVersion); const index=lobby.players.indexOf(address(actor));if(index<0)throw new Error('Actor not in roster');
  const next=clone(lobby);next.readyFlags[index]=true;return next;
}
export function consumeReady(lobby,{actor,expectedRoundId,expectedVersion,active}) {
  hostOnly(lobby,actor);version(lobby,expectedVersion);inactive(active);integer(expectedRoundId,0,Number.MAX_SAFE_INTEGER,'round id');
  if(expectedRoundId!==lobby.roundId)throw new Error('Stale round id');
  if(lobby.players.length!==4*lobby.seatsPerFaction || lobby.readyFlags.length!==lobby.players.length || !lobby.readyFlags.every(Boolean))throw new Error('Every player must be ready');
  if(lobby.roundId===Number.MAX_SAFE_INTEGER)throw new Error('Round id overflow');
  const next=clone(lobby);next.roundId++;next.readyFlags=next.readyFlags.map(()=>false);return next;
}
