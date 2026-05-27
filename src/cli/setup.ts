import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as defaultInput, stdout as defaultOutput } from "node:process";
import type { RagFallbackPolicy } from "../rag/index.js";
import { ensureDataRoot } from "../store/sqlite-store.js";

export interface AtlasWikiCliConfig {
  version: 1;
  root: string;
  rag: {
    enabled: boolean;
    provider: "none" | "gemini" | "testing";
    model: string;
    dimensions: number;
    fallbackPolicy: RagFallbackPolicy;
    apiKeyEnv: string;
  };
  supabase?: {
    enabled: boolean;
    schema: string;
    urlEnv: string;
    anonKeyEnv: string;
  } | undefined;
}

export interface SetupResult {
  ok: boolean;
  root: string;
  configPath: string;
  envExamplePath?: string | undefined;
  config: AtlasWikiCliConfig;
  nextSteps: string[];
}

type FlagMap = Map<string, string | boolean>;

export function configPath(root: string): string {
  return join(root, "cli-config.json");
}

export function readCliConfig(root: string): AtlasWikiCliConfig | undefined {
  const path = configPath(root);
  if (!existsSync(path)) return undefined;
  const parsed = JSON.parse(readFileSync(path, "utf8")) as AtlasWikiCliConfig;
  if (parsed.version !== 1) throw new Error(`Unsupported Atlas WiKi config version in ${path}`);
  return parsed;
}

export function writeCliConfig(root: string, config: AtlasWikiCliConfig): string {
  ensureDataRoot(root);
  const path = configPath(root);
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
  return path;
}

export async function runInteractiveSetup(options: { root: string; flags: FlagMap; input?: NodeJS.ReadableStream | undefined; output?: NodeJS.WritableStream | undefined }): Promise<SetupResult> {
  const nonInteractive = Boolean(options.flags.get("yes") || options.flags.get("non-interactive"));
  const root = str(options.flags, "root") ?? options.root;
  ensureDataRoot(root);
  const existing = readCliConfig(root);
  const defaults = existing ?? defaultConfig(root);
  const answers = nonInteractive ? defaultsFromFlags(options.flags, defaults, root) : await promptForConfig(options, defaults, root);
  const path = writeCliConfig(root, answers);
  const writeEnv = Boolean(options.flags.get("write-env-example") || (!nonInteractive && answers.rag.provider === "gemini"));
  const envExamplePath = writeEnv ? writeEnvExample(root, answers) : undefined;
  return {
    ok: true,
    root,
    configPath: path,
    envExamplePath,
    config: answers,
    nextSteps: nextSteps(answers)
  };
}

export function configureRag(root: string, flags: FlagMap, enabled: boolean): SetupResult {
  const existing = readCliConfig(root) ?? defaultConfig(root);
  const config: AtlasWikiCliConfig = {
    ...existing,
    rag: {
      enabled,
      provider: enabled ? provider(flags, existing.rag.provider === "none" ? "gemini" : existing.rag.provider) : "none",
      model: str(flags, "model") ?? existing.rag.model,
      dimensions: num(flags, "dimensions") ?? existing.rag.dimensions,
      fallbackPolicy: fallback(flags, existing.rag.fallbackPolicy),
      apiKeyEnv: str(flags, "api-key-env") ?? existing.rag.apiKeyEnv
    }
  };
  const path = writeCliConfig(root, config);
  return { ok: true, root, configPath: path, config, nextSteps: nextSteps(config) };
}

function defaultConfig(root: string): AtlasWikiCliConfig {
  return {
    version: 1,
    root,
    rag: {
      enabled: true,
      provider: "gemini",
      model: "gemini-embedding-2",
      dimensions: 1536,
      fallbackPolicy: "degrade",
      apiKeyEnv: "GEMINI_API_KEY"
    },
    supabase: {
      enabled: false,
      schema: "atlas_wiki",
      urlEnv: "SUPABASE_URL",
      anonKeyEnv: "SUPABASE_ANON_KEY"
    }
  };
}

function defaultsFromFlags(flags: FlagMap, defaults: AtlasWikiCliConfig, root: string): AtlasWikiCliConfig {
  const selectedProvider = provider(flags, defaults.rag.provider);
  return {
    version: 1,
    root,
    rag: {
      enabled: selectedProvider !== "none",
      provider: selectedProvider,
      model: str(flags, "model") ?? defaults.rag.model,
      dimensions: num(flags, "dimensions") ?? defaults.rag.dimensions,
      fallbackPolicy: fallback(flags, defaults.rag.fallbackPolicy),
      apiKeyEnv: str(flags, "api-key-env") ?? defaults.rag.apiKeyEnv
    },
    supabase: {
      enabled: boolFlag(flags, "supabase", defaults.supabase?.enabled ?? false),
      schema: str(flags, "schema") ?? defaults.supabase?.schema ?? "atlas_wiki",
      urlEnv: str(flags, "supabase-url-env") ?? defaults.supabase?.urlEnv ?? "SUPABASE_URL",
      anonKeyEnv: str(flags, "supabase-anon-key-env") ?? defaults.supabase?.anonKeyEnv ?? "SUPABASE_ANON_KEY"
    }
  };
}

