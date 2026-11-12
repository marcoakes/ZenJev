import {describe,it,expect} from 'vitest';
import {type Team,type Decision,type SavedPrediction,type EvaluationLabel,evaluateSaved,incidentSplit} from '../src/domain';
import * as domain from '../src/domain';
import {evaluateBySplit} from '../src/domain/splits';

// The evaluation lab reports one set of numbers over every saved prediction. A support lead tuning the
// routing threshold needs the held-out tickets reported apart from the development tickets: good numbers
// on the tickets you tuned against prove little. A ticket's split is its label's split, else the saved
// prediction's split, else the split of its related incident (label first), else it is unassigned.
const decision=(team:Team,confidence=0.95,extra:Partial<Decision>={}):Decision=>({provider:'mock',dataSource:'synthetic',requestedModel:'mock',reportedModel:null,ticketSnapshotId:'s',rubricVersion:'r1',destination:{value:team,probabilities:{[team]:confidence},confidence},issueType:{value:'bug_report',probabilities:{bug_report:1},confidence:1},impact:{value:1,legend:{},probabilities:{},confidence:1},needsEngineering:0.25,missingReproInfo:0,multipleIssues:0,contextIncomplete:false,providerLatencyMs:null,inputTokens:null,outputTokens:null,matches:[],proposedIssueId:null,reviewReasons:[],...extra});
const predicted=(ticketId:string,d:Decision|null,extra:Partial<SavedPrediction>={}):SavedPrediction=>({ticketId,decision:d,candidateIds:[],baseline:'support',error:null,...extra});
const label=(ticketId:string,destination:Team|null,extra:Partial<EvaluationLabel>={}):EvaluationLabel=>({ticketId,destination,needsEngineering:false,...extra});

// Two incident IDs whose computed splits differ, found rather than assumed.
const incidents=Array.from({length:200},(_,i)=>`incident-${i}`);
const heldIncident=incidents.find(id=>incidentSplit(id)==='held_out')!;
const devIncident=incidents.find(id=>incidentSplit(id)==='development')!;

describe('evaluation by split',()=>{
  const predictions=[
    predicted('t1',decision('billing')),
    predicted('t2',decision('identity'),{split:'development'}),
    predicted('t3',decision('support')),
    predicted('t4',decision('platform'),{split:'held_out'}),
    predicted('t5',decision('billing'),{incidentId:devIncident}),
    predicted('t6',decision('billing')),
    predicted('t7',null,{error:'provider failed',split:'held_out'}),
  ];
  const labels=[
    label('t1','billing',{split:'held_out'}),
    label('t2','support',{split:'held_out'}),
    label('t3','support',{incidentId:heldIncident}),
    label('t4','platform'),
    label('t5','billing'),
    label('t6','integrations'),
  ];
  it('reports each split with the lab\'s own evaluation over just that split\'s predictions',()=>{
    const result=evaluateBySplit(predictions,labels,0.8);
    const held=['t1','t2','t3','t4','t7'], dev=['t5'];
    expect(result.held_out).toEqual(evaluateSaved(predictions.filter(p=>held.includes(p.ticketId)),labels,0.8));
    expect(result.development).toEqual(evaluateSaved(predictions.filter(p=>dev.includes(p.ticketId)),labels,0.8));
    expect(result.held_out.total).toBe(5);
    expect(result.held_out.routingCorrect).toBe(3);
    expect(result.held_out.decisionFailures).toBe(1);
    expect(result.development.total).toBe(1);
    expect(result.development.routingCorrect).toBe(1);
  });
  it('counts tickets with no split anywhere as unassigned, in neither split',()=>{
    const result=evaluateBySplit(predictions,labels,0.8);
    expect(result.unassigned).toEqual(['t6']);
  });
  it('takes the label\'s split over the prediction\'s, and the label\'s incident over the prediction\'s',()=>{
    const result=evaluateBySplit([
      predicted('a',decision('support'),{split:'development'}),
      predicted('b',decision('support'),{incidentId:devIncident}),
    ],[
      label('a','support',{split:'held_out'}),
      label('b','support',{incidentId:heldIncident}),
    ],0.8);
    expect(result.held_out.total).toBe(2);
    expect(result.development.total).toBe(0);
    expect(result.unassigned).toEqual([]);
  });
  it('passes the threshold through and refuses one outside zero to one',()=>{
    const result=evaluateBySplit(predictions,labels,0.96);
    expect(result.held_out.threshold).toBe(0.96);
    expect(result.held_out.eligible).toBe(0);
    expect(evaluateBySplit([],[],0.8)).toEqual({development:evaluateSaved([],[],0.8),held_out:evaluateSaved([],[],0.8),unassigned:[]});
    expect(()=>evaluateBySplit([],[],1.2)).toThrow();
    expect(()=>evaluateBySplit([],[],Number.NaN)).toThrow();
  });
  it('is exported from the domain',()=>{
    expect(domain.evaluateBySplit).toBe(evaluateBySplit);
  });
});
