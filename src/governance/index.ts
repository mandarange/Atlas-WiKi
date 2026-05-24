export type GovernanceWorkflowName =
  | "ProposalApprovalFlow"
  | "OwnerNotification"
  | "ChangeHistoryBuilder"
  | "ComplianceReport"
  | "RetentionSweep"
  | "LegalHold"
  | "DataExportRequest"
  | "DeletionRequest";

export interface GovernanceWorkflowSpec {
  name: GovernanceWorkflowName;
  defaultMode: "proposal" | "report" | "protected_action";
  securityReview: "default_secure";
  requiresAudit: boolean;
  goldenFixture: string;
}

export const governanceWorkflows: readonly GovernanceWorkflowSpec[] = [
  { name: "ProposalApprovalFlow", defaultMode: "proposal", securityReview: "default_secure", requiresAudit: true, goldenFixture: "golden/proposal-approval.json" },
  { name: "OwnerNotification", defaultMode: "report", securityReview: "default_secure", requiresAudit: true, goldenFixture: "golden/owner-notification.json" },
  { name: "ChangeHistoryBuilder", defaultMode: "report", securityReview: "default_secure", requiresAudit: true, goldenFixture: "golden/change-history.json" },
  { name: "ComplianceReport", defaultMode: "report", securityReview: "default_secure", requiresAudit: true, goldenFixture: "golden/compliance-report.json" },
  { name: "RetentionSweep", defaultMode: "protected_action", securityReview: "default_secure", requiresAudit: true, goldenFixture: "golden/retention-sweep.json" },
  { name: "LegalHold", defaultMode: "protected_action", securityReview: "default_secure", requiresAudit: true, goldenFixture: "golden/legal-hold.json" },
  { name: "DataExportRequest", defaultMode: "protected_action", securityReview: "default_secure", requiresAudit: true, goldenFixture: "golden/data-export-request.json" },
  { name: "DeletionRequest", defaultMode: "protected_action", securityReview: "default_secure", requiresAudit: true, goldenFixture: "golden/deletion-request.json" }
];

export function buildGovernanceReport(): { workflows: number; protectedActions: number; auditRequired: boolean } {
  return {
    workflows: governanceWorkflows.length,
    protectedActions: governanceWorkflows.filter((workflow) => workflow.defaultMode === "protected_action").length,
    auditRequired: governanceWorkflows.every((workflow) => workflow.requiresAudit)
  };
}
