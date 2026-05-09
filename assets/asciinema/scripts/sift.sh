#!/usr/bin/env bash
# sift.sh — picks up where scope.sh left off, sifts through options.
# Standalone-recordable (recreates the scope state inline).

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

clear

type 'vibesift advance blue-widget'
type 'vibesift sift blue-widget add-option "vanilla JS"'
type 'vibesift sift blue-widget add-option "Preact"'
type 'vibesift sift blue-widget add-option "Solid"'
type 'vibesift sift blue-widget rationale "vanilla keeps the bundle smallest"'
type 'vibesift decide blue-widget --phase sift --text "vanilla JS"'

sleep "$TAIL_SLEEP"
