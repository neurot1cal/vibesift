#!/usr/bin/env bash
# ship.sh — picks up after sift, walks the ship phase to completion.
# Standalone-recordable (recreates scope + sift state inline).

set -e

SLEEP=0.6
CMD_SLEEP=0.4
TAIL_SLEEP=1.2

type() {
  printf '$ '
  while IFS= read -r -n1 c; do printf '%s' "$c"; sleep 0.025; done <<< "$1"
  printf '\n'; sleep "$CMD_SLEEP"; eval "$1"; sleep "$SLEEP"
}

cd "$(mktemp -d)"
git init -q
git config user.email demo@vibesift.dev
git config user.name "vibesift demo"
vibesift bootstrap >/dev/null
vibesift init blue-widget --title "Build a blue widget" >/dev/null
vibesift scope blue-widget add-constraint "must work offline" >/dev/null
vibesift scope blue-widget add-constraint "under 50KB total" >/dev/null
vibesift decide blue-widget --phase scope --text "go static, no backend" >/dev/null
vibesift advance blue-widget >/dev/null
vibesift sift blue-widget add-option "vanilla JS" >/dev/null
vibesift sift blue-widget add-option "Preact" >/dev/null
vibesift sift blue-widget add-option "Solid" >/dev/null
vibesift sift blue-widget rationale "vanilla keeps the bundle smallest" >/dev/null
vibesift decide blue-widget --phase sift --text "vanilla JS" >/dev/null

clear

type 'vibesift advance blue-widget'
type 'vibesift ship blue-widget task add "scaffold index.html"'
type 'vibesift ship blue-widget task add "wire color picker"'
type 'vibesift ship blue-widget task add "ship to GitHub Pages"'
type 'vibesift ship blue-widget task done 1'
type 'vibesift ship blue-widget task done 2'
type 'vibesift status blue-widget'

sleep "$TAIL_SLEEP"
