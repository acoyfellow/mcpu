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

export function artifactConfig(env: { ARTIFACTS_REMOTE?: string; ARTIFACTS_TOKEN?: string; ARTIFACTS_BRANCH?: string }): ArtifactConfig {
  if (!env.ARTIFACTS_REMOTE) throw new Error("ARTIFACTS_REMOTE is required");
  if (!env.ARTIFACTS_TOKEN) throw new Error("ARTIFACTS_TOKEN is required");
  return { remote: env.ARTIFACTS_REMOTE, token: env.ARTIFACTS_TOKEN, branch: env.ARTIFACTS_BRANCH ?? "main" };
}

async function memfs() {
  const LightningFS = (await import("@isomorphic-git/lightning-fs")).default;
  return new LightningFS(`mcpu-${crypto.randomUUID()}`).promises;
}

async function writeTree(fs: any, dir: string, files: Record<string, string>) {
  await fs.mkdir(dir).catch(() => undefined);
  for (const [path, contents] of Object.entries(files)) {
    const parts = path.split("/");
    let cur = dir;
    for (const part of parts.slice(0, -1)) {
      cur += `/${part}`;
      await fs.mkdir(cur).catch(() => undefined);
    }
    await fs.writeFile(`${dir}/${path}`, contents, "utf8");
    await git.add({ fs, dir, filepath: path });
  }
}

export async function readArtifactsHead(cfg: ArtifactConfig): Promise<ArtifactCommit | null> {
  const fs = await memfs();
  const dir = "/repo";
  await fs.mkdir(dir).catch(() => undefined);
  try {
    await git.clone({ fs, http, dir, url: cfg.remote, singleBranch: true, depth: 1, ref: cfg.branch ?? "main", onAuth: () => ({ username: "x-token", password: cfg.token }) });
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
}

export async function createArtifactCommit(cfg: ArtifactConfig, message: string, files: Record<string, string>): Promise<ArtifactCommit> {
  const fs = await memfs();
  const dir = "/repo";
  await fs.mkdir(dir).catch(() => undefined);
  let parent: string | null = null;
  try {
    await git.clone({ fs, http, dir, url: cfg.remote, singleBranch: true, depth: 1, ref: cfg.branch ?? "main", onAuth: () => ({ username: "x-token", password: cfg.token }) });
    parent = await git.resolveRef({ fs, dir, ref: "HEAD" });
  } catch {
    await git.init({ fs, dir, defaultBranch: cfg.branch ?? "main" });
  }
  await writeTree(fs, dir, files);
  const sha = await git.commit({ fs, dir, message, author: { name: "mcpu", email: "mcpu@cloudflare.dev" } });
  await git.addRemote({ fs, dir, remote: "origin", url: cfg.remote }).catch(() => undefined);
  await git.push({ fs, http, dir, remote: "origin", ref: cfg.branch ?? "main", onAuth: () => ({ username: "x-token", password: cfg.token }) });
  return { id: sha, parent, message, at: new Date().toISOString(), files, pushed: { sha, remote: cfg.remote } };
}
