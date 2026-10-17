export type Team = 1 | 2 | 3 | 4;
export type UnitKind = 0 | 1 | 2;
export const ROUND_SECONDS: 300;
export const HOME_BY_TEAM: Readonly<Record<Team, number>>;
export const FACTIONS: readonly Readonly<{id: Team; name: string; color: string; shape: string; base: number}>[];
export const NODES: readonly Readonly<{id: number; kind: 'base' | 'mine' | 'tower' | 'factory'; city: boolean; baseTeam: number}>[];
export const EDGES: readonly (readonly [number, number])[];
export const UNIT_STATS: readonly Readonly<{kind: UnitKind; name: string; cost: number; hp: number; damage: readonly number[]; priority: readonly UnitKind[]}>[];
