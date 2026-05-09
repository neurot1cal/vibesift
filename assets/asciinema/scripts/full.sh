#!/usr/bin/env bash
# full.sh — the hero clip. All three phases stitched end-to-end (~35 seconds).
# Scope → Sift → Ship without breaks. This is what runs at the top of the README.

set -e

SLEEP=0.5
CMD_SLEEP=0.35
PHASE_SLEEP=0.9
TAIL_SLEEP=1.5

type() {
  printf '$ '
  while IFS= read -r -n1 c; do printf '%s' "$c"; sleep 0.025; done <<< "$1"
  printf '\n'; sleep "$CMD_SLEEP"; eval "$1"; sleep "$SLEEP"
}

cd "$(mktemp -d)"
git init -q
git config user.email demo@vibesift.dev
git config user.name "vibesift demo"

clear

# --- scope ---
type 'vibesift bootstrap'
type 'vibesift init blue-widget --title "Build a blue widget"'
type 'vibesift scope blue-widget add-constraint "must work offline"'
type 'vibesift scope blue-widget add-constraint "under 50KB total"'
type 'vibesift decide blue-widget --phase scope --text "go static, no backend"'
sleep "$PHASE_SLEEP"

# --- sift ---
type 'vibesift advance blue-widget'
type 'vibesift sift blue-widget add-option "vanilla JS"'
type 'vibesift sift blue-widget add-option "Preact"'
type 'vibesift sift blue-widget rationale "vanilla keeps the bundle smallest"'
type 'vibesift decide blue-widget --phase sift --text "vanilla JS"'
sleep "$PHASE_SLEEP"

# --- ship ---
type 'vibesift advance blue-widget'
type 'vibesift ship blue-widget task add "scaffold index.html"'
type 'vibesift ship blue-widget task add "wire color picker"'
type 'vibesift ship blue-widget task done 1'
type 'vibesift status blue-widget'

sleep "$TAIL_SLEEP"
