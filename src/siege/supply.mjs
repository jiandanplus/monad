import {EDGES, HOME_BY_TEAM, NODES} from './config.mjs';

function validTeam(team) { if (!Number.isInteger(team) || team < 1 || team > 4) throw new Error('Invalid team'); }
function validOwners(owners) {
  if (!Array.isArray(owners) || owners.length !== 13 || Array.from(owners).some(owner => !Number.isInteger(owner) || owner < 0 || owner > 4)) throw new Error('Invalid owners');
}
export function neighbors(node) {
  if (!Number.isInteger(node) || node < 0 || node >= 13) throw new Error('Invalid node');
  return EDGES.flatMap(([a,b]) => a === node ? [b] : b === node ? [a] : []);
}
export function supplied(owners, team) {
  validTeam(team); validOwners(owners);
  const reached = Array(13).fill(false), home = HOME_BY_TEAM[team];
  if (owners[home] !== team) return reached;
  const queue = [home]; reached[home] = true;
  for (const node of queue) for (const next of neighbors(node)) if (!reached[next] && owners[next] === team) { reached[next] = true; queue.push(next); }
  return reached;
}
export function rates(owners, team) {
  const reachable = supplied(owners, team);
  return { income: 1 + NODES.filter(node => node.kind === 'mine' && reachable[node.id]).length,
    score: NODES.filter(node => node.kind === 'tower' && reachable[node.id]).length, connected: reachable };
}
