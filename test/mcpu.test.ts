import { describe, expect, it } from "vitest";
import { handleTool, type Env } from "../src/index";

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
});
