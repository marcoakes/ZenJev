import { evaluateSaved, incidentSplit, type EvaluationLabel, type SavedPrediction } from './index';

export type EvaluationSplit = 'development' | 'held_out';
export type SplitEvaluation = { development: ReturnType<typeof evaluateSaved>; held_out: ReturnType<typeof evaluateSaved>; unassigned: string[] };

/** A ticket's split: its label's split, else the prediction's, else its related incident's (label first), else none. */
export function splitOf(prediction: SavedPrediction, label: EvaluationLabel | undefined): EvaluationSplit | null {
  if (label?.split) return label.split;
  if (prediction.split) return prediction.split;
  const incidentId = label?.incidentId ?? prediction.incidentId;
  return incidentId ? incidentSplit(incidentId) : null;
}

/** The lab's own evaluation, run apart over each split's predictions. Pure, like evaluateSaved; no provider involved. */
export function evaluateBySplit(predictions: SavedPrediction[], labels: EvaluationLabel[], threshold = 0.8): SplitEvaluation {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new Error('Threshold must be between zero and one');
  const byId = new Map(labels.map(l => [l.ticketId, l]));
  const development: SavedPrediction[] = [], held_out: SavedPrediction[] = [], unassigned: string[] = [];
  for (const prediction of predictions) {
    const split = splitOf(prediction, byId.get(prediction.ticketId));
    if (split === 'development') development.push(prediction);
    else if (split === 'held_out') held_out.push(prediction);
    else unassigned.push(prediction.ticketId);
  }
  return { development: evaluateSaved(development, labels, threshold), held_out: evaluateSaved(held_out, labels, threshold), unassigned };
}
