export const releaseEvidenceSchema = "atlas-wiki.release-evidence.v2" as const;
export type ReleaseEvidencePhase = "prepublish" | "postpublish";

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
  phase: ReleaseEvidencePhase;
  generated_at?: string | undefined;
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
    time?: unknown;
  };
  postpublish?: {
    packageSpec: string;
    registryVersion: string;
    latest: string;
    smokeCommand: string;
    smokeOk: boolean;
    ciRunUrl?: string | undefined;
    githubReleaseAsset?: string | undefined;
  };
  evidenceLimitations?: {
    supabaseLocalSmoke?: {
      path: string;
      status: string;
      ok: boolean;
      productionProof: boolean;
      note: string;
    } | undefined;
    publishedPackageSmoke?: {
      path: string;
      productionProof: boolean;
      note: string;
    } | undefined;
  } | undefined;
  git: {
    branch: string;
    localHead: string;
    dirtyWorkspace?: boolean | undefined;
    remoteMainHead?: string | undefined;
    baselineTag?: string | undefined;
    baselineTagHead?: string | undefined;
    baselineReleaseUrl?: string | undefined;
    baselineRelease?: unknown;
    targetTag?: string | undefined;
    targetTagHead?: string | undefined;
    v011TagHead?: string | undefined;
    v011ReleaseUrl?: string | undefined;
  };
  ci?: {
    provider?: string | undefined;
    runId?: string | undefined;
    runUrl?: string | undefined;
    workflow?: string | undefined;
    sha?: string | undefined;
    status?: string | undefined;
    conclusion?: string | undefined;
    headSha?: string | undefined;
    currentTree?: boolean | undefined;
    dirtyWorkspace?: boolean | undefined;
  } | undefined;
  tasks: ReleaseTaskEvidence[];
  requiredArtifacts: Array<{ path: string; exists: boolean; sizeBytes: number; sha256?: string | undefined; evidence: string[] }>;
  gates: Array<{ name: string; command: string; evidence: string[] }>;
  selfScore?: Record<string, number> | undefined;
  scorecard?: Array<{ area: string; score: number; evidence: string[]; gate: string }> | undefined;
  publishPolicy: {
    stableLocalPublishBlocked: boolean;
    trustedPublishingWorkflow: string;
    emergencyOverrideEnv: "ATLAS_WIKI_EMERGENCY_LOCAL_PUBLISH";
  };
}

export function assertReleaseEvidenceManifest(manifest: ReleaseEvidenceManifest): ReleaseEvidenceManifest {
  if (manifest.schema !== releaseEvidenceSchema) throw new Error("Unsupported release evidence schema");
  if (manifest.phase !== "prepublish" && manifest.phase !== "postpublish") throw new Error("Release evidence phase must be prepublish or postpublish");
  if (manifest.package.name !== "atlas-wiki" || manifest.npm.package !== "atlas-wiki") throw new Error("Release evidence package name mismatch");
  if (manifest.phase === "postpublish" && !manifest.postpublish?.smokeOk) throw new Error("Postpublish evidence must record a passing published smoke");
  if (manifest.sourceGoal.taskTotal < 1) throw new Error("Release evidence must include at least one source task");
  if (manifest.sourceGoal.taskChecked !== manifest.sourceGoal.taskTotal) throw new Error("Source task checklist is not fully checked");
  if (manifest.sourceGoal.checklistChecked !== manifest.sourceGoal.checklistTotal) throw new Error("Source checklist is not fully checked");
  if (manifest.tasks.length !== manifest.sourceGoal.taskTotal) throw new Error("Task evidence ledger length mismatch");
  if (manifest.tasks.some((task) => task.evidence.length === 0)) throw new Error("Every release task must have evidence");
  if (manifest.requiredArtifacts.some((artifact) => !artifact.exists)) throw new Error("Required release artifact is missing");
  if (manifest.requiredArtifacts.some((artifact) => artifact.sizeBytes <= 0)) throw new Error("Required release artifact is empty");
  if (manifest.requiredArtifacts.some((artifact) => artifact.evidence.length === 0)) throw new Error("Required release artifact must list verifier evidence");
  if (manifest.scorecard?.some((entry) => entry.score >= 9 && entry.evidence.length === 0)) throw new Error("9+ release score requires evidence paths");
  if (!manifest.publishPolicy.stableLocalPublishBlocked) throw new Error("Stable local publish guard is not enabled");
  return manifest;
}

export function releaseEvidenceSummary(manifest: ReleaseEvidenceManifest): string {
  assertReleaseEvidenceManifest(manifest);
  return `${manifest.package.name}@${manifest.package.version} ${manifest.phase}: ${manifest.sourceGoal.taskChecked}/${manifest.sourceGoal.taskTotal} stabilization tasks checked with evidence`;
}
