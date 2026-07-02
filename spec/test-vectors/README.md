# .cv test vectors

Shared conformance corpora for third-party implementations of the `.cv` format ([spec/cv-1.0.md](../cv-1.0.md)). The three reference SDKs (JS, Python, Go) run their vector suites against these exact files.

## Corpora

- `valid/`: positive and boundary vectors. A conforming reader **MUST** accept every fixture whose `expected` is `valid` (validation passes, all payloads extract losslessly) and **MUST** produce the documented outcome for the `warning` and `error` fixtures.
- `malicious/`: attack vectors, each a valid `.cv` file with exactly one forbidden construct injected (spec §3.4/§7). A conforming reader **MUST** reject every fixture and **SHOULD** report the listed error code.

## Manifest format

Each corpus ships a `manifest.json` with a `fixtures` array:

- `filename`: the fixture file, relative to the manifest.
- `description`: what the fixture exercises.
- `expectedCode`: the stable issue code a validator must report (`malicious/` always; `valid/` only for `warning` and `error` fixtures).
- `expected` (`valid/` only): `valid`, `warning` (validation still passes, the warning must be surfaced, extraction must not drop payloads, spec §8.3), or `error` (validation must fail).
- `primaryPayload`, `primaryLanguage`, `payloadNames` (`valid/` only, extractable fixtures): the exact metadata and payload set a reader must recover.

## Using the corpora

Iterate the manifests rather than hardcoding filenames; new vectors are added over time. For each fixture, assert that your `validate()` equivalent returns the expected outcome and code, and for accepted files that your `extract()` equivalent returns the payloads listed in the manifest. Notable boundary vectors: `oversized-payload.cv` decodes past the 16 MiB per-payload cap (spec §7.3) while staying tiny on disk, and `future-major.cv` declares `cv:version` 2.0 (spec §8.3 forward compatibility).

## Regenerating

Fixtures are built by the JS SDK (from `packages/sdk-js`):

```bash
pnpm dlx tsx tools/build-valid.ts
pnpm dlx tsx tools/build-malicious.ts
```

A "bad filename" vector is intentionally absent from `valid/`: only the JS SDK currently implements the read-side `filename-not-portable` check, so a shared vector would encode an expectation the other reference SDKs do not yet meet (all three refuse to *produce* such names at pack time).
