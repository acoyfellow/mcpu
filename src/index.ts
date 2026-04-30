import { createTwoFilesPatch } from "diff";
import { createArtifactCommit, getHistory, latestCommit, pushToArtifactsRepo } from "./artifacts";
import { deployArtifactCommit } from "./deploy";

export interface Env {
  MCPU_KV: KVNamespace;
  MCPU_PACK?: string;
  ARTIFACTS_REMOTE?: string;
  ARTIFACTS_TOKEN?: string;
  ARTIFACTS_BRANCH?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  MCPU_SCRIPT_NAME?: string;
}

type Files = Record<string, string>;
type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: any };

const seed: Files = {
  "README.md": `# mcpu\n\nTiny, smol, permanent 0.0.1.\n\nGitHub is bootstrap only. After first deploy, mcpu lives in Cloudflare Artifacts and redeploys itself on Cloudflare.\n`,
  "AGENTS.md": `# Agent instructions\n\nKeep mcpu tiny. Version stays 0.0.1 forever.\n\nUse MCP tools to edit, diff, commit an Artifact, and deploy that Artifact.\n`,
  "worker.js": `export default {\n  fetch() {\n    return new Response("mcpu 0.0.1 - artifact-native\\n", { headers: { "content-type": "text/plain; charset=utf-8" } });\n  }\n};\n`,
};

const toolNames = ["repo.status", "repo.ls", "repo.read", "repo.write", "repo.diff", "repo.commit", "repo.deploy", "repo.history"];

export async function getFiles(env: Env): Promise<Files> {
  const raw = await env.MCPU_KV.get("draft");
  return raw ? JSON.parse(raw) : { ...seed };
}

export async function putFiles(env: Env, files: Files) {
  await env.MCPU_KV.put("draft", JSON.stringify(files));
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

function rpc(id: Rpc["id"], result: unknown) {
  return json({ jsonrpc: "2.0", id: id ?? null, result });
}

function rpcError(id: Rpc["id"], code: number, message: string) {
  return json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
}

function diffFiles(base: Files, next: Files) {
  const paths = Array.from(new Set([...Object.keys(base), ...Object.keys(next)])).sort();
  return paths.map((path) => createTwoFilesPatch(path, path, base[path] ?? "", next[path] ?? "", "artifact", "draft")).join("\n").trim();
}

export async function handleTool(env: Env, name: string, args: any) {
  const files = await getFiles(env);
  const head = await latestCommit(env.MCPU_KV);
  if (name === "repo.status") return { pack: env.MCPU_PACK ?? "mcpu", version: "0.0.1", storage: "cloudflare-artifacts", bootstrap: "github-only", draftFiles: Object.keys(files).length, currentArtifact: head?.id ?? null, deployedArtifact: (await env.MCPU_KV.get("deployedArtifact")) ?? null };
  if (name === "repo.ls") return { files: Object.keys(files).sort() };
  if (name === "repo.read") {
    if (!args?.path || !(args.path in files)) throw new Error("file not found");
    return { path: args.path, contents: files[args.path] };
  }
  if (name === "repo.write") {
    if (!args?.path || typeof args.contents !== "string") throw new Error("path and contents required");
    files[args.path] = args.contents;
    await putFiles(env, files);
    return { ok: true, path: args.path };
  }
  if (name === "repo.diff") return { diff: diffFiles(head?.files ?? seed, files) };
  if (name === "repo.commit") {
    const commit = await createArtifactCommit(env.MCPU_KV, args?.message || "update mcpu artifact", files);
    let pushed = null;
    if (env.ARTIFACTS_REMOTE && env.ARTIFACTS_TOKEN) {
      pushed = await pushToArtifactsRepo(commit, { remote: env.ARTIFACTS_REMOTE, token: env.ARTIFACTS_TOKEN, branch: env.ARTIFACTS_BRANCH });
    }
    return { ok: true, artifact: { id: commit.id, parent: commit.parent, message: commit.message, at: commit.at, pushed } };
  }
  if (name === "repo.deploy") {
    const commit = head;
    if (!commit) throw new Error("nothing committed");
    const deployment = await deployArtifactCommit(env, commit);
    await env.MCPU_KV.put("deployedArtifact", commit.id);
    return deployment;
  }
  if (name === "repo.history") return { artifacts: (await getHistory(env.MCPU_KV)).map(({ id, parent, message, at }) => ({ id, parent, message, at })) };
  throw new Error(`unknown tool: ${name}`);
}

async function handleMcp(request: Request, env: Env) {
  const msg = (await request.json()) as Rpc;
  if (msg.method === "initialize") return rpc(msg.id, { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "mcpu", version: "0.0.1" } });
  if (msg.method === "tools/list") return rpc(msg.id, { tools: toolNames.map((name) => ({ name, description: `${name} for this Artifact-backed repo`, inputSchema: { type: "object" } })) });
  if (msg.method === "tools/call") {
    try {
      const out = await handleTool(env, msg.params?.name, msg.params?.arguments || {});
      return rpc(msg.id, { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] });
    } catch (e) { return rpcError(msg.id, -32000, e instanceof Error ? e.message : String(e)); }
  }
  return rpcError(msg.id, -32601, "method not found");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/") return new Response("mcpu 0.0.1 - artifact-native repo over MCP\n", { headers: { "content-type": "text/plain; charset=utf-8" } });
    if (url.pathname === "/files") return json(await getFiles(env));
    if (url.pathname === "/mcp" && request.method === "POST") return handleMcp(request, env);
    return new Response("not found", { status: 404 });
  },
};
