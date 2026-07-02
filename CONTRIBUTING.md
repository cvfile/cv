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
