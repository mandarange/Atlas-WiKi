import { contentHash } from "../core/hash/index.js";
import { stableId } from "../core/ids/index.js";
import type { SourceRecord, SourceRef } from "../core/records/index.js";

export interface StructuredSchemaContract {
  id: string;
  name: string;
  version: string;
  description?: string | undefined;
  jsonSchema: Record<string, unknown>;
  requiredFields: string[];
  identityFields: string[];
  confidenceThreshold: number;
  conflictKeys: string[];
}

export class StructuredSchemaContractError extends Error {
  readonly code = "STRUCTURED_SCHEMA_CONTRACT_ERROR";
  constructor(message: string, readonly schemaId: string) {
    super(message);
    this.name = "StructuredSchemaContractError";
  }
}

export interface ParsedSource {
  source: SourceRecord;
  text: string;
}

export interface ExtractorInput extends ParsedSource {
  schemas?: string[] | undefined;
}

export interface Extractor {
  name: string;
  version: string;
  supports(input: SourceRecord | ParsedSource): boolean;
  extract(input: ExtractorInput): Promise<ExtractionCandidate[]> | ExtractionCandidate[];
}

export interface ExtractionCandidate {
  objectType: string;
  schemaId: string;
  data: Record<string, unknown>;
  confidence: number;
  evidence: Array<{
    sourceId: string;
    chunkId?: string | undefined;
    quote?: string | undefined;
    locator?: Record<string, unknown> | undefined;
  }>;
  warnings: string[];
}

export const keyValueExtractor: Extractor = {
  name: "atlas.key-value",
  version: "1.0.0",
  supports(input) {
    return "text" in input ? /(^|\n)\s*[-*]?\s*[\w .-]{2,80}\s*[:=]\s*\S/.test(input.text) : true;
  },
  extract(input) {
    const data: Record<string, unknown> = {};
    const evidence: ExtractionCandidate["evidence"] = [];
    for (const [index, line] of input.text.split(/\r?\n/).entries()) {
      const match = line.match(/^\s*[-*]?\s*([\w .-]{2,80})\s*[:=]\s*(.+?)\s*$/);
      if (!match) continue;
      const key = normalizeFieldName(match[1]!);
      data[key] = normalizeScalar(match[2]!);
      evidence.push({ sourceId: input.source.id, quote: line.trim(), locator: { line_start: index + 1, line_end: index + 1 } });
    }
    if (Object.keys(data).length === 0) return [];
    return [{
      objectType: "key_value_document",
      schemaId: input.schemas?.[0] ?? "atlas.schema.key-value.v1",
      data,
      confidence: 0.82,
      evidence,
      warnings: []
    }];
  }
};

export const markdownHeadingExtractor: Extractor = {
  name: "atlas.markdown-heading",
  version: "1.0.0",
  supports(input) {
    return "text" in input ? /^#{1,6}\s+\S/m.test(input.text) : true;
  },
  extract(input) {
    const headings = input.text.split(/\r?\n/).flatMap((line, index) => {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      return match ? [{ level: match[1]!.length, text: match[2]!.trim(), line: index + 1 }] : [];
    });
    if (headings.length === 0) return [];
    return [{
      objectType: "markdown_outline",
      schemaId: "atlas.schema.markdown-outline.v1",
      data: { headings },
      confidence: 0.9,
      evidence: headings.map((heading) => ({ sourceId: input.source.id, quote: "#".repeat(heading.level) + " " + heading.text, locator: { line_start: heading.line, line_end: heading.line } })),
      warnings: []
    }];
  }
};

export const jsonExtractor: Extractor = {
  name: "atlas.json",
  version: "1.0.0",
  supports(input) {
    return "text" in input ? input.text.trim().startsWith("{") || input.text.trim().startsWith("[") : true;
  },
  extract(input) {
    try {
      const parsed = JSON.parse(input.text) as unknown;
      return [{
        objectType: Array.isArray(parsed) ? "json_array" : "json_object",
        schemaId: input.schemas?.[0] ?? "atlas.schema.json.v1",
        data: { value: parsed },
        confidence: 0.95,
        evidence: [{ sourceId: input.source.id, quote: input.text.slice(0, 500), locator: { byte_start: 0, byte_end: input.text.length } }],
        warnings: []
      }];
    } catch {
      return [];
    }
  }
};