async function promptForConfig(options: { flags: FlagMap; input?: NodeJS.ReadableStream | undefined; output?: NodeJS.WritableStream | undefined }, defaults: AtlasWikiCliConfig, root: string): Promise<AtlasWikiCliConfig> {
  const rl = createInterface({ input: options.input ?? defaultInput, output: options.output ?? defaultOutput });
  try {
    const selectedProvider = providerValue(await ask(rl, `RAG provider (gemini/testing/none) [${defaults.rag.provider}]: `), defaults.rag.provider);
    const model = selectedProvider === "gemini" ? await askDefault(rl, `Gemini embedding model [${defaults.rag.model}]: `, defaults.rag.model) : defaults.rag.model;
    const dimensions = selectedProvider === "gemini" ? Number(await askDefault(rl, `Embedding dimensions [${defaults.rag.dimensions}]: `, String(defaults.rag.dimensions))) : defaults.rag.dimensions;
    const apiKeyEnv = selectedProvider === "gemini" ? await askDefault(rl, `Gemini API key env var [${defaults.rag.apiKeyEnv}]: `, defaults.rag.apiKeyEnv) : defaults.rag.apiKeyEnv;
    const fallbackPolicy = fallbackValue(await ask(rl, `Hybrid fallback policy (degrade/error/lexical_only/structured_only) [${defaults.rag.fallbackPolicy}]: `), defaults.rag.fallbackPolicy);
    const supabaseEnabled = yes(await ask(rl, `Configure Supabase RAG env names? [${defaults.supabase?.enabled ? "Y/n" : "y/N"}]: `), defaults.supabase?.enabled ?? false);
    return {
      version: 1,
      root,
      rag: { enabled: selectedProvider !== "none", provider: selectedProvider, model, dimensions, fallbackPolicy, apiKeyEnv },
      supabase: {
        enabled: supabaseEnabled,
        schema: supabaseEnabled ? await askDefault(rl, `Supabase schema [${defaults.supabase?.schema ?? "atlas_wiki"}]: `, defaults.supabase?.schema ?? "atlas_wiki") : defaults.supabase?.schema ?? "atlas_wiki",
        urlEnv: supabaseEnabled ? await askDefault(rl, `Supabase URL env var [${defaults.supabase?.urlEnv ?? "SUPABASE_URL"}]: `, defaults.supabase?.urlEnv ?? "SUPABASE_URL") : defaults.supabase?.urlEnv ?? "SUPABASE_URL",
        anonKeyEnv: supabaseEnabled ? await askDefault(rl, `Supabase anon key env var [${defaults.supabase?.anonKeyEnv ?? "SUPABASE_ANON_KEY"}]: `, defaults.supabase?.anonKeyEnv ?? "SUPABASE_ANON_KEY") : defaults.supabase?.anonKeyEnv ?? "SUPABASE_ANON_KEY"
      }
    };
  } finally {
    rl.close();
  }
}

async function ask(rl: ReturnType<typeof createInterface>, prompt: string): Promise<string> {
  return (await rl.question(prompt)).trim();
}

async function askDefault(rl: ReturnType<typeof createInterface>, prompt: string, value: string): Promise<string> {
  const answer = await ask(rl, prompt);
  return answer || value;
}

function writeEnvExample(root: string, config: AtlasWikiCliConfig): string {
  const lines = [`${config.rag.apiKeyEnv}=`, `${config.supabase?.urlEnv ?? "SUPABASE_URL"}=`, `${config.supabase?.anonKeyEnv ?? "SUPABASE_ANON_KEY"}=`];
  const path = join(root, ".env.example");
  writeFileSync(path, `${[...new Set(lines)].join("\n")}\n`);
  return path;
}

function nextSteps(config: AtlasWikiCliConfig): string[] {
  const steps = ["Run awiki init if this root is new.", "Run awiki rag status --json to inspect the active configuration."];
  if (config.rag.provider === "gemini") steps.push(`Set ${config.rag.apiKeyEnv} before awiki rag index/search uses vector embeddings.`);
  if (config.supabase?.enabled) steps.push("Run supabase link and supabase db push in an approved local or branch environment.");
  return steps;
}

function str(flags: FlagMap, key: string): string | undefined {
  const value = flags.get(key);
  return typeof value === "string" ? value : undefined;
}

function num(flags: FlagMap, key: string): number | undefined {
  const value = str(flags, key);
  return value ? Number(value) : undefined;
}

function provider(flags: FlagMap, fallbackProvider: AtlasWikiCliConfig["rag"]["provider"]): AtlasWikiCliConfig["rag"]["provider"] {
  return providerValue(str(flags, "provider") ?? "", fallbackProvider);
}

function providerValue(value: string, fallbackProvider: AtlasWikiCliConfig["rag"]["provider"]): AtlasWikiCliConfig["rag"]["provider"] {
  const normalized = value.trim().toLowerCase();
  return normalized === "gemini" || normalized === "testing" || normalized === "none" ? normalized : fallbackProvider;
}

function fallback(flags: FlagMap, fallbackPolicy: RagFallbackPolicy): RagFallbackPolicy {
  return fallbackValue(str(flags, "fallback") ?? "", fallbackPolicy);
}

function fallbackValue(value: string, fallbackPolicy: RagFallbackPolicy): RagFallbackPolicy {
  const normalized = value.trim();
  return normalized === "error" || normalized === "degrade" || normalized === "lexical_only" || normalized === "structured_only" || normalized === "testing_deterministic_embeddings" ? normalized : fallbackPolicy;
}

function boolFlag(flags: FlagMap, key: string, fallbackValue: boolean): boolean {
  const value = flags.get(key);
  if (value === true) return true;
  if (typeof value === "string") return yes(value, fallbackValue);
  return fallbackValue;
}

function yes(value: string, fallbackValue: boolean): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallbackValue;
  return normalized === "y" || normalized === "yes" || normalized === "true" || normalized === "1";
}
