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

1. Tag from the repo root (the prefix `sdks/go/` doubles as the Go module
   tag and the trigger for the `release-cv-cli` workflow; the workflow
   strips the prefix and the GitHub release itself is published under the
   plain `vX.Y.Z` tag):
   ```sh
   git tag sdks/go/v0.3.1
   git push origin sdks/go/v0.3.1
   ```
2. Run GoReleaser locally (or via CI):
   ```sh
   goreleaser release --clean
   ```
   Requires `GITHUB_TOKEN` (with repo scope) and (for code signing
   on macOS) `MACOS_CERTIFICATE` / `MACOS_CERTIFICATE_PWD`.
3. **WinGet** is *not* automated. The three manifest templates in
   `winget/` follow Microsoft's canonical filenames (`cvfile.cv.yaml`,
   `cvfile.cv.installer.yaml`, `cvfile.cv.locale.en-US.yaml`), so they
   drop straight into a winget-pkgs PR. After release:
   - Fork [microsoft/winget-pkgs](https://github.com/microsoft/winget-pkgs)
     and create the directory `manifests/c/cvfile/cv/<version>/`.
   - Copy all three files from `winget/` into that directory.
   - In every file, replace `__VERSION__` with the release version
     (without the `v` prefix, e.g. `0.3.1`). In the installer manifest,
     also replace `__RELEASE_DATE__` (ISO 8601), `__URL_X64__`,
     `__SHA256_X64__`, `__URL_ARM64__`, `__SHA256_ARM64__` with the
     values from the GitHub release page.
   - Validate locally with `winget validate <dir>` (Windows only). If
     `wingetcreate update cvfile.cv` is available it does this in one
     command.
   - Open a PR. Microsoft's validation bots usually merge within a day.

   Releases are published under the plain `vX.Y.Z` tag (the `sdks/go/`
   prefix is only the trigger tag and never appears in release URLs), so
   the asset download URLs look like:
   `https://github.com/cvfile/cv/releases/download/vX.Y.Z/cv_X.Y.Z_windows_x86_64.zip`
   and
   `https://github.com/cvfile/cv/releases/download/vX.Y.Z/cv_X.Y.Z_windows_arm64.zip`.
   Copy them verbatim from the release page's "Assets" section.

   One-command alternative (after the release assets are live):
   ```sh
   wingetcreate update cvfile.cv \
     --version 0.3.1 \
     --urls "https://github.com/cvfile/cv/releases/download/v0.3.1/cv_0.3.1_windows_x86_64.zip" \
            "https://github.com/cvfile/cv/releases/download/v0.3.1/cv_0.3.1_windows_arm64.zip" \
     --submit
   ```
   `wingetcreate` computes the SHA-256 values itself and opens the
   winget-pkgs PR for you (requires a `--token` or a cached GitHub login).

## Required external accounts (one-time)

- GitHub org `cvfile` (owns `cvfile/cv`, `cvfile/homebrew-tap`,
  `cvfile/scoop-bucket`).
- Apple Developer ID ($99/yr) for notarised macOS builds.
- Optional: Code-signing cert for Windows (DigiCert, SSL.com, etc.) to
  avoid SmartScreen warnings.
