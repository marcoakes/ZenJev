import { evaluateSaved, incidentSplit, type EvaluationLabel, type SavedPrediction } from './index';

export type EvaluationSplit = 'development' | 'held_out';
export type SplitEvaluation = Record<EvaluationSplit, ReturnType<typeof evaluateSaved>> & { unassigned: string[] };

const known = (value: unknown): value is EvaluationSplit => value === 'development' || value === 'held_out';

/** A ticket's split: its label's, else the saved prediction's, else its related incident's (label first), else none. */
export function splitOf(prediction: SavedPrediction, label?: EvaluationLabel): EvaluationSplit | null {
  if (known(label?.split)) return label.split;
  if (known(prediction.split)) return prediction.split;
  const incidentId = label?.incidentId || prediction.incidentId;
  return incidentId ? incidentSplit(incidentId) : null;
}

/** Pure: the lab's own evaluation over each split's saved predictions, plus the tickets belonging to neither. */
export function evaluateBySplit(predictions: SavedPrediction[], labels: EvaluationLabel[], threshold = 0.8): SplitEvaluation {
  const byId = new Map(labels.map(l => [l.ticketId, l]));
  const groups: Record<EvaluationSplit, SavedPrediction[]> = { development: [], held_out: [] };
  const unassigned: string[] = [];
  for (const prediction of predictions) {
    const split = splitOf(prediction, byId.get(prediction.ticketId));
    if (split) groups[split].push(prediction); else unassigned.push(prediction.ticketId);
  }
  return { development: evaluateSaved(groups.development, labels, threshold), held_out: evaluateSaved(groups.held_out, labels, threshold), unassigned };
}
