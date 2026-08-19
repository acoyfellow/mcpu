import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createArtifactCommit } from "../src/artifacts";
import { handleTool, rememberCommit, requireVerifiedImprint, type Env } from "../src/index";

const env = (): Env => ({ MCPU_PACK: "mcpu" });

describe("mcpu", () => {
  it("edits and diffs against artifact source without KV", async () => {
    const e = env();
    expect(await handleTool(e, "repo.ls", {})).toEqual({ files: ["AGENTS.md", "README.md", "worker.js"] });
    await handleTool(e, "repo.write", { path: "worker.js", contents: "export default {}" });
    expect(await handleTool(e, "repo.read", { path: "worker.js" })).toEqual({ path: "worker.js", contents: "export default {}" });
    const diff: any = await handleTool(e, "repo.diff", {});
    expect(diff.diff).toContain("worker.js");
    const status: any = await handleTool(e, "repo.status", {});
    expect(status.storage).toBe("cloudflare-artifacts");
    expect(status.draftDirty).toBe(true);
  });

  it("refuses deploy when the imprint is missing or unverified", async () => {
    const dir = join(tmpdir(), `mcpu-imprint-${Date.now()}`);
    await mkdir(join(dir, ".imprint", "releases"), { recursive: true });
    await expect(requireVerifiedImprint({ IMPRINT_DIR: dir }, "missing")).rejects.toThrow("no imprint release");
    await writeFile(
      join(dir, ".imprint", "releases", "bad.json"),
      JSON.stringify({ proof: { verified: false } }),
    );
    await expect(requireVerifiedImprint({ IMPRINT_DIR: dir }, "bad")).rejects.toThrow("not verified");
    await writeFile(
      join(dir, ".imprint", "releases", "good.json"),
      JSON.stringify({ proof: { verified: true } }),
    );
    await expect(requireVerifiedImprint({ IMPRINT_DIR: dir }, "good")).resolves.toBeUndefined();
  });

  it("repo.deploy throws without a verified imprint and dry-runs when verified", async () => {
    const dir = join(tmpdir(), `mcpu-deploy-${Date.now()}`);
    await mkdir(join(dir, ".imprint", "releases"), { recursive: true });
    const commit = {
      id: "slot-good",
      parent: null,
      message: "slot",
      at: new Date().toISOString(),
      files: { "worker.js": "export default { fetch() { return new Response(\"ok\"); } };\n" },
    };
    rememberCommit(commit);
    const e: Env = { MCPU_PACK: "mcpu", IMPRINT_DIR: dir };
    await expect(handleTool(e, "repo.deploy", {})).rejects.toThrow("no imprint release");
    await writeFile(join(dir, ".imprint", "releases", "slot-good.json"), JSON.stringify({ proof: { verified: false } }));
    await expect(handleTool(e, "repo.deploy", {})).rejects.toThrow("not verified");
    await writeFile(join(dir, ".imprint", "releases", "slot-good.json"), JSON.stringify({ proof: { verified: true } }));
    const out: any = await handleTool(e, "repo.deploy", {});
    expect(out.ok).toBe(true);
    expect(out.uploaded).toBe(false);
    expect(out.commit).toBe("slot-good");
    rememberCommit(null);
  });

  it("creates a git commit in Node without indexedDB", async () => {
    const commit = await createArtifactCommit(
      { remote: "file://unused", token: "unused", branch: "main" },
      "node commit",
      { "worker.js": "export default {};\n" },
    );
    expect(commit.id).toMatch(/^[0-9a-f]{40}$/);
    expect(commit.files["worker.js"]).toContain("export default");
    expect(commit.pushed).toBeNull();
  });
});
