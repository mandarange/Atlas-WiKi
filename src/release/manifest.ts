export const releaseEvidenceSchema = "atlas-wiki.release-evidence.v1" as const;

export interface ReleaseTaskEvidence {
  id: string;
  priority: "P0" | "P1" | "P2" | "P0-equivalent";
  area: string;
  requirement: string;
  capability: string;
  evidence: string[];
  gate: string;
}

export interface ReleaseEvidenceManifest {
  schema: typeof releaseEvidenceSchema;
  package: {
    name: "atlas-wiki";
    version: string;
  };
  sourceGoal: {
    path: string;
    sha256: string;
    checklistTotal: number;
    checklistChecked: number;
    taskTotal: number;
    taskChecked: number;
  };
  npm: {
    package: "atlas-wiki";
    version: string;
    latest: string;
    gitHead?: string | undefined;
    integrity?: string | undefined;
    shasum?: string | undefined;
  };
  git: {
    branch: string;
    localHead: string;
    remoteMainHead?: string | undefined;
    baselineTag?: string | undefined;
    baselineTagHead?: string | undefined;
    baselineReleaseUrl?: string | undefined;
    baselineRelease?: unknown;
    v011TagHead?: string | undefined;
    v011ReleaseUrl?: string | undefined;
  };
  tasks: ReleaseTaskEvidence[];
  requiredArtifacts: Array<{ path: string; exists: boolean; evidence: string[] }>;
  gates: Array<{ name: string; command: string; evidence: string[] }>;
  publishPolicy: {
    stableLocalPublishBlocked: boolean;
    trustedPublishingWorkflow: string;
    emergencyOverrideEnv: "ATLAS_WIKI_EMERGENCY_LOCAL_PUBLISH";
  };
}

export function assertReleaseEvidenceManifest(manifest: ReleaseEvidenceManifest): ReleaseEvidenceManifest {
  if (manifest.schema !== releaseEvidenceSchema) throw new Error("Unsupported release evidence schema");
  if (manifest.package.name !== "atlas-wiki" || manifest.npm.package !== "atlas-wiki") throw new Error("Release evidence package name mismatch");
  if (manifest.sourceGoal.taskTotal < 1) throw new Error("Release evidence must include at least one source task");
  if (manifest.sourceGoal.taskChecked !== manifest.sourceGoal.taskTotal) throw new Error("Source task checklist is not fully checked");
  if (manifest.sourceGoal.checklistChecked !== manifest.sourceGoal.checklistTotal) throw new Error("Source checklist is not fully checked");
  if (manifest.tasks.length !== manifest.sourceGoal.taskTotal) throw new Error("Task evidence ledger length mismatch");
  if (manifest.tasks.some((task) => task.evidence.length === 0)) throw new Error("Every release task must have evidence");
  if (manifest.requiredArtifacts.some((artifact) => !artifact.exists)) throw new Error("Required release artifact is missing");
  if (!manifest.publishPolicy.stableLocalPublishBlocked) throw new Error("Stable local publish guard is not enabled");
  return manifest;
}

export function releaseEvidenceSummary(manifest: ReleaseEvidenceManifest): string {
  assertReleaseEvidenceManifest(manifest);
  return `${manifest.package.name}@${manifest.package.version}: ${manifest.sourceGoal.taskChecked}/${manifest.sourceGoal.taskTotal} stabilization tasks checked with evidence`;
}
