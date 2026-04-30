import git from "isomorphic-git";
import http from "isomorphic-git/http/web";

export type ArtifactCommit = {
  id: string;
  parent: string | null;
  message: string;
  at: string;
  files: Record<string, string>;
};

export async function getHistory(kv: KVNamespace): Promise<ArtifactCommit[]> {
  const raw = await kv.get("artifact:history");
  return raw ? JSON.parse(raw) : [];
}

export async function putHistory(kv: KVNamespace, history: ArtifactCommit[]) {
  await kv.put("artifact:history", JSON.stringify(history));
}

export async function latestCommit(kv: KVNamespace) {
  return (await getHistory(kv)).at(-1) ?? null;
}

export async function createArtifactCommit(kv: KVNamespace, message: string, files: Record<string, string>) {
  const history = await getHistory(kv);
  const commit: ArtifactCommit = {
    id: crypto.randomUUID(),
    parent: history.at(-1)?.id ?? null,
    message,
    at: new Date().toISOString(),
    files,
  };
  history.push(commit);
  await putHistory(kv, history);
  await kv.put(`artifact:commit:${commit.id}`, JSON.stringify(commit));
  return commit;
}

export async function pushToArtifactsRepo(commit: ArtifactCommit, cfg: { remote: string; token: string; branch?: string }) {
  const LightningFS = (await import("@isomorphic-git/lightning-fs")).default;
  const fs = new LightningFS(`mcpu-${commit.id}`).promises;
  const dir = "/repo";
  await fs.mkdir(dir).catch(() => undefined);
  await git.init({ fs, dir, defaultBranch: cfg.branch ?? "main" });
  for (const [path, contents] of Object.entries(commit.files)) {
    const parts = path.split("/");
    let cur = dir;
    for (const part of parts.slice(0, -1)) {
      cur += `/${part}`;
      await fs.mkdir(cur).catch(() => undefined);
    }
    await fs.writeFile(`${dir}/${path}`, contents, "utf8");
    await git.add({ fs, dir, filepath: path });
  }
  const sha = await git.commit({ fs, dir, message: commit.message, author: { name: "mcpu", email: "mcpu@cloudflare.dev" } });
  await git.addRemote({ fs, dir, remote: "origin", url: cfg.remote });
  await git.push({
    fs,
    http,
    dir,
    remote: "origin",
    ref: cfg.branch ?? "main",
    onAuth: () => ({ username: "x-token", password: cfg.token }),
  });
  return { sha, remote: cfg.remote };
}
