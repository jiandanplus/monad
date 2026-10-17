import type {UnitKind} from './config.mjs';
export type Unit = {kind: UnitKind; hp: number};
export type BattleTrace = {attackers: Unit[]; defenders: Unit[]};
export function resolveBattle(options: {attackers: readonly Unit[]; defenders: readonly Unit[]; city?: boolean; fortified?: boolean}): {
  attackers: Unit[]; defenders: Unit[]; captured: boolean; pulses: number; trace: BattleTrace[];
};
