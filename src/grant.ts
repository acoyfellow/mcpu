export class GrantDenied extends Error {
  readonly status = 403;
  constructor(message: string) {
    super(message);
    this.name = "GrantDenied";
  }
}

export type Grant = {
  id: string;
  verbs: readonly string[];
  allow: readonly string[];
  deny: readonly string[];
  expiresAt: number;
};

const grants = new Map<string, Grant>();

function globMatch(pattern: string, path: string) {
  if (pattern === path) return true;
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return path === prefix.replace(/\/$/, "") || path.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`);
  }
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -1);
    if (!path.startsWith(prefix)) return false;
    return !path.slice(prefix.length).includes("/");
  }
  return false;
}

export function createGrant(input: { verbs: readonly string[]; allow: readonly string[]; deny?: readonly string[]; ttlMs?: number }): Grant {
  const grant: Grant = {
    id: crypto.randomUUID(),
    verbs: input.verbs,
    allow: input.allow,
    deny: input.deny ?? [],
    expiresAt: Date.now() + (input.ttlMs ?? 30 * 60 * 1000),
  };
  grants.set(grant.id, grant);
  return grant;
}

export function forgetGrant(id: string) {
  grants.delete(id);
}

export function assertGrant(grantId: string | undefined, verb: string, path?: string) {
  if (!grantId) return;
  const grant = grants.get(grantId);
  if (!grant) throw new GrantDenied("grant not found");
  if (Date.now() >= grant.expiresAt) throw new GrantDenied("grant expired");
  if (!grant.verbs.includes(verb)) throw new GrantDenied(`verb ${verb} is not allowed`);
  if (!path) return;
  if (grant.deny.some((rule) => globMatch(rule, path))) throw new GrantDenied(`403 ${path}`);
  if (!grant.allow.some((rule) => globMatch(rule, path))) throw new GrantDenied(`403 ${path}`);
}
