# Security policy

## Reporting a vulnerability

Email `security@cvfile.org` with details. Do not open public GitHub issues for vulnerabilities.

We follow a 90-day coordinated-disclosure window:
- Day 0: report received, ack within 72 hours.
- Day 0–30: triage and fix.
- Day 30–90: coordinated release.
- Day 90: public disclosure.

## Threat model

The format is designed to receive untrusted `.cv` files via email or web. The validator (`cv validate` / `validate()` in every SDK) is the safe entry point for untrusted input.

The following are rejected by the validator and MUST NOT be present in a conformant `.cv`:

- PDF JavaScript actions (`/JS`, `/JavaScript`)
- `/Launch`, `/ImportData`, `/SubmitForm` actions targeting non-mailto URIs
- Encrypted streams (`/Encrypt` dictionary)
- External stream references (`/F` filespecs pointing outside the file)

Viewers render embedded HTML in a sandboxed iframe with no `allow-scripts allow-same-origin`. Markdown is rendered with raw HTML disabled by default.
