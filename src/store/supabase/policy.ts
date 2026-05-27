import type { ActorRef, SourceRecord } from "../../core/records/index.js";

export function actorRlsClaims(actor: ActorRef | undefined): Record<string, unknown> {
  return {
    atlas_actor_id: actor?.id ?? "anonymous",
    atlas_actor_type: actor?.type ?? "anonymous",
    atlas_actor_groups: actor?.groups ?? [],
    atlas_actor_roles: actor?.roles ?? []
  };
}

export function sourceAclRows(source: SourceRecord): Array<Record<string, unknown>> {
  return source.acl.grants.map((grant) => ({
    record_id: source.id,
    principal_type: grant.principal_type,
    principal_id: grant.principal_id,
    effect: grant.effect,
    permission: grant.permission
  }));
}
