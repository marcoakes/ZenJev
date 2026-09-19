ALTER TABLE "ProposedAction" ADD COLUMN "parentActionId" TEXT;
CREATE INDEX "ProposedAction_parentActionId_idx" ON "ProposedAction"("parentActionId");
