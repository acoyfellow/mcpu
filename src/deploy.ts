import type { ArtifactCommit } from "./artifacts";

export type Deployment = { ok: true; commit: string; script: string; uploaded: boolean; note?: string };

type DeployEnv = {
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  MCPU_SCRIPT_NAME?: string;
};

export async function deployArtifactCommit(env: DeployEnv, commit: ArtifactCommit): Promise<Deployment> {
  const script = env.MCPU_SCRIPT_NAME ?? "mcpu";
  const worker = commit.files["worker.js"];
  if (!worker) throw new Error("artifact commit does not contain worker.js");
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) {
    return { ok: true, commit: commit.id, script, uploaded: false, note: "deploy dry-run: set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN to upload worker.js" };
  }

  const body = new FormData();
  body.append("metadata", new Blob([JSON.stringify({ main_module: "worker.js" })], { type: "application/json" }));
  body.append("worker.js", new Blob([worker], { type: "application/javascript+module" }), "worker.js");

  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${script}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Cloudflare deploy failed ${res.status}: ${text}`);
  return { ok: true, commit: commit.id, script, uploaded: true };
}
