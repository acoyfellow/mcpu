# Security

Do not expose `/mcp` publicly with deploy-capable secrets configured.

Before setting any of these secrets, protect the Worker with Cloudflare Access or an equivalent auth layer:

- `ARTIFACTS_TOKEN`
- `CLOUDFLARE_API_TOKEN`

GitHub is only the bootstrap seed. Runtime source changes should happen through Cloudflare Artifacts.

Report security issues privately through GitHub Security Advisories.