export const markdownTableExtractor: Extractor = {
  name: "atlas.markdown-table",
  version: "1.0.0",
  supports(input) {
    return "text" in input ? /\|.+\|\r?\n\|[-:| ]+\|/.test(input.text) : true;
  },
  extract(input) {
    const lines = input.text.split(/\r?\n/);
    for (let index = 0; index < lines.length - 1; index += 1) {
      if (!/^\s*\|.*\|\s*$/.test(lines[index]!) || !/^\s*\|[-:| ]+\|\s*$/.test(lines[index + 1]!)) continue;
      const headers = splitTableRow(lines[index]!);
      const rows: Record<string, unknown>[] = [];
      for (let rowIndex = index + 2; rowIndex < lines.length; rowIndex += 1) {
        if (!/^\s*\|.*\|\s*$/.test(lines[rowIndex]!)) break;
        const cells = splitTableRow(lines[rowIndex]!);
        rows.push(Object.fromEntries(headers.map((header, cellIndex) => [normalizeFieldName(header), cells[cellIndex] ?? ""])));
      }
      if (headers.length > 0 && rows.length > 0) {
        return [{
          objectType: "markdown_table",
          schemaId: "atlas.schema.table.v1",
          data: { headers, rows },
          confidence: 0.88,
          evidence: [{ sourceId: input.source.id, quote: lines.slice(index, index + 2 + rows.length).join("\n"), locator: { line_start: index + 1, line_end: index + 2 + rows.length } }],
          warnings: []
        }];
      }
    }
    return [];
  }
};

export const builtInExtractors: readonly Extractor[] = [jsonExtractor, markdownTableExtractor, keyValueExtractor, markdownHeadingExtractor];

export const builtInSchemaContracts: readonly StructuredSchemaContract[] = [
  {
    id: "atlas.schema.key-value.v1",
    name: "Atlas Key Value",
    version: "1",
    jsonSchema: { type: "object" },
    requiredFields: [],
    identityFields: [],
    confidenceThreshold: 0.8,
    conflictKeys: []
  },
  {
    id: "atlas.schema.markdown-outline.v1",
    name: "Atlas Markdown Outline",
    version: "1",
    jsonSchema: { type: "object", required: ["headings"] },
    requiredFields: ["headings"],
    identityFields: [],
    confidenceThreshold: 0.85,
    conflictKeys: []
  },
  {
    id: "atlas.schema.json.v1",
    name: "Atlas JSON",
    version: "1",
    jsonSchema: { type: "object", required: ["value"] },
    requiredFields: ["value"],
    identityFields: [],
    confidenceThreshold: 0.9,
    conflictKeys: []
  },
  {
    id: "atlas.schema.table.v1",
    name: "Atlas Markdown Table",
    version: "1",
    jsonSchema: { type: "object", required: ["headers", "rows"] },
    requiredFields: ["headers", "rows"],
    identityFields: [],
    confidenceThreshold: 0.85,
    conflictKeys: []
  }
];

const schemaContractsById = new Map(builtInSchemaContracts.map((contract) => [contract.id, contract]));

export interface ExtractStructuredOptions {
  extractors?: readonly Extractor[] | undefined;
  schemaContracts?: readonly StructuredSchemaContract[] | undefined;
}

export class SchemaContractRegistry {
  private readonly contracts = new Map<string, StructuredSchemaContract>();

  constructor(initialContracts: readonly StructuredSchemaContract[] = builtInSchemaContracts) {
    for (const contract of initialContracts) this.register(contract);
  }

  register(contract: StructuredSchemaContract): void {
    this.contracts.set(contract.id, normalizeSchemaContract(contract));
  }

  list(): StructuredSchemaContract[] {
    return [...this.contracts.values()].map(cloneSchemaContract);
  }

