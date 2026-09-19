/** Evaluator-only ground truth. Never import this module from providers or retrieval. */
export function makeEvaluationLabels() {
  const destinations=['integrations','integrations','integrations','billing','unknown','platform','unknown','integrations','integrations','platform','identity','unknown'];
  return Array.from({length:100},(_,i)=>i+1).flatMap(n=>['initial_routing','engineering_escalation'].map(task=>{
    const scenario=(n-1)%12;
    const created=Date.UTC(2026,8,17,9,0)+n*60_000;
    // Related reports share the same incident and split, including all three webhook phrasings.
    const incidentGroup=scenario<3?'shared-webhook':`incident-${scenario}`;
    return {id:`label-${n}-${task}`,ticketId:`ticket-${String(n).padStart(3,'0')}`,task,split:scenario===4||scenario===9||scenario===10?'held_out':'development',incidentGroup,asOf:new Date(created+(task==='initial_routing'?0:60_000)),destination:destinations[scenario],engineering:[0,1,2,5,7,8,9,11].includes(scenario),critical:scenario===9,issueId:[0,1,2,7,8].includes(scenario)?'issue-001':scenario===9?'issue-006':null,datasetVersion:'synthetic-v1'};
  }));
}
