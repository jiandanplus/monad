import type {Unit} from './combat.mjs';
export type RoundNode = {owner: number; version: number; cooldownUntil: number; fortified: boolean; units: Unit[]};
export type RoundState = {
  roundId: number; startsAt: number; endsAt: number; rosterVersion: number; seatsPerFaction: number;
  players: string[]; teams: number[]; nodes: RoundNode[]; checkpoints: {at: number; funds: number; score: number}[];
};
export type RoundSnapshot = Omit<RoundState, 'checkpoints' | 'nodes'> & {
  blockTimestamp: number; nodes: (RoundNode & {supplied: boolean})[]; funds: number[]; scores: number[]; incomeRates: number[]; scoreRates: number[];
};
type BaseOrder = {actor: string; expectedRoundId: number};
type NodeOrder = BaseOrder & {node: number; nodeVersion: number};
export type Order = (NodeOrder & {type: 'recruit'; kind: number; count: number})
  | (NodeOrder & {type: 'fortify'}) | (NodeOrder & {type: 'repair'; unitIndexes: number[]})
  | (BaseOrder & {type: 'dispatch'; from: number; to: number; fromVersion: number; toVersion: number; unitIndexes: number[]});
export function createRound(args: {roundId: number; rosterVersion: number; seatsPerFaction: number; players: readonly string[]; teams: readonly number[]; now: number}): RoundState;
export function snapshot(state: RoundState, now: number): RoundSnapshot;
export function applyOrder(state: RoundState, order: Order, now: number): RoundState;
