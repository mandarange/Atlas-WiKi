import type { AccessPolicy, ActorRef, Permission, SourceRecord, Visibility } from "../records/index.js";
export function defaultAccessPolicy(visibility: Visibility, owner?: string): AccessPolicy {
  const grants: AccessPolicy["grants"] = [];
  if (visibility === "public") grants.push({ principal_type: "everyone", principal_id: "*", permission: "read", effect: "allow" });
  if (visibility === "internal") grants.push({ principal_type: "authenticated", principal_id: "*", permission: "read", effect: "allow" });
  if (owner) { const type = owner.startsWith("team:") ? "team" : "user"; grants.push({ principal_type: type, principal_id: owner, permission: "read", effect: "allow" }, { principal_type: type, principal_id: owner, permission: "write", effect: "allow" }); }
  return { visibility, grants };
}
export function canAccess(policy: AccessPolicy | undefined, actor: ActorRef | undefined, permission: Permission = "read"): boolean {
  if (!policy) return false;
  const principals: Array<{ principal_type: string; principal_id: string }> = [{ principal_type: "everyone", principal_id: "*" }];
  if (actor && actor.type !== "anonymous") principals.push({ principal_type: "authenticated", principal_id: "*" }, { principal_type: "user", principal_id: actor.id });
  for (const group of actor?.groups ?? []) principals.push({ principal_type: "team", principal_id: group });
  for (const role of actor?.roles ?? []) principals.push({ principal_type: "role", principal_id: role });
  const matches = policy.grants.filter((grant) => principals.some((p) => p.principal_type === grant.principal_type && (grant.principal_id === "*" || grant.principal_id === p.principal_id)) && (grant.permission === permission || grant.permission === "admin"));
  if (matches.some((grant) => grant.effect === "deny")) return false;
  return matches.some((grant) => grant.effect === "allow");
}
export function sourcePolicyDecision(source: SourceRecord, actor: ActorRef | undefined): { allowed: boolean; reason: string } { const allowed = canAccess(source.acl, actor, "read"); return { allowed, reason: allowed ? "acl_allow" : "acl_deny_before_context" }; }
