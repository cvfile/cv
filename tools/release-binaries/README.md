# Release tooling for the `cv` CLI

GoReleaser config lives at `sdks/go/.goreleaser.yml` and produces:

- Cross-compiled binaries for `darwin/amd64`, `darwin/arm64`,
  `linux/amd64`, `linux/arm64`, `windows/amd64`, `windows/arm64`.
- `.tar.gz` archives + a Windows `.zip`.
- SHA-256 checksums + SBOMs.
- Auto-generated Homebrew formula in the `cvfile/homebrew-tap` repo.
- Auto-generated Scoop manifest in the `cvfile/scoop-bucket` repo.
- `.deb` / `.rpm` / `.apk` packages with the file-association payloads
  from `tools/installer-payloads/linux/` baked in.

## Per-release checklist

1. Tag from `sdks/go`:
   ```sh
   cd sdks/go
   git tag cv-go/v0.1.0
   git push origin cv-go/v0.1.0
   ```
2. Run GoReleaser locally (or via CI):
   ```sh
   goreleaser release --clean
   ```
   Requires `GITHUB_TOKEN` (with repo scope) and (for code signing
   on macOS) `MACOS_CERTIFICATE` / `MACOS_CERTIFICATE_PWD`.
3. **WinGet** is *not* automated. After release:
   - Copy `winget/installer-template.yaml` and `winget/manifest-template.yaml`
     to a new `manifests/c/cvfile/cv/<version>/` directory in a fork of
     [microsoft/winget-pkgs](https://github.com/microsoft/winget-pkgs).
   - Substitute `__VERSION__`, `__URL_X64__`, `__SHA256_X64__`,
     `__URL_ARM64__`, `__SHA256_ARM64__` with the GitHub release URLs and
     checksums GoReleaser printed.
   - Open a PR. WinGet's bots usually merge within a day if the manifests
     pass `winget validate`.

## Required external accounts (one-time)

- GitHub org `cvfile` (owns `cvfile/cv`, `cvfile/homebrew-tap`,
  `cvfile/scoop-bucket`).
- Apple Developer ID ($99/yr) for notarised macOS builds.
- Optional: Code-signing cert for Windows (DigiCert, SSL.com, etc.) to
  avoid SmartScreen warnings.