  get(id: string): StructuredSchemaContract | undefined {
    const contract = this.contracts.get(id);
    return contract ? cloneSchemaContract(contract) : undefined;
  }
}

export async function extractStructured(input: ExtractorInput, optionsOrExtractors: ExtractStructuredOptions | readonly Extractor[] = {}): Promise<ExtractionCandidate[]> {
  let options: ExtractStructuredOptions;
  if (isExtractorList(optionsOrExtractors)) options = { extractors: optionsOrExtractors };
  else options = optionsOrExtractors;
  const extractors = options.extractors ?? builtInExtractors;
  const registry = new SchemaContractRegistry(options.schemaContracts ?? builtInSchemaContracts);
  const candidates: ExtractionCandidate[] = [];
  for (const extractor of extractors) {
    if (!extractor.supports(input)) continue;
    candidates.push(...await extractor.extract(input));
  }
  return candidates.filter((candidate) => candidate.evidence.length > 0).map((candidate) => validateStructuredCandidate(candidate, registry));
}

export function validateStructuredCandidate(candidate: ExtractionCandidate, registry = new SchemaContractRegistry([...schemaContractsById.values()])): ExtractionCandidate {
  const contract = registry.get(candidate.schemaId);
  if (!contract) throw new StructuredSchemaContractError(`Missing schema contract for ${candidate.schemaId}`, candidate.schemaId);
  if (candidate.confidence < contract.confidenceThreshold) {
    throw new StructuredSchemaContractError(`Candidate confidence ${candidate.confidence} is below ${contract.confidenceThreshold}`, candidate.schemaId);
  }
  const missing = [...contract.requiredFields, ...contract.identityFields].filter((field) => !Object.hasOwn(candidate.data, field));
  if (missing.length > 0) throw new StructuredSchemaContractError(`Candidate is missing required contract fields: ${missing.join(", ")}`, candidate.schemaId);
  return candidate;
}

export function candidateSourceRefs(candidate: ExtractionCandidate, source: SourceRecord): SourceRef[] {
  return candidate.evidence.map((item) => ({
    id: item.sourceId,
    schema: source.schema,
    kind: source.kind,
    locator: item.locator
  }));
}

export function structuredContentHash(candidate: ExtractionCandidate): string {
  return contentHash({ schemaId: candidate.schemaId, objectType: candidate.objectType, data: candidate.data, evidence: candidate.evidence });
}

export function structuredStableId(source: SourceRecord, candidate: ExtractionCandidate): string {
  return stableId("structured_object", { source_id: source.id, schema_id: candidate.schemaId, object_type: candidate.objectType, hash: structuredContentHash(candidate) });
}

function normalizeFieldName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "field";
}

export function normalizeSchemaContract(contract: StructuredSchemaContract): StructuredSchemaContract {
  if (!contract.id.trim()) throw new StructuredSchemaContractError("Schema contract id is required", contract.id);
  if (!contract.name.trim()) throw new StructuredSchemaContractError("Schema contract name is required", contract.id);
  if (!contract.version.trim()) throw new StructuredSchemaContractError("Schema contract version is required", contract.id);
  if (contract.confidenceThreshold < 0 || contract.confidenceThreshold > 1) throw new StructuredSchemaContractError("Schema contract confidenceThreshold must be between 0 and 1", contract.id);
  return {
    ...contract,
    jsonSchema: { ...contract.jsonSchema },
    requiredFields: [...contract.requiredFields],
    identityFields: [...contract.identityFields],
    conflictKeys: [...contract.conflictKeys]
  };
}

function cloneSchemaContract(contract: StructuredSchemaContract): StructuredSchemaContract {
  return normalizeSchemaContract(contract);
}

function isExtractorList(value: ExtractStructuredOptions | readonly Extractor[]): value is readonly Extractor[] {
  return Array.isArray(value);
}

function normalizeScalar(value: string): unknown {
  const trimmed = value.trim();
  if (/^(true|false)$/i.test(trimmed)) return trimmed.toLowerCase() === "true";
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function splitTableRow(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}
