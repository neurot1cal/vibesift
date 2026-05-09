#!/usr/bin/env bash
# scope.sh — record this with: asciinema rec ../casts/scope.cast -c './scope.sh'
# Spins up a fresh repo, scopes a session, and records ~12 seconds.

set -e

SLEEP=0.6
CMD_SLEEP=0.4
TAIL_SLEEP=1.2

type() {
  printf '$ '
  while IFS= read -r -n1 c; do
    printf '%s' "$c"
    sleep 0.025
  done <<< "$1"
  printf '\n'
  sleep "$CMD_SLEEP"
  eval "$1"
  sleep "$SLEEP"
}

cd "$(mktemp -d)"
git init -q
git config user.email demo@vibesift.dev
git config user.name "vibesift demo"

clear

type 'vibesift bootstrap'
type 'vibesift init blue-widget --title "Build a blue widget"'
type 'vibesift scope blue-widget add-constraint "must work offline"'
type 'vibesift scope blue-widget add-constraint "under 50KB total"'
type 'vibesift decide blue-widget --phase scope --text "go static, no backend"'

sleep "$TAIL_SLEEP"
