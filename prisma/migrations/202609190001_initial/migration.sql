-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "WorkspaceSettings" (
    "id" TEXT NOT NULL DEFAULT 'workspace',
    "dataMode" TEXT NOT NULL DEFAULT 'demo',
    "jevMode" TEXT NOT NULL DEFAULT 'mock',
    "allowLiveWrites" BOOLEAN NOT NULL DEFAULT false,
    "allowLiveDataProcessing" BOOLEAN NOT NULL DEFAULT false,
    "includeInternalNotes" BOOLEAN NOT NULL DEFAULT false,
    "threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "repositories" JSONB NOT NULL,
    "teamMappings" JSONB NOT NULL,
    "rubricVersion" TEXT NOT NULL DEFAULT 'triage-v1',
    "replayState" TEXT NOT NULL DEFAULT 'paused',
    "replayCursor" INTEGER NOT NULL DEFAULT 0,
    "retentionDays" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'synthetic',
    "account" TEXT NOT NULL DEFAULT 'demo',
    "sourceId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "currentTeam" TEXT NOT NULL DEFAULT 'support',
    "status" TEXT NOT NULL DEFAULT 'open',
    "reviewState" TEXT NOT NULL DEFAULT 'pending',
    "version" INTEGER NOT NULL DEFAULT 1,
    "fingerprint" TEXT,
    "attachments" INTEGER NOT NULL DEFAULT 0,
    "incidentGroup" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sourceUpdatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketComment" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "visibility" TEXT NOT NULL,
    "authorType" TEXT NOT NULL DEFAULT 'customer',
    "text" TEXT NOT NULL,
    "integrationReceipt" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketSnapshot" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "ticketVersion" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "input" JSONB NOT NULL,
    "omissions" JSONB NOT NULL,
    "includeInternalNotes" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GitHubIssue" (
    "id" TEXT NOT NULL,
    "repository" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "labels" JSONB NOT NULL,
    "private" BOOLEAN NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'synthetic',
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitHubIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateSnapshot" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "candidates" JSONB NOT NULL,
    "retrievalVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'succeeded',
    "asOf" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionRun" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "ticketVersion" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "dataSource" TEXT NOT NULL,
    "requestedModel" TEXT NOT NULL,
    "reportedModel" TEXT,
    "status" TEXT NOT NULL,
    "output" JSONB,
    "error" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "providerLatencyMs" DOUBLE PRECISION,
    "processingLatencyMs" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketIssueLink" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'approved',
    "reviewer" TEXT NOT NULL,
    "reason" TEXT,
    "decisionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketIssueLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposedAction" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "ticketVersion" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "dataSource" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'proposed',
    "dedupKey" TEXT NOT NULL,
    "receipt" JSONB,
    "error" TEXT,
    "remoteIssueId" TEXT,
    "remoteIssueUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposedAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "reviewer" TEXT NOT NULL,
    "reviewerRole" TEXT NOT NULL,
    "bindingHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "invalidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionAttempt" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "marker" TEXT NOT NULL,
    "receipt" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncCursor" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "cursor" TEXT,
    "lastSuccessAt" TIMESTAMP(3),
    "error" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncCursor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookReceipt" (
    "id" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "bodyHash" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "dedupKey" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 4,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "claimedBy" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationLabel" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "split" TEXT NOT NULL,
    "incidentGroup" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "destination" TEXT NOT NULL,
    "engineering" BOOLEAN NOT NULL,
    "critical" BOOLEAN NOT NULL,
    "issueId" TEXT,
    "datasetVersion" TEXT NOT NULL,

    CONSTRAINT "EvaluationLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationRun" (
    "id" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "split" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "dataSource" TEXT NOT NULL,
    "datasetVersion" TEXT NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "settings" JSONB NOT NULL,
    "predictions" JSONB NOT NULL,
    "metrics" JSONB NOT NULL,
    "providerCalls" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'reviewer',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "csrfToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerHealth" (
    "id" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "lastJobId" TEXT,

    CONSTRAINT "WorkerHealth_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Ticket_active_createdAt_idx" ON "Ticket"("active", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_account_sourceId_key" ON "Ticket"("account", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketComment_ticketId_sourceId_key" ON "TicketComment"("ticketId", "sourceId");

-- CreateIndex
CREATE INDEX "TicketSnapshot_ticketId_contentHash_idx" ON "TicketSnapshot"("ticketId", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "GitHubIssue_repository_number_key" ON "GitHubIssue"("repository", "number");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateSnapshot_decisionId_key" ON "CandidateSnapshot"("decisionId");

-- CreateIndex
CREATE INDEX "DecisionRun_ticketId_createdAt_idx" ON "DecisionRun"("ticketId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TicketIssueLink_ticketId_issueId_key" ON "TicketIssueLink"("ticketId", "issueId");

-- CreateIndex
CREATE UNIQUE INDEX "ProposedAction_dedupKey_key" ON "ProposedAction"("dedupKey");

-- CreateIndex
CREATE INDEX "ProposedAction_ticketId_state_idx" ON "ProposedAction"("ticketId", "state");

-- CreateIndex
CREATE INDEX "AuditEvent_recordId_createdAt_idx" ON "AuditEvent"("recordId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Job_dedupKey_key" ON "Job"("dedupKey");

-- CreateIndex
CREATE INDEX "Job_state_availableAt_leaseUntil_idx" ON "Job"("state", "availableAt", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationLabel_ticketId_task_key" ON "EvaluationLabel"("ticketId", "task");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- AddForeignKey
ALTER TABLE "TicketComment" ADD CONSTRAINT "TicketComment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketSnapshot" ADD CONSTRAINT "TicketSnapshot_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateSnapshot" ADD CONSTRAINT "CandidateSnapshot_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "DecisionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionRun" ADD CONSTRAINT "DecisionRun_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionRun" ADD CONSTRAINT "DecisionRun_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "TicketSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketIssueLink" ADD CONSTRAINT "TicketIssueLink_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketIssueLink" ADD CONSTRAINT "TicketIssueLink_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "GitHubIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposedAction" ADD CONSTRAINT "ProposedAction_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposedAction" ADD CONSTRAINT "ProposedAction_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "DecisionRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "ProposedAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionAttempt" ADD CONSTRAINT "ActionAttempt_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "ProposedAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

