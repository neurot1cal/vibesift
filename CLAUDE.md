# vibesift — agent instructions

## Pitch (memorize this)

Brainstorm.md, spec.md, plan.md, implementation.md. Your agent's flow generates
gold content and ships it as walls of markdown nobody on the team opens.
**vibesift renders the same content as one HTML page per session, with every
constraint, option, and decision as a collapsible record — visible at a glance,
expandable for detail.**

When you describe vibesift to anyone (PR descriptions, social copy, README
updates, slide decks), this is the lede. Do not soften it into "static HTML
status pages" or "spec-driven development tool" — those describe the form,
not the problem it fixes.

## What the CLI is

A Node 20+ CLI with **zero runtime dependencies**. One file at `src/cli.js`,
helpers at `src/{state,template,git,install}.js`. Tests in `tests/` run via
`node --test`. No bundlers, no transpilers, no devDependencies.

The artifact is `docs/sessions/<slug>/index.html`. It contains the full
state in a `<script type="application/json" id="vibesift-state">` block at
the bottom. Round-trip is lossless and tested.

## Verbs

| Verb     | Records                                          | CLI mutation                                       |
| -------- | ------------------------------------------------ | -------------------------------------------------- |
| Scope    | problem, constraints, scope decision             | `init`, `scope <slug> add-constraint`, `decide --phase scope` |
| Sift     | options, rationale, sift decision                | `sift <slug> add-option`, `sift <slug> rationale`, `decide --phase sift` |
| Ship     | tasks, diff URL, shippedAt                       | `ship <slug> task add`, `ship <slug> task done`, `decide --phase ship` |

`vibesift advance <slug>` walks scope → sift → ship. `vibesift render <slug>`
re-renders the HTML from existing state without changing it; use after a
template upgrade.

## Auto-commit invariant

Every CLI mutation writes to disk **and** auto-commits to the current branch.
The git log IS the audit trail. This is non-negotiable. If a future feature
adds a `--no-commit` flag for preview-before-commit, it must be opt-in;
default behavior stays "every command is one commit."

## HTML invariants

- Inline CSS only. No external stylesheets, no CDN, no fonts loaded over the
  network. The page must render fully offline.
- One inline `<script>` block for the theme toggle. No frameworks.
- State block is OWASP-escaped (`<` → `<`) before embedding.
  `JSON.stringify` alone is **not** sufficient — it doesn't encode `</script>`
  or `<!--`. Tests in `tests/template.test.js` enforce this; do not regress.
- Every record (constraint, option, problem statement, rationale) > 80 chars
  renders as `<details>` / `<summary>` with the first sentence as summary
  and the full text in the body. Decision text itself stays inline.
- Dark mode is primary. Light mode mirrors the same neutrals via
  `[data-theme="light"]`. The theme toggle persists in
  `localStorage["vibesift:theme"]`. The landing and session pages share that
  key so the choice carries across.

## Brand palette (don't drift)

| Variable           | Dark     | Light    | Use                             |
| ------------------ | -------- | -------- | ------------------------------- |
| `--accent`         | `#facc15`| `#facc15`| Sift highlight, pinning, CTA hover |
| `--accent-deep`    | `#ca8a04`| `#ca8a04`| Border-left on details bodies   |
| `--positive`       | `#22c55e`| `#22c55e`| Done tasks, shipped state       |
| `--bg`             | `#09090b`| `#fafafa`| Page background                 |

Yellow is **not** decorative. It marks the one centered verb in the brand
("Sift"), pinned items, and call-to-action hover. Don't yellow-wash buttons.

## When to ship vs. queue

In scope for v0.1:
- Three verbs, auto-commit, HTML artifact, cross-harness skill install,
  collapsible records, dark/light theme, HTTPS-enforced custom domain.

Out of scope for v0.1 (queue as v0.2 sessions):
- `--no-commit` / preview-before-commit flag.
- Auto-generated landing-page sessions list (currently hand-maintained).
- Multi-agent / parallel-team execution for the ship phase. The current
  Anthropic superpowers flow is serial-by-default; vibesift's ship phase
  should eventually orchestrate parallel subagent dispatches and record
  each agent's work in the same HTML record. Significant CLI surface
  change; do as its own session.
- Block-level commenting on the rendered page (separate worker + auth).

## Verifying changes

```bash
npm test                          # 22 unit tests (run before any commit)
node src/cli.js --help            # smoke-check the CLI surface
cd docs && python3 -m http.server # preview docs/ locally; Astro preview is blocked here
```

GitHub Pages serves `/docs` of the default branch. After a merge to main,
the change is live at `https://vibesift.com/` within ~60 seconds.

## Sibling projects

- `https://github.com/neurot1cal/bdigital-public` — open-source plugins from
  the same author. Link from the landing footer and README "Related" section.
