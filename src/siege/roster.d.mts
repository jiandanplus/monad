export type Lobby = {host: string; rosterVersion: number; seatsPerFaction: number; players: string[]; teams: number[]; readyFlags: boolean[]; roundId: number};
export function createLobby(host: string, seats?: number): Lobby;
export function configureRoster(lobby: Lobby, args: {actor: string; expectedVersion: number; players: readonly string[]; teams: readonly number[]; seatsPerFaction: number; active: boolean}): Lobby;
export function markReady(lobby: Lobby, args: {actor: string; expectedVersion: number}): Lobby;
export function consumeReady(lobby: Lobby, args: {actor: string; expectedRoundId: number; expectedVersion: number; active: boolean}): Lobby;
