#!/usr/bin/env bash
# convert-all.sh — convert every casts/*.cast into a .gif (via agg) and a
# .svg (via svg-term-cli). Idempotent: skips outputs that already exist
# unless --force is passed.
#
# Setup (one-time):
#   brew install agg                   (cast → gif rasterizer)
#   npm install -g svg-term-cli        (cast → svg, retina-friendly)
#
# Usage:
#   ./convert-all.sh                   # convert any missing outputs
#   ./convert-all.sh --force           # rebuild every gif and svg
#   ./convert-all.sh --gif-only        # only build gifs (skip svg-term)
#   ./convert-all.sh --svg-only        # only build svgs (skip agg)
#
# The published artifacts (committed to the repo) are casts/*.gif and
# casts/*.svg next to the .cast files.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CASTS_DIR="$HERE/casts"

FORCE=0
DO_GIF=1
DO_SVG=1
for arg in "$@"; do
  case "$arg" in
    --force)    FORCE=1 ;;
    --gif-only) DO_SVG=0 ;;
    --svg-only) DO_GIF=0 ;;
    -h|--help)
      sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      printf 'unknown flag: %s\n' "$arg" >&2
      exit 2
      ;;
  esac
done

if [ "$DO_GIF" -eq 1 ] && ! command -v agg >/dev/null 2>&1; then
  printf 'error: agg not on PATH. Install with: brew install agg\n' >&2
  exit 1
fi

if [ "$DO_SVG" -eq 1 ] && ! command -v svg-term >/dev/null 2>&1; then
  printf 'error: svg-term not on PATH. Install with: npm install -g svg-term-cli\n' >&2
  exit 1
fi

if [ ! -d "$CASTS_DIR" ]; then
  printf 'error: %s does not exist. Run ./record-all.sh first.\n' "$CASTS_DIR" >&2
  exit 1
fi

shopt -s nullglob
casts=( "$CASTS_DIR"/*.cast )
if [ "${#casts[@]}" -eq 0 ]; then
  printf 'no .cast files in %s. Run ./record-all.sh first.\n' "$CASTS_DIR" >&2
  exit 1
fi

for cast in "${casts[@]}"; do
  name="$(basename "$cast" .cast)"
  gif="$CASTS_DIR/$name.gif"
  svg="$CASTS_DIR/$name.svg"

  if [ "$DO_GIF" -eq 1 ]; then
    if [ -f "$gif" ] && [ "$FORCE" -eq 0 ]; then
      printf '  skip   %s.gif (already exists; pass --force to rebuild)\n' "$name"
    else
      printf '  agg    %s.gif …\n' "$name"
      agg --cols 100 --rows 30 "$cast" "$gif"
    fi
  fi

  if [ "$DO_SVG" -eq 1 ]; then
    if [ -f "$svg" ] && [ "$FORCE" -eq 0 ]; then
      printf '  skip   %s.svg (already exists; pass --force to rebuild)\n' "$name"
    else
      printf '  svg    %s.svg …\n' "$name"
      svg-term --in "$cast" --out "$svg" --window
    fi
  fi
done

printf '\ndone. outputs in %s\n' "$CASTS_DIR"
