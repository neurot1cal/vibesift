<pre>
██╗   ██╗██╗██████╗ ███████╗███████╗██╗███████╗████████╗
██║   ██║██║██╔══██╗██╔════╝██╔════╝██║██╔════╝╚══██╔══╝
██║   ██║██║██████╔╝█████╗  ███████╗██║█████╗     ██║
╚██╗ ██╔╝██║██╔══██╗██╔══╝  ╚════██║██║██╔══╝     ██║
 ╚████╔╝ ██║██████╔╝███████╗███████║██║██║        ██║
  ╚═══╝  ╚═╝╚═════╝ ╚══════╝╚══════╝╚═╝╚═╝        ╚═╝

Scope.  Sift.  Ship.
</pre>

> **Scope. Sift. Ship.** One CLI. One HTML page per agent session. Read-only. Auto-committed.

[![CI](https://github.com/neurot1cal/vibesift/actions/workflows/ci.yml/badge.svg)](https://github.com/neurot1cal/vibesift/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue.svg)](#license)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-43853d.svg)](package.json)
[![Status](https://img.shields.io/badge/status-research--preview-orange.svg)](https://github.com/neurot1cal/vibesift/issues)

> **Research preview.** v0.1 is the first public cut. Shape, defaults, and
> CLI surface are still moving. Open for feedback and contributors —
> [open an issue](https://github.com/neurot1cal/vibesift/issues/new) or send a PR.

`brainstorm.md`, `spec.md`, `plan.md`, `implementation.md`. Your AI sessions
generate dense, structured thinking and ship it as walls of markdown nobody
on your team opens. vibesift takes the same content and renders it as one
HTML page per session: every constraint, option, and decision is a
collapsible record. The page reads at a glance, every detail one click away.

```bash
npx vibesift bootstrap                                    # one-time per repo
npx vibesift init my-feature --title "Build the thing"
npx vibesift scope my-feature add-constraint "must work offline"
npx vibesift advance my-feature
# … each command auto-commits to your current branch
```

---

## Why

The brainstorm/spec/design/implementation flow from agentic toolchains
(Anthropic superpowers, GitHub Spec Kit, Kiro, TaskMaster, BMAD) produces
gold content and ships it as `.md` files nobody reads. The information is
there, structured, well-reasoned. It just lives behind a wall of prose
that mobile reviewers swipe past.

vibesift is the smallest possible thing that fixes that:

- The artifact is HTML, not markdown. Open it in any browser, on any phone.
- Every constraint, option, and decision is a `<details>` block. Closed by
  default; click to expand. One page reads at a glance; every supporting
  detail is one click away.
- State (the structured JSON) lives inside the HTML in a `<script>` tag.
  Single source of truth. No sidecar files.
- Each CLI command auto-commits to the current branch. Git log IS the audit
  trail; every constraint, every option, every task is its own commit.
- Pure Node 20+ CLI, zero runtime dependencies, inline CSS, one inline script
  block (theme toggle + copy-as-prompt export).
- One canonical skill markdown installs globally into Claude Code, Codex,
  OpenCode, and Gemini CLI; Cursor via a per-project rule file.

> Thariq from the Claude Code team made the same case in detail in
> ["The Unreasonable Effectiveness of HTML"](https://x.com/trq212/status/2052809885763747935):
> "I tend to not actually read more than a 100-line markdown file."
> vibesift is the productized form of that pattern for terminal-driven
> agent flows — same thesis, structured around scope/sift/ship phases.

## Install

### npm (any platform with Node 20+)

```bash
npm install -g vibesift
# or run on demand:
npx vibesift <command>
```

### Homebrew (macOS / Linux)

```bash
brew install neurot1cal/tap/vibesift   # planned for v0.2
```

### Scoop (Windows)

```bash
scoop bucket add vibesift https://github.com/neurot1cal/scoop-vibesift   # planned for v0.2
scoop install vibesift
```

### From source

```bash
git clone https://github.com/neurot1cal/vibesift.git
cd vibesift
npm test
node src/cli.js --help
```

## Quick start

```bash
# in any repo with git initialized
vibesift bootstrap                          # creates docs/sessions/
vibesift install                            # detects + wires every agent harness

# scope phase
vibesift init blue-widget \
  --title "Build a blue widget" \
  --problem "Users need a widget that does X"
vibesift scope blue-widget add-constraint "must work offline"
vibesift scope blue-widget add-constraint "under 50KB total"
vibesift decide blue-widget --phase scope --text "go static, no backend"
vibesift advance blue-widget                 # → sift

# sift phase
vibesift sift blue-widget add-option "vanilla JS"
vibesift sift blue-widget add-option "Preact"
vibesift sift blue-widget rationale "vanilla keeps the bundle smallest"
vibesift decide blue-widget --phase sift --text "vanilla JS"
vibesift advance blue-widget                 # → ship

# ship phase
vibesift ship blue-widget task add "scaffold index.html"
vibesift ship blue-widget task add "wire color picker" --agent worktree-A
vibesift ship blue-widget task add "color contrast tests" --parent 2 --agent worktree-A
vibesift ship blue-widget task done 1
vibesift deploy blue-widget                  # mark deployed; pipeline updates
vibesift status blue-widget                  # print current state
vibesift list                                # list every session in this repo
```

The session HTML carries a 5-stage pipeline graphic at the top
(Idea → Scope → Sift → Ship → Deployed) and an SVG tree inside
the Ship section that shows parent → child task relationships and
agent attribution at a glance. A "Copy as prompt" button in the
header exports the session as a structured plaintext primer ready
to paste into a new Claude session.

Enable GitHub Pages on `/docs` of your default branch and the page is live at
`https://<owner>.github.io/<repo>/sessions/blue-widget/` within a minute.

## Use cases

- **PR companion** — open a session per PR. Use scope to capture
  what the PR is about and why, sift to record alternatives
  considered, ship to track tasks. Link the session URL in the
  PR description so reviewers see your reasoning before diving
  into the diff. (Pattern from Thariq's HTML essay: "I attach a
  HTML code explainer to every PR I make now.")
- **Spec / planning artifact** — start a session before any code
  lands; the scope phase becomes the design doc and the ship
  phase becomes the work-tracking checklist. The same URL serves
  spec, plan, and audit log over the life of the work.
- **Incident or postmortem** — scope captures the timeline and
  blast radius, sift records the alternatives considered for
  mitigation, ship tracks the followups. Stakeholders read the
  page without needing terminal access.
- **Research / weekly status** — synthesis-heavy work that would
  otherwise ship as a long markdown nobody reads. The collapsible
  records keep the at-a-glance summary tight while preserving
  every supporting detail one click away.

## Tradeoffs

- **HTML diffs are noisy.** State JSON inside the HTML changes on
  every CLI mutation, so git diffs show large blobs even for small
  content changes. Reviewers should prefer the rendered HTML
  (GitHub Pages or a local browser) over the raw `git diff` for
  understanding what changed in a session. The granular per-mutation
  commit history compensates: each commit's message names the
  specific change, so `git log` is the cleaner read.
- **Two-way interaction is out of scope (v1).** Sessions are
  read-only; comments / annotations / in-page editing happen
  outside the page. Trade-off chosen so the page can ship as a
  single self-contained file with no backend to operate.

**See vibesift dogfooding itself:** [docs/sessions/v0-1-launch/](docs/sessions/v0-1-launch/index.html)
(once you enable GitHub Pages on `/docs`, this will be live at
`https://neurot1cal.github.io/vibesift/sessions/v0-1-launch/`)

## Cross-harness skill

vibesift ships one canonical skill markdown at `skills/vibesift/SKILL.md`.
The CLI is the source of truth; the skill is a thin wrapper that tells your
agent when to call it.

```bash
vibesift install                  # detect + symlink into every global harness
vibesift install --project        # drop a per-project rule file (Cursor)
vibesift harnesses                # list every supported harness
```

### Verified globally (one install, all repos)

| Harness        | On disk                                          | Status |
| -------------- | ------------------------------------------------ | ------ |
| Claude Code    | `~/.claude/skills/vibesift/SKILL.md`             | verified |
| Codex          | `~/.agents/skills/vibesift/SKILL.md`             | verified — uses the open-agent-skills standard, not `~/.codex/` |
| OpenCode       | `~/.config/opencode/skills/vibesift/SKILL.md`    | verified — also auto-reads `~/.claude/skills/` and `~/.agents/skills/`, so a Claude Code or Codex install lights this one up too |
| Gemini CLI     | `~/.gemini/extensions/vibesift/{gemini-extension.json, skills/vibesift/SKILL.md}` | verified — installer writes both the manifest and the bundled skill |

### Per-project (Cursor)

Cursor has no global filesystem-level skills — User Rules in Cursor are
plain-text settings, and Project Rules live in `.cursor/rules/<name>.mdc`
inside each repo. Run `vibesift install --project` from inside a repo to
drop `.cursor/rules/vibesift.mdc` (a `.mdc`-frontmatter rendering of the
canonical SKILL.md). Commit the file alongside your code.

| Harness        | On disk                                | Status |
| -------------- | -------------------------------------- | ------ |
| Cursor         | `.cursor/rules/vibesift.mdc` (per-repo) | verified — requires `vibesift install --project` |

### Not yet supported

Any harness without a documented skills/extension format is left out
deliberately rather than being symlinked into a guess. PRs welcome —
cite the relevant docs in the PR body and add a row above.

Adding a new harness is one entry in `src/install.js`.

## Architecture

```
docs/sessions/<slug>/index.html
├── inline CSS (self-contained, ~5KB)
├── header (title, status badge, branch, last-updated)
├── nav (Scope | Sift | Ship)
├── <main>
│   ├── Scope (problem, constraints, decision)
│   ├── Sift (options, decision, rationale)
│   └── Ship (tasks checklist, diff link)
├── Decision log (chronological)
└── <script type="application/json" id="vibesift-state">
    { full state object — single source of truth }
    </script>
```

The CLI parses the JSON script tag, mutates the state, regenerates the HTML,
and commits. Round-trip is lossless (there's a test for it).

## Out of scope (v1)

- **Comments / annotations** — the page is read-only. Reviewers read; they
  don't write back through it. Block-level commenting may land in v2 as an
  optional layer that calls a separate backend.
- **External (non-collaborator) reviewers** — no auth, no GitHub OAuth,
  no central worker. Internal commenters who already have repo write access
  is the v1 audience.
- **Real-time updates** — Pages serves whatever's committed. Reload to see
  new state.
- **Interactive editing in the browser** — the terminal is the only writer.

## Cross-platform support

CI runs on macOS, Ubuntu, and Windows × Node 20 / 22. The CLI is pure
JavaScript, no native bindings, no shell-specific assumptions. Symlinks
fall back to copy on filesystems that don't support them.

| Platform      | Status                       |
| ------------- | ---------------------------- |
| macOS arm64   | tested in CI                 |
| macOS x64     | tested in CI                 |
| Ubuntu x64    | tested in CI                 |
| Windows x64   | tested in CI                 |
| Linux arm64   | works (untested in CI)       |
| WSL2          | works (Linux x64 path)       |

## Development

```bash
npm test                          # 33 unit tests, no devDependencies
node src/cli.js --help            # local CLI
```

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Documentation

- [skills/vibesift/SKILL.md](skills/vibesift/SKILL.md) — canonical agent skill
- [CHANGELOG.md](CHANGELOG.md) — release history
- [SECURITY.md](SECURITY.md) — vulnerability reporting
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — community standards

## Security & supply chain

vibesift runs against your repo with `git` and the local filesystem. A few things
make that safer than the typical npm CLI:

- **Zero runtime dependencies.** `npm view vibesift dependencies` returns `{}`.
  Nothing to compromise upstream.
- **SLSA L3 provenance** on every published version. The npm registry records a
  signed attestation linking each tarball to the exact GitHub Actions run that
  built it. Verify before installing:
  ```bash
  npm view vibesift@latest --json | jq .dist.attestations
  ```
- **Pack contents are whitelisted.** Every PR runs the `pack-audit.yml`
  workflow that asserts the published file list matches an explicit allow-list
  (no test files, no dotfiles, no surprise additions). Changing the published
  set requires editing the whitelist in the same PR.
- **Tag-version match guard** in `release.yml`: refuses to publish if the
  git tag and `package.json` version don't agree.
- **Dependency signature audit** in `release.yml` (no-op today; future-proof
  against silently adding an unsigned dep in a later release).
- **No install scripts.** vibesift's `package.json` has no `postinstall` or
  `preinstall` hooks. `npm install -g vibesift` runs zero arbitrary code.

For low-trust environments, prefer:

```bash
npx vibesift <command>     # one-shot, no global install
```

over `npm install -g vibesift`. `npx` runs the published binary without
elevating it into a long-lived global.

To report a vulnerability, see [SECURITY.md](SECURITY.md).

## Related

- [bdigital-public](https://github.com/neurot1cal/bdigital-public) — sibling
  open-source plugins from the same author. vibesift is one of several.
- [plannotator](https://github.com/backnotprop/plannotator) — annotate
  agent plans + diffs (interactive). Different shape: workspace, not status.
- [GitHub Spec Kit](https://github.com/github/spec-kit) — markdown-first
  spec-driven development. Vibesift is the HTML answer to the same problem.
- [Anthropic superpowers](https://github.com/anthropics/superpowers) —
  brainstorming → write-plan → execute-plan skill flow. Vibesift renders
  the flow's output as one collapsible HTML page instead of four .md files.
- [Kiro](https://kiro.dev/) — agentic IDE for spec-driven development.
- ["The Unreasonable Effectiveness of HTML"](https://simonwillison.net/2026/May/8/unreasonable-effectiveness-of-html/) — the design thesis vibesift runs on.

## License

vibesift is dual-licensed under your choice of:

- The [MIT License](LICENSE-MIT)
- The [Apache License, Version 2.0](LICENSE-APACHE)

See [LICENSE](LICENSE) for the rationale.
