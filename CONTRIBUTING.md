# Contributing to `.cv`

Thanks for taking the time to contribute. The format is stable (spec `1.0`); breaking spec changes require a new `MAJOR` version (spec §8).

## Development setup

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
```

The Python and Go SDKs have their own test suites:

```bash
cd sdks/python && uv venv && uv pip install -e ".[dev]" && .venv/bin/pytest
cd sdks/go && go test ./...
```

`pnpm test:interop` runs the JS suite against the shared conformance corpus under `spec/test-vectors/` (valid and malicious vectors); the Python and Go suites consume the same corpus, so keep all three green when it changes.

## Project shape

The repo is a pnpm + Turborepo monorepo. JS/TS packages live under `packages/`; Python and Go SDKs live under `sdks/` (their toolchains do not compose with Turbo).

## The site and its AI mode

`docs/` is cvfile.org: a static Astro site, and the API of its AI mode in `docs/server/` (a stateless MCP server
at `/api/mcp` with the docs tools, and the two anonymous counters of `/api/events`). The AI mode runs on each
visitor's own AI account through AI Connect; the tools that read a dropped file run in the page
(`docs/src/features/ai-mode/tools/`), so the file never reaches the server.

```bash
pnpm --filter @cvfile/sdk build && pnpm --filter @cvfile/viewer-web build
cd docs
pnpm build                    # the site, the docs index of the API, and the API bundle
pnpm dev:server               # the API on port 6736 (PORT, SITE_DATA_DIR, SITE_ORIGINS: see .env.example)
pnpm dev                      # the site on port 6737, which sends /api/ to the API
pnpm test && pnpm lint && pnpm typecheck
pnpm pentest --unit           # the guards with the page's policy; --mcp <url> checks a running API
```

`docs/Dockerfile` builds one image with nginx and the static pages, and Node with the API;
`docs/vps/compose.yaml` runs one container of each. cvfile.org deploys from `main`, so a merged pull request
reaches the site with the next deploy.

## Spec changes

Edits to anything under `spec/` require:
1. A clear rationale in the PR description.
2. Updates to the test vectors under `spec/test-vectors/` if behaviour changes.
3. Green runs of `pnpm build` and `pnpm test`, plus the Python and Go suites above, showing all SDKs still round-trip correctly.

## Coding style

- TypeScript: strict mode, single quotes, semicolons, trailing commas, 120 cols.
- Python: `ruff` + `mypy --strict`.
- Go: `gofmt` + `golangci-lint`.

## Reporting security issues

See `SECURITY.md`. Do not open public issues for vulnerabilities.
