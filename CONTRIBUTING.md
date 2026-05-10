# Contributing to `.cv`

Thanks for taking the time to contribute. The format is in the pre-stable phase (versions `0.x`); breaking changes are possible until `1.0` is stamped.

## Development setup

```bash
pnpm install
pnpm build
pnpm test
```

## Project shape

The repo is a pnpm + Turborepo monorepo. JS/TS packages live under `packages/`; Python and Go SDKs live under `sdks/` (their toolchains do not compose with Turbo).

## Spec changes

Edits to anything under `spec/` require:
1. A clear rationale in the PR description.
2. Updates to the test vectors under `spec/test-vectors/` if behaviour changes.
3. A green run of `pnpm test:interop` showing all SDKs still round-trip correctly.

## Coding style

- TypeScript: strict mode, single quotes, semicolons, trailing commas, 120 cols.
- Python: `ruff` + `mypy --strict`.
- Go: `gofmt` + `golangci-lint`.

## Reporting security issues

See `SECURITY.md`. Do not open public issues for vulnerabilities.
