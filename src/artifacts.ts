import git from "isomorphic-git";
import http from "isomorphic-git/http/web";

export type ArtifactCommit = {
  id: string;
  parent: string | null;
  message: string;
  at: string;
  files: Record<string, string>;
  pushed?: { sha: string; remote: string } | null;
};

export type ArtifactConfig = {
  remote: string;
  token: string;
  branch?: string;
};

export type GitHost = "github" | "gitlab" | "artifacts" | "other";

export function detectGitHost(remote: string): GitHost {
  const host = remote.toLowerCase();
  if (host.includes("artifacts.cloudflare.net")) return "artifacts";
  if (host.includes("github.com") || host.includes("github.")) return "github";
  if (host.includes("gitlab.") || host.includes("gitlab.com")) return "gitlab";
  return "other";
}

export function gitAuth(remote: string, token: string): { username: string; password: string } {
  const host = detectGitHost(remote);
  if (host === "artifacts") return { username: "x-token", password: token };
  if (host === "gitlab") return { username: "oauth2", password: token };
  return { username: "x-access-token", password: token };
}

export function artifactConfig(env: {
  GIT_REMOTE?: string;
  GIT_TOKEN?: string;
  GIT_BRANCH?: string;
  ARTIFACTS_REMOTE?: string;
  ARTIFACTS_TOKEN?: string;
  ARTIFACTS_BRANCH?: string;
}): ArtifactConfig {
  const remote = env.GIT_REMOTE ?? env.ARTIFACTS_REMOTE;
  const token = env.GIT_TOKEN ?? env.ARTIFACTS_TOKEN;
  if (!remote) throw new Error("GIT_REMOTE or ARTIFACTS_REMOTE is required");
  if (!token) throw new Error("GIT_TOKEN or ARTIFACTS_TOKEN is required");
  return { remote, token, branch: env.GIT_BRANCH ?? env.ARTIFACTS_BRANCH ?? "main" };
}

type Workspace = { fs: any; dir: string; cleanup: () => Promise<void> };

async function workspace(): Promise<Workspace> {
  if (typeof (globalThis as { indexedDB?: unknown }).indexedDB === "undefined") {
    const fs = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = await fs.mkdtemp(join(tmpdir(), "mcpu-"));
    return { fs, dir, cleanup: () => fs.rm(dir, { recursive: true, force: true }) };
  }
  const LightningFS = (await import("@isomorphic-git/lightning-fs")).default;
  return { fs: new LightningFS(`mcpu-${crypto.randomUUID()}`).promises, dir: "/repo", cleanup: async () => undefined };
}

async function writeTree(fs: any, dir: string, files: Record<string, string>) {
  await fs.mkdir(dir, { recursive: true }).catch(() => undefined);
  for (const [path, contents] of Object.entries(files)) {
    const parts = path.split("/");
    let cur = dir;
    for (const part of parts.slice(0, -1)) {
      cur += `/${part}`;
      await fs.mkdir(cur, { recursive: true }).catch(() => undefined);
    }
    await fs.writeFile(`${dir}/${path}`, contents, "utf8");
    await git.add({ fs, dir, filepath: path });
  }
}

export async function readArtifactsHead(cfg: ArtifactConfig): Promise<ArtifactCommit | null> {
  const { fs, dir, cleanup } = await workspace();
  try {
    await fs.mkdir(dir, { recursive: true }).catch(() => undefined);
    try {
      await git.clone({ fs, http, dir, url: cfg.remote, singleBranch: true, depth: 1, ref: cfg.branch ?? "main", onAuth: () => gitAuth(cfg.remote, cfg.token) });
    } catch {
      return null;
    }
    const files: Record<string, string> = {};
    async function walk(prefix = "") {
      for (const name of await fs.readdir(`${dir}/${prefix}`)) {
        if (name === ".git") continue;
        const path = prefix ? `${prefix}/${name}` : name;
        const stat = await fs.stat(`${dir}/${path}`);
        if (stat.isDirectory()) await walk(path);
        else files[path] = await fs.readFile(`${dir}/${path}`, "utf8");
      }
    }
    await walk();
    const id = await git.resolveRef({ fs, dir, ref: "HEAD" });
    const log = await git.log({ fs, dir, depth: 1 });
    return { id, parent: log[0]?.commit.parent[0] ?? null, message: log[0]?.commit.message.trim() ?? "", at: new Date((log[0]?.commit.committer.timestamp ?? 0) * 1000).toISOString(), files, pushed: { sha: id, remote: cfg.remote } };
  } finally {
    await cleanup();
  }
}

export async function createArtifactCommit(cfg: ArtifactConfig, message: string, files: Record<string, string>): Promise<ArtifactCommit> {
  const { fs, dir, cleanup } = await workspace();
  try {
    await fs.mkdir(dir, { recursive: true }).catch(() => undefined);
    let parent: string | null = null;
    try {
      await git.clone({ fs, http, dir, url: cfg.remote, singleBranch: true, depth: 1, ref: cfg.branch ?? "main", onAuth: () => gitAuth(cfg.remote, cfg.token) });
      parent = await git.resolveRef({ fs, dir, ref: "HEAD" });
    } catch {
      await git.init({ fs, dir, defaultBranch: cfg.branch ?? "main" });
    }
    await writeTree(fs, dir, files);
    const sha = await git.commit({ fs, dir, message, author: { name: "mcpu", email: "mcpu@cloudflare.dev" } });
    const canPush = /^https?:\/\//.test(cfg.remote);
    if (canPush) {
      await git.addRemote({ fs, dir, remote: "origin", url: cfg.remote }).catch(() => undefined);
      await git.push({ fs, http, dir, remote: "origin", ref: cfg.branch ?? "main", onAuth: () => gitAuth(cfg.remote, cfg.token) });
    }
    return { id: sha, parent, message, at: new Date().toISOString(), files, pushed: canPush ? { sha, remote: cfg.remote } : null };
  } finally {
    await cleanup();
  }
}
