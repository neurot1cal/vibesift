---
name: vibesift
description: Drive a vibesift session — produces a static HTML status page in docs/sessions/ that broadcasts the current phase and decision history. The HTML page is the artifact, the terminal is the driver. TRIGGER when the user explicitly asks to start, advance, or close a vibesift session — phrases like "vibesift this", "/scope", "/sift", "/ship", "start a new vibesift session", "advance the session", "ship this session". SKIP for conversational uses of "scope" / "sift" / "ship" that aren't session commands ("scope creep", "out of scope", "what's the scope of this PR", bare "ship it" with no session context, "sift through these logs").
---

# vibesift — Scope, Sift, Ship

vibesift turns terminal-driven design + planning + implementation work into a
single static HTML page per session, committed to the repo. Reviewers read the
page (mobile, dashboard, anywhere) without running anything. The terminal is
the only place changes happen.

## When to use

Trigger when the user wants to start, advance, or close a session of work in
the vibesift sense — meaning they want a tracked, three-phase artifact in
`docs/sessions/<slug>/index.html`. Trigger phrases:

- "vibesift this" / "vibesift the X feature"
- "start a vibesift session" / "new vibesift session"
- "/scope", "/sift", "/ship" as explicit slash commands
- "advance the session" / "advance to sift" / "advance to ship"
- "let's scope this as a vibesift session"
- "ship the vibesift session"

## Do NOT trigger when

These are conversational uses of the same words and are NOT vibesift
sessions. Do not start a session for any of these:

- **"scope creep" / "out of scope" / "in scope"** — these are status
  observations about a PR, not session commands.
- **"what's the scope of this PR" / "what's the scope of the change"** —
  analytic question about a diff, not a request to start a session.
- **"sift through these logs" / "sift through the options"** without prior
  vibesift framing — generic verbs, not session commands.
- **"ship it" / "ship this PR" / "ready to ship"** — generic encouragement
  / merge-readiness, not a `vibesift ship` invocation.
- **"let me scope out this approach"** as casual brainstorming — vibesift
  is for work that has a defined start and end, not exploration.
- **One-shot questions or pure exploration** — ask a question, not a
  session.

When in doubt, ask the user "do you want me to track this as a vibesift
session?" rather than starting one unprompted. Sessions auto-commit, so a
false-positive trigger creates spurious commits the user has to clean up.

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

When the user says something that triggers vibesift (per the trigger list
above):

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
