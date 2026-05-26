import type { AccessPolicy, ActorRef, AtlasRecord, Permission, PolicyDecision, RecordRef, SourceRecord, Visibility } from "../records/index.js";

export interface AccessDecision extends PolicyDecision {
  allowed: boolean;
  reason: string;
  permission: Permission;
}

export interface PolicyResolverInput {
  record: AtlasRecord;
  actor?: ActorRef | undefined;
  permission?: Permission | undefined;
  purpose?: string | undefined;
  inheritedPolicy?: AccessPolicy | undefined;
}

export function defaultAccessPolicy(visibility: Visibility, owner?: string): AccessPolicy {
  const grants: AccessPolicy["grants"] = [];
  if (visibility === "public") grants.push({ principal_type: "everyone", principal_id: "*", permission: "read", effect: "allow" });
  if (visibility === "internal") grants.push({ principal_type: "authenticated", principal_id: "*", permission: "read", effect: "allow" });
  if (owner) {
    const type = owner.startsWith("team:") ? "team" : "user";
    grants.push(
      { principal_type: type, principal_id: owner, permission: "read", effect: "allow" },
      { principal_type: type, principal_id: owner, permission: "write", effect: "allow" }
    );
  }
  return { visibility, grants };
}

export function canAccess(policy: AccessPolicy | undefined, actor: ActorRef | undefined, permission: Permission = "read"): boolean {
  if (!policy) return false;
  const principals: Array<{ principal_type: string; principal_id: string }> = [{ principal_type: "everyone", principal_id: "*" }];
  if (actor && actor.type !== "anonymous") principals.push({ principal_type: "authenticated", principal_id: "*" }, { principal_type: "user", principal_id: actor.id });
  for (const group of actor?.groups ?? []) principals.push({ principal_type: "team", principal_id: group });
  for (const role of actor?.roles ?? []) principals.push({ principal_type: "role", principal_id: role });
  const matches = policy.grants.filter((grant) =>
    principals.some((p) => p.principal_type === grant.principal_type && (grant.principal_id === "*" || grant.principal_id === p.principal_id)) &&
    (grant.permission === permission || grant.permission === "admin")
  );
  if (matches.some((grant) => grant.effect === "deny")) return false;
  return matches.some((grant) => grant.effect === "allow");
}

export function resolveAccessPolicy(record: AtlasRecord, inheritedPolicy?: AccessPolicy | undefined): AccessPolicy | undefined {
  if ("acl" in record && record.acl) return record.acl;
  if (inheritedPolicy) return inheritedPolicy;
  return undefined;
}

export function canReadRecord(input: Omit<PolicyResolverInput, "permission">): AccessDecision {
  return policyResolver.canRead(input);
}

export const policyResolver = {
  canRead(input: Omit<PolicyResolverInput, "permission">): AccessDecision {
    return this.can({ ...input, permission: "read" });
  },

  can(input: PolicyResolverInput): AccessDecision {
    const permission = input.permission ?? "read";
    const recordRef: RecordRef = { id: input.record.id, schema: input.record.schema, kind: input.record.kind };
    const policy = resolveAccessPolicy(input.record, input.inheritedPolicy);
    const allowed = canAccess(policy, input.actor, permission);
    return {
      record_ref: recordRef,
      allowed,
      reason: allowed ? "acl_allow" : policy ? "acl_deny_before_context" : "deny_by_default_no_policy",
      permission
    };
  }
};

export function sourcePolicyDecision(source: SourceRecord, actor: ActorRef | undefined): { allowed: boolean; reason: string } {
  const decision = policyResolver.canRead({ record: source, actor, purpose: "legacy_source_policy" });
  return { allowed: decision.allowed, reason: decision.reason };
}
