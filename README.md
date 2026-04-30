# mcpu

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Facoyfellow%2Fmcpu)

`mcpu` is an Artifact-native repo controlled over MCP. GitHub is only the bootstrap seed. After first deploy, source commits live in Cloudflare Artifacts and deploy back to Cloudflare Workers.

## Start here

Click **Deploy to Cloudflare** above to bootstrap the seed into your Cloudflare account.

Or run the seed locally:

```sh
npm install
npm test
npm run dev -- --port 8799
```

Then connect to:

```txt
POST http://localhost:8799/mcp
```

## How-to

### Edit the repo

Call `repo.write` with a path and contents. The edit updates the mutable draft.

### Commit an Artifact

Call `repo.commit` with a message. The draft becomes an immutable Artifact commit.

### Deploy an Artifact

Call `repo.deploy`. The deployer deploys the latest committed Artifact to Cloudflare Workers. GitHub is not in the live loop.

## Reference

Tools:

- `repo.status`
- `repo.ls`
- `repo.read`
- `repo.write`
- `repo.diff`
- `repo.commit`
- `repo.deploy`
- `repo.history`

State:

- `draft` - mutable working tree
- `artifact` - immutable source commit
- `deployment` - Worker version deployed from an Artifact

## Explanation

GitHub gets you to zero. Cloudflare owns everything after.

The demo is intentionally tiny: a live MCP edits a repo-shaped Artifact, commits it, and deploys that Artifact as the next version of itself.
