#!/usr/bin/env bash
# Usage: tools/verapdf-runner/run.sh <path/to/file.cv> [3u|3a|3b]
#
# Runs veraPDF (via Docker) over a .cv file and prints the validation report.
# Defaults to PDF/A-3u (the level required by the cv-strict conformance class).

set -euo pipefail

FILE="${1:-}"
FLAVOUR="${2:-3u}"
FORMAT="${VERAPDF_FORMAT:-text}"

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

docker run --rm --platform linux/amd64 \
  -v "$DIR:/data" \
  verapdf/cli:latest \
  --flavour "$FLAVOUR" \
  --format "$FORMAT" \
  --nonpdfext \
  "/data/$NAME"
