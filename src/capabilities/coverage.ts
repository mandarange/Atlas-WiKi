export type CapabilityArea = "db" | "store" | "ingest" | "retrieve-index";
export type CapabilityStage = "implemented" | "typed_contract" | "adapter_placeholder";

export interface CapabilitySpec {
  area: CapabilityArea;
  name: string;
  stage: CapabilityStage;
  artifact: string;
  releaseGate: string;
  securityReview: "default_secure";
}

const dbNames = [
  "ConnectionManager",
  "MigrationRunner",
  "TransactionManager",
  "RecordRepository",
  "SourceRepository",
  "ChunkRepository",
  "ClaimRepository",
  "EntityRepository",
  "RelationRepository",
  "PolicyRepository",
  "AclRepository",
  "AuditRepository",
  "ProposalRepository",
  "ConflictRepository",
  "BackupManager",
  "RestoreManager",
  "FtsIndexRepository",
  "GraphProjectionRepository",
  "EmbeddingCacheRepository",
  "BlobRepository",
  "ConfigRepository",
  "DoctorCheck",
  "IntegrityChecker",
  "JsonExportRepository",
  "JsonImportRepository",
  "WalCheckpointManager",
  "BusyRetryPolicy",
  "TombstoneManager",
  "RevisionManager",
  "DbPathResolver"
] as const;

const storeNames = [
  "SQLiteStore",
  "MemoryStore",
  "JsonExportStore",
  "StoreContract",
  "StoreErrorMapper",
  "StoreEventBus",
  "StoreMetrics",
  "StoreTestHarness",
  "PostgresAdapterPlaceholder",
  "ObjectStorageAdapterPlaceholder"
] as const;

const ingestNames = [
  "LocalFileIngest",
  "MarkdownParser",
  "TextParser",
  "JsonParser",
  "JsonlParser",
  "CsvParser",
  "HtmlParser",
  "PdfParserPlaceholder",
  "DocxParserPlaceholder",
  "Chunker",
  "ChunkHashing",
  "SourceDeduper",
  "ClaimCandidateExtractor",
  "EntityExtractor",
  "RelationExtractor",
  "ManualClaimEditor",
  "IngestPlanner",
  "IngestDryRun",
  "BlobWriter",
  "ExtractedTextWriter",
  "ConnectorContract",
  "ConnectorCursor",
  "ConnectorAclSnapshot",
  "ConnectorDeletionSync",
  "GoogleDriveConnectorPlaceholder",
  "SlackConnectorPlaceholder",
  "NotionConnectorPlaceholder",
  "Microsoft365ConnectorPlaceholder",
  "ConfluenceConnectorPlaceholder",
  "JiraConnectorPlaceholder",
  "ZendeskConnectorPlaceholder"
] as const;

const retrieveNames = [
  "QueryNormalizer",
  "FtsSearch",
  "HybridSearchPlanner",
  "VectorAdapterContract",
  "EmbeddingProviderContract",
  "EmbeddingCache",
  "GraphExpansion",
  "EntityResolver",
  "OwnerResolver",
  "FreshnessAnnotator",
  "ConflictAnnotator",
  "PermissionFilteredRetriever",
  "Reranker",
  "CitationBuilder",
  "SourceLocatorResolver",
  "ContextPackBuilder",
  "ContextPackCompressor",
  "ContextPackCache",
  "SearchExplain",
  "NoResultPolicy",
  "DeniedResultPolicy",
  "RetrievalAudit",
  "RetrievalEval",
  "RecallPrecisionMetrics",
  "KoreanSearchFixture",
  "EnglishSearchFixture",
  "MixedLanguageFixture",
  "TypoTolerance",
  "SynonymRegistry",
  "QueryIntentClassifier"
] as const;

const implemented = new Set([
  "ConnectionManager",
  "MigrationRunner",
  "TransactionManager",
  "RecordRepository",
  "SourceRepository",
  "ChunkRepository",
  "AclRepository",
  "AuditRepository",
  "ProposalRepository",
  "BackupManager",
  "FtsIndexRepository",
  "ConfigRepository",
  "DoctorCheck",
  "IntegrityChecker",
  "JsonExportRepository",
  "WalCheckpointManager",
  "RevisionManager",
  "DbPathResolver",
  "SQLiteStore",
  "MemoryStore",
  "JsonExportStore",
  "StoreContract",
  "StoreTestHarness",
  "LocalFileIngest",
  "MarkdownParser",
  "TextParser",
  "JsonParser",
  "JsonlParser",
  "CsvParser",
  "Chunker",
  "ChunkHashing",
  "SourceDeduper",
  "IngestPlanner",
  "IngestDryRun",
  "ExtractedTextWriter",
  "QueryNormalizer",
  "FtsSearch",
  "HybridSearchPlanner",
  "FreshnessAnnotator",
  "ConflictAnnotator",
  "PermissionFilteredRetriever",
  "CitationBuilder",
  "ContextPackBuilder",
  "SearchExplain",
  "NoResultPolicy",
  "DeniedResultPolicy",
  "RetrievalAudit",
  "KoreanSearchFixture",
  "EnglishSearchFixture",
  "MixedLanguageFixture"
]);

function stageFor(name: string): CapabilityStage {
  if (name.includes("Placeholder") || name.includes("AdapterContract") || name.includes("ProviderContract")) return "adapter_placeholder";
  return implemented.has(name) ? "implemented" : "typed_contract";
}

function artifactFor(area: CapabilityArea): string {
  if (area === "db") return "src/db; src/store/sqlite-store.ts; docs/sqlite-storage.md";
  if (area === "store") return "src/store; docs/storage.md";
  if (area === "ingest") return "src/ingest; docs/ingestion.md";
  return "src/store/sqlite-store.ts; docs/retrieval.md";
}

function specs(area: CapabilityArea, names: readonly string[]): CapabilitySpec[] {
  return names.map((name) => ({
    area,
    name,
    stage: stageFor(name),
    artifact: artifactFor(area),
    releaseGate: "tests/capability-coverage.test.ts plus release:check",
    securityReview: "default_secure"
  }));
}

export const atlasCapabilitySpecs: readonly CapabilitySpec[] = [
  ...specs("db", dbNames),
  ...specs("store", storeNames),
  ...specs("ingest", ingestNames),
  ...specs("retrieve-index", retrieveNames)
];

export function capabilityKey(area: string, name: string): string {
  return `${area}/${name}`;
}

export function findCapabilitySpec(area: string, name: string): CapabilitySpec | undefined {
  return atlasCapabilitySpecs.find((spec) => capabilityKey(spec.area, spec.name) === capabilityKey(area, name));
}
