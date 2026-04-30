# mcpu

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Facoyfellow%2Fmcpu)

`mcpu` is an MCP control surface for a Cloudflare Artifacts repo. GitHub is only the bootstrap seed. After first deploy, source commits live in Cloudflare Artifacts and deploy back to Cloudflare Workers.

## Start here

### 1. Deploy to your Cloudflare account

Click **Deploy to Cloudflare** above and finish the deploy flow.

When it completes, copy your Worker URL. It will look like:

```txt
https://mcpu.<your-subdomain>.workers.dev
```

If you deploy with `workers_dev = false`, use the route or custom domain you configured instead.

### 2. Add secrets for the Artifact loop

`mcpu` needs an Artifacts Git remote and token before `repo.commit` can push source to Cloudflare Artifacts.

Set these Worker secrets/vars in your account:

```txt
ARTIFACTS_REMOTE=https://<account-id>.artifacts.cloudflare.net/git/default/mcpu.git
ARTIFACTS_TOKEN=art_v1_...
ARTIFACTS_BRANCH=main
MCPU_SCRIPT_NAME=mcpu
CLOUDFLARE_ACCOUNT_ID=<account-id>
CLOUDFLARE_API_TOKEN=<token that can edit Workers>
```

GitHub is not used after bootstrap.

### 3. Add mcpu to your MCP config

Use your deployed Worker URL plus `/mcp`.

```json
{
  "mcpServers": {
    "mcpu": {
      "url": "https://mcpu.<your-subdomain>.workers.dev/mcp"
    }
  }
}
```

For a custom domain:

```json
{
  "mcpServers": {
    "mcpu": {
      "url": "https://mcpu.example.com/mcp"
    }
  }
}
```

### 4. Try it

Ask your agent:

```txt
Connect to mcpu. Run repo.status, list files, read worker.js, change the homepage text, show the diff, commit it, and deploy it.
```

Expected loop:

```txt
repo.write -> repo.diff -> repo.commit -> Cloudflare Artifacts -> repo.deploy -> Cloudflare Workers
```

## Local development

Run the seed locally:

```sh
npm install
npm test
npm run dev -- --port 8799
```

Then connect to:

```txt
http://localhost:8799/mcp
```

Local MCP config:

```json
{
  "mcpServers": {
    "mcpu-local": {
      "url": "http://localhost:8799/mcp"
    }
  }
}
```

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
- `artifact` - immutable source commit in Cloudflare Artifacts
- `deployment` - Worker version deployed from an Artifact

## Explanation

GitHub gets you to zero. Cloudflare owns everything after.

The demo is intentionally tiny: a live MCP edits a Cloudflare Artifacts repo, commits it, and deploys that Artifact as the next version of itself.

## Relationship to nearby projects

- **Cloudflare Artifacts** stores the repo. `mcpu` does not replace Artifacts; it gives one Artifacts repo an MCP control surface.
- **a0** applies the broader Artifacts + gates + promotion pattern to agent skills.
- **artifact-spec** explores eval-backed artifact formats and promotion rules.
- **mcpu** stays smaller: connect to one Artifacts repo, edit it over MCP, commit, deploy, rollback.
