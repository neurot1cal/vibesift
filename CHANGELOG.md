# Changelog

All notable changes to vibesift are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.2] — 2026-05-09

### Added

- **Visual flow diagrams in the session HTML.** Two new inline SVGs
  ride along on every rendered page: a 5-stage horizontal pipeline
  (Idea → Scope → Sift → Ship → Deployed) above the navigation, and
  an indented task tree inside the Ship section showing parent →
  child relationships and agent attribution. Both render with
  zero JS and no external resources, scale via `viewBox` to fit
  any viewport, and degrade gracefully on browsers without SVG.
- **`--parent <id>` flag on `vibesift ship <slug> task add`.**
  Subtasks attach to a parent task by id; the tree renderer fans
  them out under their parent. Composes with `--agent <name>` so
  worktree-dispatched work shows up grouped by agent.
- **`vibesift deploy <slug>` command.** Stamps `state.deployedAt`
  and auto-commits as `vibesift: deployed <slug>`. Idempotent —
  the first call wins, subsequent calls log the original timestamp
  and exit clean. The pipeline graphic advances "Ship" → "Deployed"
  on the next render.
- **Schema additions (additive only).** Tasks gain optional
  `parentId` and `agent` fields; root state gains optional
  `deployedAt`. Existing v0.2.x sessions remain byte-identical
  when neither field is set; the renderer treats absent fields
  as the historical default.

### Internal

- Test count: 33 → 79 (46 new tests across schema migration, new
  CLI commands, SVG snapshots for known states, and an end-to-end
  integration covering the full parent + agent + deploy + render
  path).

[0.2.2]: https://github.com/neurot1cal/vibesift/releases/tag/v0.2.2

## [0.2.1] — 2026-05-09

### Fixed

- **Cross-harness skill install was broken in v0.2.0.**
  `package.json#files` didn't include `skills/`, so the canonical
  `SKILL.md` wasn't in the published tarball. `vibesift install` from
  a fresh `npm install -g vibesift` failed with `canonical skill not
  found at .../skills/vibesift/SKILL.md`. Added `skills/` to the
  whitelist and bumped the `pack-audit.yml` expectation in the same
  PR so this can't recur.

[0.2.1]: https://github.com/neurot1cal/vibesift/releases/tag/v0.2.1

## [0.2.0] — 2026-05-09

### Added

- **Collapsible records.** Constraints, options, problem statements, and
  rationale text over 80 chars now render as `<details>` / `<summary>`
  blocks. Default closed; first sentence (or 77-char hard cut) is the
  summary. The page reads at a glance; every supporting detail is one
  click away.
- **`vibesift render <slug>`** — re-render an existing session's HTML
  from its current state without mutating the state. Use after a
  template upgrade.
- **`vibesift index`** — scans `docs/sessions/*` and regenerates the
  landing page's sessions list between `<!-- VIBESIFT:SESSIONS:START -->`
  / `END` markers. Idempotent first-run migration. Auto-commits.
- **`vibesift ship <slug> diff <url>`** — manually set the ship-phase
  diff URL (e.g. a merged PR link, or any non-GitHub repo's diff).
- **`vibesift ship <slug> task add ... --agent <name>`** — optional
  agent attribution per task. Renders as a small `.task-agent` badge
  in the HTML, and `vibesift status` prints a per-agent summary line
  when any tasks have agents.
- **`--no-commit` flag** — opt-in escape hatch on `init`, `scope`,
  `sift`, `ship`, `decide`, `advance`, `render` — writes the file but
  skips the commit. Default behavior unchanged: every mutation
  auto-commits unless explicitly opted out.
- **Real landing page** at `docs/index.html` (status-board /
  monospace-everywhere aesthetic) replacing the bootstrap stub.
  Matches the session pages' theme tokens; one `vibesift:theme`
  localStorage key persists across the landing and session pages.
- **Project `CLAUDE.md`** capturing positioning, invariants, brand
  palette, and scope boundaries for future agent sessions in the repo.

### Changed

- `decide --phase ship` now attempts to upgrade a stale-branch
  `compare/main...feat-branch` diff URL to a stable PR URL via `gh`
  before the head ref disappears. Best-effort; falls through with a
  stderr hint if `gh` isn't installed or no matching PR is found.
- `escapeHtml` is exported from `src/template.js` (was internal).
- README "Why" section reframed around the .md-overload problem.
  Drops the "pre-release" badge for "research-preview" with a direct
  link to issues.

### Fixed

- `docs/sessions/vibesift-com-landing/` diff link 404'd after PR #10
  merged with `--delete-branch`. Hot-fixed in #11; long-term fix
  shipped as the `decide --phase ship` PR upgrade above.

### Security

- **Release supply-chain hardening:**
  - `release.yml` verifies the git tag matches `package.json` version
    before publish.
  - `release.yml` runs `npm pack --dry-run` and `npm audit signatures`
    before publishing.
  - New `pack-audit.yml` runs on every PR + push to main, asserting
    the published tarball's file list matches an explicit whitelist.
    Catches accidentally publishing tests, dotfiles, or secrets.
  - `npm publish --provenance` (since v0.1) — every published tarball
    carries a SLSA L3-grade signature linking back to the GitHub
    Actions run that built it. Verifiable via
    `npm view vibesift@0.2.0 --json | jq .dist.attestations`.

## [0.1.0] — 2026-05-09

### Added

- CLI: `init`, `scope`, `sift`, `ship`, `decide`, `advance`, `status`, `list`, `bootstrap`
- Cross-harness skill installer (`vibesift install`, `vibesift harnesses`) for
  Claude Code, Codex, OpenCode, Cursor Agent, Gemini CLI
- Self-contained HTML template with inline CSS, dark mode, mobile-responsive
- State persisted as JSON `<script>` tag inside the HTML for lossless round-trip
- Auto-commit on every state change
- 16 unit tests (state mutators, HTML rendering, XSS escaping, round-trip)
- Dual MIT / Apache-2.0 license
- Governance: CONTRIBUTING, CODE_OF_CONDUCT, SECURITY policies

[Unreleased]: https://github.com/neurot1cal/vibesift/compare/v0.2.1...HEAD
[0.2.0]: https://github.com/neurot1cal/vibesift/releases/tag/v0.2.0
[0.1.0]: https://github.com/neurot1cal/vibesift/releases/tag/v0.1.0
