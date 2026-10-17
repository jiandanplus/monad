import {UNIT_STATS} from './config.mjs';

const copy = units => units.map(({kind,hp}) => ({kind,hp}));
function validateUnits(units, min, max) {
  if (!Array.isArray(units) || units.length < min || units.length > max || Array.from(units).some(u => !u || !Number.isInteger(u.kind) || u.kind < 0 || u.kind > 2 || !Number.isInteger(u.hp) || u.hp < 1 || u.hp > UNIT_STATS[u.kind].hp)) throw new Error('Invalid units');
}
function damage(units, targets, cityDefenders) {
  const hits = [0,0,0];
  for (const unit of units) {
    const target = UNIT_STATS[unit.kind].priority.find(kind => targets.some(u => u.kind === kind));
    if (target !== undefined) hits[target] += UNIT_STATS[unit.kind].damage[target] * (cityDefenders && unit.kind === 0 && target === 1 ? 2 : 1);
  }
  return hits;
}
function applyDamage(units, hits) {
  for (let kind = 0; kind < 3; kind++) {
    let remaining = hits[kind];
    const order = units.map((unit,index) => ({unit,index})).filter(({unit}) => unit.kind === kind).sort((a,b) => a.unit.hp - b.unit.hp || a.index - b.index);
    for (const {unit} of order) { const loss = Math.min(remaining,unit.hp); unit.hp -= loss; remaining -= loss; }
  }
  return units.filter(unit => unit.hp > 0);
}
/** Pure preview/reference only. Trace contains ordered living units after each simultaneous pulse. */
export function resolveBattle({attackers, defenders, city = false, fortified = false}) {
  validateUnits(attackers,1,6); validateUnits(defenders,0,12);
  if (typeof city !== 'boolean' || typeof fortified !== 'boolean') throw new Error('Invalid battle options');
  if (defenders.length && !attackers.some(u => u.kind !== 2)) throw new Error('Engineers cannot attack a garrison without combat units');
  let a = copy(attackers), d = copy(defenders); const pulses = [];
  for (let round = 0; round < 3 && a.length && d.length; round++) {
    const toDefenders = damage(a,d,false), toAttackers = damage(d,a,city);
    if (city) toDefenders[0] = Math.floor(toDefenders[0] * 75 / 100);
    if (fortified) for (let kind=0; kind<3; kind++) toDefenders[kind] = Math.floor(toDefenders[kind] * 80 / 100);
    a = applyDamage(a,toAttackers); d = applyDamage(d,toDefenders);
    pulses.push({attackers:copy(a), defenders:copy(d)});
  }
  return {attackers:a,defenders:d,captured:d.length === 0 && a.some(u => u.kind === 0 || u.kind === 2),pulses:pulses.length,trace:pulses};
}
