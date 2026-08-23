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

export type GrantStore = {
  put(grant: Grant): Promise<void> | void;
  get(id: string): Promise<Grant | undefined> | Grant | undefined;
  delete(id: string): Promise<void> | void;
};

const memory = new Map<string, Grant>();

export const memoryGrantStore: GrantStore = {
  put(grant) {
    memory.set(grant.id, grant);
  },
  get(id) {
    return memory.get(id);
  },
  delete(id) {
    memory.delete(id);
  },
};

export function forgetGrant(id: string) {
  memory.delete(id);
}

export function forgetAllGrants() {
  memory.clear();
}

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

export function decideGrant(grant: Grant | undefined, verb: string, path?: string) {
  if (!grant) throw new GrantDenied("grant not found");
  if (Date.now() >= grant.expiresAt) throw new GrantDenied("grant expired");
  if (!grant.verbs.includes(verb)) throw new GrantDenied(`verb ${verb} is not allowed`);
  if (!path) return;
  if (grant.deny.some((rule) => globMatch(rule, path))) throw new GrantDenied(`403 ${path}`);
  if (!grant.allow.some((rule) => globMatch(rule, path))) throw new GrantDenied(`403 ${path}`);
}

export async function createGrant(
  input: { verbs: readonly string[]; allow: readonly string[]; deny?: readonly string[]; ttlMs?: number },
  store: GrantStore = memoryGrantStore,
): Promise<Grant> {
  const grant: Grant = {
    id: crypto.randomUUID(),
    verbs: input.verbs,
    allow: input.allow,
    deny: input.deny ?? [],
    expiresAt: Date.now() + (input.ttlMs ?? 30 * 60 * 1000),
  };
  await store.put(grant);
  return grant;
}

export async function assertGrant(grantId: string | undefined, verb: string, path?: string, store: GrantStore = memoryGrantStore) {
  if (!grantId) return;
  decideGrant(await store.get(grantId), verb, path);
}

type DurableStorage = {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
};

type DurableState = { storage: DurableStorage };

export class GrantDO {
  constructor(private readonly state: DurableState) {}

  store(): GrantStore {
    const storage = this.state.storage;
    return {
      async put(grant) {
        await storage.put(`grant:${grant.id}`, grant);
      },
      async get(id) {
        return storage.get<Grant>(`grant:${id}`);
      },
      async delete(id) {
        await storage.delete(`grant:${id}`);
      },
    };
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const store = this.store();
    if (request.method === "PUT" && url.pathname === "/grant") {
      const grant = (await request.json()) as Grant;
      await store.put(grant);
      return Response.json(grant);
    }
    if (request.method === "GET" && url.pathname.startsWith("/grant/")) {
      const grant = await store.get(url.pathname.slice("/grant/".length));
      if (!grant) return Response.json({ error: "grant not found" }, { status: 404 });
      return Response.json(grant);
    }
    return new Response("not found", { status: 404 });
  }
}

export function durableGrantStore(stub: { fetch(input: Request): Promise<Response> }): GrantStore {
  return {
    async put(grant) {
      const res = await stub.fetch(new Request("https://grant/grant", { method: "PUT", body: JSON.stringify(grant) }));
      if (!res.ok) throw new Error("grant store put failed");
    },
    async get(id) {
      const res = await stub.fetch(new Request(`https://grant/grant/${id}`));
      if (res.status === 404) return undefined;
      if (!res.ok) throw new Error("grant store get failed");
      return (await res.json()) as Grant;
    },
    async delete() {
      return;
    },
  };
}

export class MemoryDurableStorage implements DurableStorage {
  private readonly data = new Map<string, unknown>();
  async get<T>(key: string) {
    return this.data.get(key) as T | undefined;
  }
  async put<T>(key: string, value: T) {
    this.data.set(key, value);
  }
  async delete(key: string) {
    return this.data.delete(key);
  }
}
