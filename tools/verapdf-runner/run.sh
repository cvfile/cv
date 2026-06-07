#!/usr/bin/env bash
# Usage: tools/verapdf-runner/run.sh <path/to/file.cv> [3u|3a|3b]
#
# Runs veraPDF (via Docker) over a .cv file and prints the validation report.
# Defaults to PDF/A-3u (the level required by the cv-strict conformance class).

set -euo pipefail

FILE="${1:-}"
FLAVOUR="${2:-3u}"
FORMAT="${VERAPDF_FORMAT:-text}"

# Pin a specific tagged image for reproducible runs (override via VERAPDF_IMAGE).
VERAPDF_IMAGE="${VERAPDF_IMAGE:-verapdf/cli:v1.28.2}"

# Default to the host architecture (fast, native). Set VERAPDF_PLATFORM to
# force one, e.g. VERAPDF_PLATFORM=linux/amd64 on an arm host if needed.
PLATFORM_ARG=()
if [[ -n "${VERAPDF_PLATFORM:-}" ]]; then
  PLATFORM_ARG=(--platform "$VERAPDF_PLATFORM")
fi

if [[ -z "$FILE" ]]; then
  echo "Usage: $0 <path/to/file.cv> [3u|3a|3b]" >&2
  exit 64
fi

if [[ ! -f "$FILE" ]]; then
  echo "File not found: $FILE" >&2
  exit 66
fi

ABS_FILE="$(cd "$(dirname "$FILE")" && pwd)/$(basename "$FILE")"
DIR="$(dirname "$ABS_FILE")"
NAME="$(basename "$ABS_FILE")"

docker run --rm ${PLATFORM_ARG[@]+"${PLATFORM_ARG[@]}"} \
  -v "$DIR:/data" \
  "$VERAPDF_IMAGE" \
  --flavour "$FLAVOUR" \
  --format "$FORMAT" \
  --nonpdfext \
  "/data/$NAME"
