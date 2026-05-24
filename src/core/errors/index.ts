export class AtlasWikiError extends Error { constructor(message: string, readonly code: string, readonly details?: unknown) { super(message); this.name = "AtlasWikiError"; } }
export class ValidationError extends AtlasWikiError { constructor(message: string, details?: unknown) { super(message, "ATLAS_WIKI_VALIDATION", details); } }
export class NotFoundError extends AtlasWikiError { constructor(id: string) { super("Record not found: " + id, "ATLAS_WIKI_NOT_FOUND", { id }); } }
export class AccessDeniedError extends AtlasWikiError { constructor(id: string) { super("Access denied for record: " + id, "ATLAS_WIKI_ACCESS_DENIED", { id }); } }
