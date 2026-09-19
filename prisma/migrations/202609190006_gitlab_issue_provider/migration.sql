-- Add provider, host and canonical link to the issue index.
-- Existing rows are GitHub.com issues, so the defaults describe them exactly and no
-- stored issue identifier, ticket link or frozen decision record is rewritten.
ALTER TABLE "GitHubIssue" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'github';
ALTER TABLE "GitHubIssue" ADD COLUMN "host" TEXT NOT NULL DEFAULT 'github.com';
ALTER TABLE "GitHubIssue" ADD COLUMN "url" TEXT;

-- Issue numbers are project-scoped on GitLab, so identity must include provider and host.
DROP INDEX "GitHubIssue_repository_number_key";
CREATE UNIQUE INDEX "GitHubIssue_provider_host_repository_number_key" ON "GitHubIssue"("provider", "host", "repository", "number");
CREATE INDEX "GitHubIssue_provider_host_idx" ON "GitHubIssue"("provider", "host");

-- The selected issue provider is workspace configuration; its host stays server-side.
ALTER TABLE "WorkspaceSettings" ADD COLUMN "issueProvider" TEXT NOT NULL DEFAULT 'github';

-- An approved issue action records the exact provider and host it was approved for.
ALTER TABLE "ProposedAction" ADD COLUMN "issueProvider" TEXT;
ALTER TABLE "ProposedAction" ADD COLUMN "issueHost" TEXT;
UPDATE "ProposedAction" SET "issueProvider" = 'github', "issueHost" = 'github.com' WHERE "type" = 'create_issue';

-- Issue approvals now bind provider, host and project, so any approval granted before this
-- migration no longer matches its binding. Fail closed rather than execute an unbound write.
UPDATE "ProposedAction" SET "state" = 'stale', "error" = 'Issue approvals now bind provider, host and project; re-approve the preview'
  WHERE "type" = 'create_issue' AND "state" IN ('approved', 'queued');
UPDATE "Approval" SET "invalidatedAt" = NOW()
  WHERE "invalidatedAt" IS NULL AND "actionId" IN (SELECT "id" FROM "ProposedAction" WHERE "type" = 'create_issue');
