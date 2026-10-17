// Shared deterministic four-faction rules. Production state comes from the contract.
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
export const ROUND_SECONDS = 300;
export const HOME_BY_TEAM = freeze({1:0,2:2,3:1,4:3});
export const FACTIONS = freeze([
  { id: 1, name: '翡翠联盟', color: '#3fbd83', shape: 'square', base: 0 },
  { id: 2, name: '赤焰军团', color: '#e85c55', shape: 'triangle', base: 2 },
  { id: 3, name: '苍蓝联邦', color: '#5599e8', shape: 'diamond', base: 1 },
  { id: 4, name: '紫曜议会', color: '#ac70dd', shape: 'circle', base: 3 },
]);
export const NODES = freeze(Array.from({length: 13}, (_, id) => ({
  id, kind: id < 4 ? 'base' : id < 8 ? 'mine' : id < 12 ? 'tower' : 'factory',
  city: id >= 8 && id <= 11, baseTeam: [1,3,2,4][id] ?? 0,
})));
export const EDGES = freeze([[0,4],[0,7],[1,4],[1,5],[2,5],[2,6],[3,6],[3,7],[4,8],[4,9],[5,9],[5,10],[6,10],[6,11],[7,11],[7,8],[8,12],[9,12],[10,12],[11,12]]);
export const UNIT_STATS = freeze([
  {kind: 0, name: '步兵', cost: 20, hp: 10, damage: [4,7,5], priority: [1,0,2]},
  {kind: 1, name: '坦克', cost: 50, hp: 30, damage: [12,10,12], priority: [0,1,2]},
  {kind: 2, name: '工程师', cost: 35, hp: 8, damage: [0,0,0], priority: []},
]);
