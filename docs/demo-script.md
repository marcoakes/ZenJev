# Repeatable ZenJev demo

Start the credential-free app using the README. Open `http://127.0.0.1:3000/tickets`. The header must say **Synthetic data**, **Mock decisions**, **Dry run only**. Settings shows the independent worker heartbeat.

1. Use **Reset demo** to restore the 100 synthetic tickets, 20 synthetic issues and 12 fictional organisations. Reset refuses a workspace containing live tickets. Audit receipts survive reset. Play/Pause advances a controlled synthetic replay.
2. Open tickets 1001, 1002 and 1003 (URLs `/tickets/ticket-001` through `ticket-003`). Evaluate each if needed. Read the public evidence, distinctly styled internal note, confidence, impact and omitted context. Each differently worded report proposes **Webhook retries stop after callback timeout**.
3. Inspect the retrieved candidate and approve the local association on each ticket. Engineering now groups three tickets from three organisations against one existing issue. This changes local records only.
4. Open ticket 1005. Its ambiguous sign-in report remains in review with no confident issue proposal. Ticket 1006 demonstrates missing reproduction; ticket 1013 deliberately simulates a provider failure and visibly retains failed provenance.
5. On ticket 1001 choose **Preview proposed route**. Inspect the exact destination, group, tags, reason and source version. Approve the preview, then execute the dry run. Wait for the durable worker receipt: **Dry run — no external change**. Read the corresponding audit entries.
6. Preview another action, approve it, edit its JSON and save. The approval is invalidated. A stale-source scenario in Settings likewise forces review. Tags and internal notes each have their own previews/approvals.
7. A new-issue preview supports editing. The uncertain-write and backlink-failure scenarios demonstrate reconciliation and retention of the existing issue marker. A missing backlink is a separate note action; it never recreates the issue.
8. In Evaluation, save a synthetic development or held-out prediction run. Change the **routing review-threshold simulator**. Saved predictions remain identical; provider calls for recomputation are zero. Compare sample sizes, exclusions, abstention, coverage and baseline; these are mock simulation metrics, not Jev quality.
9. In Settings inspect repository allowlist, group mappings, team criteria, unvalidated policy thresholds and connection/sync status. About ZenJev displays the complete original artwork. All six main routes remain usable at a narrow viewport.

The browser suite automates the central shared-defect, approval/receipt, threshold, artwork and accessibility journeys. Backend tests cover rejection, failure and recovery paths. Live activation is separate; follow `jev-activation.md` only after actual access and authorisation.
