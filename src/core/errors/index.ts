export class AtlasWikiError extends Error { constructor(message: string, readonly code: string, readonly details?: unknown) { super(message); this.name = "AtlasWikiError"; } }
export class ValidationError extends AtlasWikiError { constructor(message: string, details?: unknown) { super(message, "ATLAS_WIKI_VALIDATION", details); } }
export class NotFoundError extends AtlasWikiError { constructor(id: string) { super("Record not found: " + id, "ATLAS_WIKI_NOT_FOUND", { id }); } }
export class AccessDeniedError extends AtlasWikiError { constructor(id: string) { super("Access denied for record: " + id, "ATLAS_WIKI_ACCESS_DENIED", { id }); } }
export class WriteConflictError extends AtlasWikiError {
  constructor(id: string, expectedRevision: number | undefined, actualRevision: number | undefined) {
    super("Write conflict for record: " + id, "ATLAS_WIKI_WRITE_CONFLICT", { id, expectedRevision, actualRevision });
    this.name = "WriteConflictError";
  }
}

export class UnknownRecordSchemaError extends ValidationError {
  constructor(schema: string | undefined) {
    super("Unknown record schema: " + (schema ?? "<missing>"), { schema });
    this.name = "UnknownRecordSchemaError";
  }
}

export class MigrationChecksumError extends AtlasWikiError {
  constructor(id: string, expected: string, actual: string) {
    super("Migration checksum mismatch: " + id, "ATLAS_WIKI_MIGRATION_CHECKSUM", { id, expected, actual });
    this.name = "MigrationChecksumError";
  }
}

export class MigrationOrderError extends AtlasWikiError {
  constructor(id: string, details?: unknown) {
    super("Migration order violation: " + id, "ATLAS_WIKI_MIGRATION_ORDER", details);
    this.name = "MigrationOrderError";
  }
}

export class MissingMigrationError extends AtlasWikiError {
  constructor(id: string) {
    super("Applied migration is missing from package registry: " + id, "ATLAS_WIKI_MISSING_MIGRATION", { id });
    this.name = "MissingMigrationError";
  }
}

export class DatabaseIntegrityError extends AtlasWikiError {
  constructor(findings: string[]) {
    super("Database integrity check failed", "ATLAS_WIKI_DB_INTEGRITY", { findings });
    this.name = "DatabaseIntegrityError";
  }
}
