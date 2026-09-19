import type { ChoiceResult, Decision, Snapshot, evaluateSaved } from '@/domain';

export type JsonObject = Record<string, unknown>;
export type PolicyThresholds = { routingConfidence: number; engineering: number; missingInfo: number; multipleIssues: number; matchProbability: number; matchMargin: number };
export type DecisionView = Partial<Decision> & { id: string; status: string; error?: string | null; createdAt: string; ticketVersion?: number; policy?: PolicyThresholds };
export type DecisionRun = DecisionView & { output?: Decision | null; snapshot?: { input: Snapshot; omissions: { messages: number; attachments: number } }; processingLatencyMs?: number | null };
export type IssueView = { id: string; number: string; title: string; repository: string; state: string; tickets?: TicketView[]; organizationCount?: number; ticketCount?: number; proposedTeam?: string };
export type CommentView = { id: string; text: string; visibility: 'public' | 'internal'; authorType?: string; authorName?: string; createdAt: string };
export type TicketView = { id: string; number: string; subject: string; organization: string; currentTeam: string; status: string; reviewState: string; version: number; source: 'synthetic' | 'zendesk'; createdAt: string; comments?: CommentView[]; decision?: DecisionView | null; match?: IssueView | null; attachments?: number };
export type CandidateView = { issue: IssueView; relevance: number; probability: number | null };
export type ActionView = { id: string; ticketId: string; type: string; destination: string; payload: JsonObject & { title?: string; body?: string }; mode: string; state: string; provider: string; dataSource: string; ticketVersion: number; decisionId: string; payloadHash: string; receipt?: JsonObject | null; error?: string | null; approvals?: JsonObject[]; attempts?: JsonObject[] };
export type SettingsView = { dataMode: string; jevMode: string; allowLiveWrites: boolean; allowLiveDataProcessing: boolean; includeInternalNotes: boolean; threshold: number; policyThresholds: PolicyThresholds; teamCriteria: Record<string,string>; repositories: string[]; teamMappings: Record<string,string|null>; rubricVersion: string; replayState: string; retentionDays: number; connections?: Record<string,string>; csrfToken?: string };
export type MetricsView = ReturnType<typeof evaluateSaved>;
export type EvaluationRun = { id: string; createdAt: string; task: string; split: string; provider: string; dataSource: string; threshold: number; metrics: MetricsView; providerCalls: number; datasetVersion: string; settings?: { policyThresholds?: PolicyThresholds } };
export type AuditView = { id: string; actor: string; action: string; recordId: string; provider: string; outcome: string; details: JsonObject; createdAt: string };
export type ApiData = Partial<SettingsView> & {
  tickets?: TicketView[]; total?: number; page?: number; pageSize?: number; counts?: { unreviewed: number; engineering: number; linked: number; completed: number };
  ticket?: TicketView; decisions?: DecisionRun[]; candidates?: CandidateView[]; links?: { issueId: string; status: string }[]; actions?: ActionView[];
  settings?: SettingsView; issues?: IssueView[]; drafts?: ActionView[]; indexCount?: number;
  runs?: EvaluationRun[]; latest?: EvaluationRun | null; metrics?: MetricsView | null; events?: AuditView[];
  status?: string; database?: string; worker?: { status: string; lastSeenAt: string | null }; sync?: { id: string; provider: string; lastSuccessAt: string | null; error: string | null }[];
  actor?: { id: string; role: string; demo: boolean; csrfToken: string };
};
export type DistributionValue = ChoiceResult | Decision['impact'] | undefined;
