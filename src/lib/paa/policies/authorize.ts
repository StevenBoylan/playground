import { getOrganization } from "../organizations";
import type { AuthorizedContext, Capability, Session } from "../schemas/capability";
import type { PolicyCheck } from "../schemas/trace";

type AnyCapability = Pick<Capability<unknown, unknown>, "id" | "organizationId" | "requiredPermission" | "scopeField">;

export type AccessDecision =
  | { allowed: true; context: AuthorizedContext; checks: PolicyCheck[] }
  | { allowed: false; checks: PolicyCheck[] };

export type ScopeDecision =
  | { allowed: true; input: Record<string, unknown>; checks: PolicyCheck[] }
  | { allowed: false; checks: PolicyCheck[] };

function deny(check: string, detail: string, prior: PolicyCheck[] = []): { allowed: false; checks: PolicyCheck[] } {
  return { allowed: false, checks: [...prior, { check, status: "denied", detail }] };
}

/** Step one: is this session allowed to call this capability at all? */
export function authorizeAccess(session: Session, capability: AnyCapability | undefined): AccessDecision {
  if (!capability) return deny("capability", "Unknown capability");

  const org = getOrganization(session.organizationId);
  if (!org) return deny("organization", "Unknown organization");

  const checks: PolicyCheck[] = [];
  if (capability.organizationId !== session.organizationId) {
    return deny("organization", "Capability belongs to a different organization", checks);
  }
  checks.push({ check: "organization", status: "allowed", detail: `Capability belongs to ${org.name}` });

  const role = org.roles.find((r) => r.id === session.roleId);
  if (!role) return deny("role", "Unknown role", checks);

  if (!role.permissions.includes(capability.requiredPermission)) {
    return deny("permission", `Role "${role.label}" lacks ${capability.requiredPermission}`, checks);
  }
  checks.push({
    check: "permission",
    status: "allowed",
    detail: `Role "${role.label}" holds ${capability.requiredPermission}`,
  });

  return {
    allowed: true,
    checks,
    context: {
      organizationId: org.id,
      roleId: role.id,
      permissions: role.permissions,
      scope: role.scope,
    },
  };
}

/**
 * Step two: apply data scope to validated input. Out-of-scope requests are denied;
 * unrestricted requests are narrowed to the role's scope. Services also filter by scope themselves.
 */
export function applyScope(
  context: AuthorizedContext,
  capability: AnyCapability,
  input: Record<string, unknown>,
  prior: PolicyCheck[],
): ScopeDecision {
  const field = capability.scopeField;
  if (!field || context.scope.factoryIds === "all") return { allowed: true, input, checks: prior };

  const allowedIds = context.scope.factoryIds;
  const requested = input[field];

  if (typeof requested === "string" && !allowedIds.includes(requested)) {
    return deny("data scope", `Role may not access ${field} "${requested}"`, prior);
  }
  if (requested === undefined && allowedIds.length === 1) {
    return {
      allowed: true,
      input: { ...input, [field]: allowedIds[0] },
      checks: [
        ...prior,
        { check: "data scope", status: "narrowed", detail: `Query narrowed to ${field} "${allowedIds[0]}" for this role` },
      ],
    };
  }
  return {
    allowed: true,
    input,
    checks: [...prior, { check: "data scope", status: "allowed", detail: `Within permitted ${field} scope` }],
  };
}
