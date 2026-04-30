import { createTwoFilesPatch } from "diff";
import { artifactConfig, createArtifactCommit, readArtifactsHead, type ArtifactCommit } from "./artifacts";
import { deployArtifactCommit } from "./deploy";

export interface Env {
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

let draft: Files | null = null;
let deployedArtifact: string | null = null;
let lastCommit: ArtifactCommit | null = null;
const toolNames = ["repo.status", "repo.ls", "repo.read", "repo.write", "repo.diff", "repo.commit", "repo.deploy", "repo.history"];

async function head(env: Env) {
  if (!env.ARTIFACTS_REMOTE || !env.ARTIFACTS_TOKEN) return lastCommit;
  return (await readArtifactsHead(artifactConfig(env))) ?? lastCommit;
}

async function getFiles(env: Env): Promise<Files> {
  if (draft) return draft;
  return (await head(env))?.files ?? { ...seed };
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
  const current = await head(env);
  const files = await getFiles(env);
  if (name === "repo.status") return { pack: env.MCPU_PACK ?? "mcpu", version: "0.0.1", storage: "cloudflare-artifacts", bootstrap: "github-only", draftDirty: draft !== null, currentArtifact: current?.id ?? null, deployedArtifact };
  if (name === "repo.ls") return { files: Object.keys(files).sort() };
  if (name === "repo.read") {
    if (!args?.path || !(args.path in files)) throw new Error("file not found");
    return { path: args.path, contents: files[args.path] };
  }
  if (name === "repo.write") {
    if (!args?.path || typeof args.contents !== "string") throw new Error("path and contents required");
    draft = { ...files, [args.path]: args.contents };
    return { ok: true, path: args.path };
  }
  if (name === "repo.diff") return { diff: diffFiles(current?.files ?? seed, files) };
  if (name === "repo.commit") {
    const cfg = artifactConfig(env);
    const commit = await createArtifactCommit(cfg, args?.message || "update mcpu artifact", files);
    lastCommit = commit;
    draft = null;
    return { ok: true, artifact: { id: commit.id, parent: commit.parent, message: commit.message, at: commit.at, pushed: commit.pushed } };
  }
  if (name === "repo.deploy") {
    const commit = current ?? lastCommit;
    if (!commit) throw new Error("nothing committed");
    const deployment = await deployArtifactCommit(env, commit);
    deployedArtifact = commit.id;
    return deployment;
  }
  if (name === "repo.history") return { artifacts: current ? [{ id: current.id, parent: current.parent, message: current.message, at: current.at, pushed: current.pushed }] : [] };
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
