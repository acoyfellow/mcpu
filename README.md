# mcpu

Give an agent a git remote. Do not give it a shell.

This Worker lists files, shows one file, accepts MCP tool calls, holds a draft in memory, can commit that draft, and can deploy `worker.js` only when an imprint release is verified.

Version stays `0.0.1`.

## What you can do now

Open the Worker origin.

- `GET /` — HTML. File names on the left. One file on the right. No terminal.
- `GET /ls` — `{ "files": [...] }`.
- `GET /read?path=README.md` — `{ "path", "contents" }`.
- `POST /mcp` — `initialize`, `tools/list`, `tools/call`.

Tools: `repo.status`, `repo.ls`, `repo.read`, `repo.write`, `repo.diff`, `repo.commit`, `repo.deploy`, `repo.history`, `grant.create`.

With no remote, the tree is `AGENTS.md`, `README.md`, `worker.js`.

`repo.write` dirties a process draft. `repo.commit` builds a git commit on an in-memory workspace. A `file://` remote does not push. `repo.deploy` refuses unless `.imprint/releases/<sha>.json` has `proof.verified: true`. Without Cloudflare upload secrets it returns `uploaded: false`.

`grant.create` stores verbs and paths. A later call that sends `grant` may write `docs/**` and gets `403` on `README.md`. A call with no grant is not checked.

## What this is not

- There is no Access check in this Worker.
- There is no `doctor`, no `/health`, no `mcpu-bridge` in this repo.
- There is no open/close session and no Durable Object draft.
- The agent can still push if you point it at an `https` remote. Default branch is not protected here.
- Write and deploy are not separate secrets.
- The face does not write, commit, or send a grant.
- `src/mcp.ts` (stdio) is local only. It is not in git.

## Run

```sh
bun test
bun scripts/face-proof.mjs
npx tsc --noEmit
```

`face-proof.mjs` plants `GIT_TOKEN=leak-me` and fails if that string appears in `/`, `/ls`, or `/read`.

## Bindings

`wrangler.jsonc` binds Durable Object class `GrantDO` as `GRANT` (sqlite migration `v1-grant`). Tests inject a store. They do not call `env.GRANT`.

Set `GIT_REMOTE` / `GIT_TOKEN` (or the older `ARTIFACTS_*` names) when you want a real remote. Set `IMPRINT_DIR` before `repo.deploy`.
