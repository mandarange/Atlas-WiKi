import {
  createSupabaseProjectScaffold,
  listSupabaseMigrationAssets,
  SUPABASE_DEFAULT_DIMENSION_POLICY,
  SUPABASE_DEFAULT_VECTOR_DIMENSIONS,
  SUPABASE_MIGRATION_FILENAMES,
  SUPABASE_MIGRATION_VERSIONS,
  writeSupabaseMigrations
} from "../store/supabase/index.js";

interface ParsedArgs {
  command: string[];
  flags: Map<string, string | boolean>;
}

interface SupabaseDoctorReport {
  ok: boolean;
  url: string | null;
  schema: "atlas_wiki";
  keyType: "anon_or_publishable" | "service_role" | "missing";
  findings: string[];
  validation: {
    ok: boolean;
    findings: string[];
    error?: string | undefined;
  };
  migrations: {
    ok: boolean;
    applied: string[];
    pending: string[];
    error?: string | undefined;
  };
  dimensionPolicy: {
    name: typeof SUPABASE_DEFAULT_DIMENSION_POLICY;
    dimensions: typeof SUPABASE_DEFAULT_VECTOR_DIMENSIONS;
  };
  nextSteps: string[];
  warning?: string | undefined;
}

const SUPABASE_SCHEMA = "atlas_wiki" as const;

export async function handleSupabaseCommand(args: ParsedArgs): Promise<unknown> {
  assertSupabaseDimensionsFlag(args);
  const [, sub, third] = args.command;
  if (!sub || sub === "help" || sub === "--help") return supabaseHelp();
  if (sub === "init") {
    const outDir = str(args, "out") ?? "./supabase";
    return createSupabaseProjectScaffold(outDir, writeOptions(args));
  }
  if (sub === "status") return supabaseStatus(str(args, "out") ?? "./supabase");
  if (sub === "doctor") return supabaseDoctor(args);
  if (sub === "migrations") {
    if (third === "list") return { ok: true, migrations: listSupabaseMigrationAssets(), count: SUPABASE_MIGRATION_FILENAMES.length };
    if (third === "export") return writeSupabaseMigrations(str(args, "out") ?? "./supabase/migrations", writeOptions(args));
  }
  throw new Error("Unknown supabase command: " + args.command.join(" "));
}

export function supabaseHelp(): string {
  return [
    "Atlas WiKi Supabase commands:",
    "  awiki supabase init --out ./supabase --json",
    "  awiki supabase migrations export --out ./supabase/migrations --json",
    "  awiki supabase migrations list --json",
    "  awiki supabase doctor --url $SUPABASE_URL --key $SUPABASE_ANON_KEY --json",
    "  awiki supabase status --json"
  ].join("\n");
}

export async function supabaseDoctor(args: ParsedArgs, fetchImpl: typeof fetch = fetch): Promise<SupabaseDoctorReport> {
  const url = str(args, "url") ?? process.env.SUPABASE_URL ?? null;
  const serviceRole = Boolean(args.flags.get("service-role"));
  const key =
    str(args, "key") ??
    (serviceRole ? process.env.SUPABASE_SERVICE_ROLE_KEY : process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY) ??
    null;
  const report: SupabaseDoctorReport = {
    ok: false,
    url,
    schema: SUPABASE_SCHEMA,
    keyType: key ? serviceRole ? "service_role" : "anon_or_publishable" : "missing",
    findings: [],
    validation: { ok: false, findings: [] },
    migrations: { ok: false, applied: [], pending: [] },
    dimensionPolicy: { name: SUPABASE_DEFAULT_DIMENSION_POLICY, dimensions: SUPABASE_DEFAULT_VECTOR_DIMENSIONS },
    nextSteps: [
      "Run awiki supabase init --out ./supabase --json.",
      "Run npx supabase link --project-ref <project-ref>.",
      "Run npx supabase db push.",
      "Re-run awiki supabase doctor --json with SUPABASE_URL and SUPABASE_ANON_KEY set."
    ],
    warning: serviceRole ? "Service role keys are server-only secrets. Do not place them in browser/client code or public MCP tool inputs." : undefined
  };
  if (!url) report.findings.push("missing_supabase_url:set_SUPABASE_URL_or_--url");
  if (!key) report.findings.push(serviceRole ? "missing_service_role_key:set_SUPABASE_SERVICE_ROLE_KEY_or_--key" : "missing_anon_key:set_SUPABASE_ANON_KEY_or_--key");
  if (!url || !key) return report;

  const validation = await callSupabaseRpc(url, key, "validate_contract", {}, fetchImpl);
  if (!validation.ok) {
    report.validation = { ok: false, findings: ["supabase_missing_rpc:validate_contract"], error: validation.error };
    report.findings.push("migrations_required: missing validate_contract RPC. Run awiki supabase init and npx supabase db push.");
  } else {
    const findings = rows(validation.data).map((row) => String(row.finding ?? "")).filter(Boolean).sort();
    report.validation = { ok: findings.length === 0, findings };
    report.findings.push(...findings.map(friendlyFinding));
  }

  const migrationReport = await callSupabaseRpc(url, key, "migration_report", { expected_versions: SUPABASE_MIGRATION_VERSIONS }, fetchImpl);
  if (!migrationReport.ok) {
    report.migrations = { ok: false, applied: [], pending: [...SUPABASE_MIGRATION_VERSIONS], error: migrationReport.error };
    report.findings.push("migrations_required: missing migration_report RPC. Run awiki supabase init and npx supabase db push.");
  } else {
    const entries = rows(migrationReport.data);
    const pending = entries.filter((row) => String(row.status) !== "applied").map((row) => String(row.version));
    const applied = entries.filter((row) => String(row.status) === "applied").map((row) => String(row.version));
    report.migrations = { ok: pending.length === 0 && applied.length >= SUPABASE_MIGRATION_VERSIONS.length, applied, pending };
    for (const version of pending) report.findings.push(`pending_migration:${version}`);
  }

  report.ok = report.findings.length === 0 && report.validation.ok && report.migrations.ok;
  return report;
}

