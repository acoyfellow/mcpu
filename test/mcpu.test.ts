import { describe, expect, it } from "vitest";
import { handleTool, type Env } from "../src/index";

class MemoryKV {
  store = new Map<string, string>();
  async get(key: string) { return this.store.get(key) ?? null; }
  async put(key: string, value: string) { this.store.set(key, value); }
}

const env = (): Env => ({ MCPU_KV: new MemoryKV() as any, MCPU_PACK: "mcpu" });

describe("mcpu", () => {
  it("edits, diffs, and commits repo state", async () => {
    const e = env();
    expect(await handleTool(e, "repo.ls", {})).toEqual({ files: ["AGENTS.md", "README.md", "worker.js"] });
    await handleTool(e, "repo.write", { path: "src/index.ts", contents: "export default {}" });
    expect(await handleTool(e, "repo.read", { path: "src/index.ts" })).toEqual({ path: "src/index.ts", contents: "export default {}" });
    const diff: any = await handleTool(e, "repo.diff", {});
    expect(diff.diff).toContain("src/index.ts");
    const commit: any = await handleTool(e, "repo.commit", { message: "teach repo source" });
    expect(commit.ok).toBe(true);
    const history: any = await handleTool(e, "repo.history", {});
    expect(history.artifacts).toHaveLength(1);
    expect(history.artifacts[0].message).toBe("teach repo source");
  });
});
