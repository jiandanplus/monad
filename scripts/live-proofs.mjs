// Pick one confirmed-event candidate per faction; additional same-side players must not hide an opponent.
export function chooseFactionProofs(logs) {
  const teams=new Set(),actors=new Set(),chosen=[];
  for(const log of logs) {
    const team=Number(log.args.team),actor=log.args.actor.toLowerCase();
    if(![1,2].includes(team)||teams.has(team)||actors.has(actor))continue;
    chosen.push(log);teams.add(team);actors.add(actor);
    if(teams.size===2)break;
  }
  return chosen;
}