function supabaseStatus(outDir: string): unknown {
  return {
    ok: true,
    outDir,
    packageAssets: {
      migrationsIncluded: true,
      count: SUPABASE_MIGRATION_FILENAMES.length,
      filenames: [...SUPABASE_MIGRATION_FILENAMES],
      dimensionPolicy: SUPABASE_DEFAULT_DIMENSION_POLICY,
      dimensions: SUPABASE_DEFAULT_VECTOR_DIMENSIONS
    },
    commands: [
      "awiki supabase init --out ./supabase --json",
      "npx supabase link --project-ref <project-ref>",
      "npx supabase db push",
      "awiki supabase doctor --json"
    ]
  };
}

async function callSupabaseRpc(url: string, key: string, fn: "validate_contract" | "migration_report", body: Record<string, unknown>, fetchImpl: typeof fetch): Promise<{ ok: boolean; data?: unknown; error?: string | undefined }> {
  const endpoint = `${url.replace(/\/+$/, "")}/rest/v1/rpc/${fn}`;
  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Accept-Profile": SUPABASE_SCHEMA,
        "Content-Profile": SUPABASE_SCHEMA
      },
      body: JSON.stringify(body)
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) as unknown : null;
    if (!response.ok) return { ok: false, data, error: errorMessage(data) ?? `${response.status} ${response.statusText}` };
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function rows(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
  if (value && typeof value === "object") return [value as Record<string, unknown>];
  return [];
}

function errorMessage(value: unknown): string | undefined {
  if (value && typeof value === "object" && "message" in value) return String((value as { message?: unknown }).message);
  return undefined;
}

function friendlyFinding(finding: string): string {
  if (finding === "supabase_missing_extension:vector") return "pgvector_missing: enable the vector extension before Supabase RAG vector search.";
  if (finding.startsWith("supabase_missing_rpc:rag_search")) return "missing_rpc:rag_search in 20260527000700_atlas_wiki_rag_pgvector.sql or later migrations.";
  if (finding.startsWith("supabase_missing_rpc:")) return `${finding}: run awiki supabase init and npx supabase db push.`;
  if (finding.toLowerCase().includes("rls") || finding.toLowerCase().includes("rowsecurity")) return `${finding}: review RLS policies and grants.`;
  return finding;
}

function writeOptions(args: ParsedArgs) {
  return {
    overwrite: Boolean(args.flags.get("force") || args.flags.get("overwrite")),
    dryRun: Boolean(args.flags.get("dry-run"))
  };
}

function assertSupabaseDimensionsFlag(args: ParsedArgs): void {
  const dimensions = str(args, "dimensions");
  if (dimensions && Number(dimensions) !== SUPABASE_DEFAULT_VECTOR_DIMENSIONS) {
    throw new Error(`Atlas WiKi bundled Supabase migrations support only ${SUPABASE_DEFAULT_VECTOR_DIMENSIONS} dimensions (${SUPABASE_DEFAULT_DIMENSION_POLICY}). Custom dimensions require an explicit project migration.`);
  }
}

function str(args: ParsedArgs, key: string): string | undefined {
  const value = args.flags.get(key);
  return typeof value === "string" ? value : undefined;
}
