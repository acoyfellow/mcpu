# Contributing

Keep `mcpu` small.

## Local checks

```sh
npm install
npm test
npx tsc --noEmit
```

## Rules

- GitHub is bootstrap only; do not add a GitHub runtime deploy loop.
- Cloudflare Artifacts are the runtime source of truth.
- Do not add KV, D1, or R2 as a fake commit store.
- Do not expose write/deploy MCP tools without auth.
- Prefer one clear primitive over product surface area.
