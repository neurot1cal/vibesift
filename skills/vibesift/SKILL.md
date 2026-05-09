---
name: vibesift
description: Use when the user wants to scope a feature, sift through approaches, or ship a session — produces a static HTML status page in docs/sessions/ that broadcasts the current phase and decision history. The HTML page is the artifact; the terminal is the driver. Trigger when user says "scope", "sift", "ship", "start a session", or "vibesift".
---

# vibesift — Scope, Sift, Ship

vibesift turns terminal-driven design + planning + implementation work into a
single static HTML page per session, committed to the repo. Reviewers read the
page (mobile, dashboard, anywhere) without running anything. The terminal is
the only place changes happen.

## When to use

Trigger when the user wants to start, advance, or close a session of work.
Phrases that activate vibesift:

- "let's scope this"
- "sift through the options"
- "ship this"
- "start a new session"
- "/scope", "/sift", "/ship"

Skip when the user is asking a one-shot question or doing pure exploration —
vibesift is for work that has a defined start and end.

## The three phases

1. **Scope** — name the problem, list constraints, decide the approach in one
   sentence.
2. **Sift** — list the options considered, write the rationale, pick one.
3. **Ship** — break into tasks, mark them done, link the diff.

Each phase persists in `docs/sessions/{slug}/index.html` and auto-commits.

## Canonical commands

The CLI is the single source of truth. All harnesses shell out to it.

```
vibesift bootstrap                                    # one-time per repo
vibesift init <slug> --title "..." [--problem "..."]  # creates the session
vibesift scope <slug> add-constraint "..."
vibesift decide <slug> --phase scope --text "..."
vibesift advance <slug>                               # scope → sift → ship
vibesift sift <slug> add-option "..."
vibesift sift <slug> rationale "..."
vibesift decide <slug> --phase sift --text "..."
vibesift ship <slug> task add "..."
vibesift ship <slug> task done <id>
vibesift status <slug>
vibesift list
```

Slugs are lowercase, hyphenated, max 80 chars (`/^[a-z0-9][a-z0-9-]{0,80}$/`).

## How to drive the flow

When the user says "scope this":

1. If `docs/sessions/` doesn't exist in the repo, run `vibesift bootstrap` first.
2. Pick a slug from the user's framing (e.g., "block-comment-search" →
   `block-comment-search`).
3. Run `vibesift init <slug> --title "<title>" --problem "<one-sentence problem>"`.
4. Ask follow-up questions to gather constraints. Each answer →
   `vibesift scope <slug> add-constraint "..."`.
5. When constraints are exhausted, propose a decision and run
   `vibesift decide <slug> --phase scope --text "..."`.
6. Then `vibesift advance <slug>` to move to sift.

Same shape applies to sift and ship.

## What NOT to do

- Don't write the HTML directly. The CLI is the only writer.
- Don't skip phases. Always go scope → sift → ship.
- Don't create sidecar markdown files for the spec. The HTML page IS the
  spec, plan, and ship log.
- Don't ask the user to commit or push. The CLI auto-commits each change.
- Don't comment on the page from inside the static HTML. Comments are
  out of scope for v1; the page is read-only.

## Reading current state

Use `vibesift status <slug>` to print the current state, or read the
`<script type="application/json" id="vibesift-state">` block at the bottom
of the HTML file directly.

## Sharing the page

Once `docs/sessions/{slug}/index.html` is committed and pushed, GitHub Pages
(serving from `/docs`) makes it available at
`https://{owner}.github.io/{repo}/sessions/{slug}/`. No extra deploy step.
