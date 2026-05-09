<pre>
██╗   ██╗██╗██████╗ ███████╗███████╗██╗███████╗████████╗
██║   ██║██║██╔══██╗██╔════╝██╔════╝██║██╔════╝╚══██╔══╝
██║   ██║██║██████╔╝█████╗  ███████╗██║█████╗     ██║
╚██╗ ██╔╝██║██╔══██╗██╔══╝  ╚════██║██║██╔══╝     ██║
 ╚████╔╝ ██║██████╔╝███████╗███████║██║██║        ██║
  ╚═══╝  ╚═╝╚═════╝ ╚══════╝╚══════╝╚═╝╚═╝        ╚═╝

Scope.  Sift.  Ship.
</pre>

> ![full lifecycle demo](assets/asciinema/casts/full.gif)

> **Scope. Sift. Ship.** Static HTML status pages for terminal-driven agentic flows.

[![CI](https://github.com/neurot1cal/vibesift/actions/workflows/ci.yml/badge.svg)](https://github.com/neurot1cal/vibesift/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/vibesift.svg)](https://www.npmjs.com/package/vibesift)
[![License](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue.svg)](#license)
[![Node](https://img.shields.io/node/v/vibesift)](package.json)

vibesift turns each session of design + planning + implementation work into a
single self-contained HTML file in your repo, served by GitHub Pages, viewable
from any phone. The terminal drives. The page is read-only.

```bash
npx vibesift bootstrap                                    # one-time per repo
npx vibesift init my-feature --title "Build the thing"
npx vibesift scope my-feature add-constraint "must work offline"
npx vibesift advance my-feature
# … each command auto-commits to your current branch
```

---

## Why

Markdown is an interchange format we tolerated. HTML is what humans actually
want to read — clickable, filterable, styled, navigable, mobile-friendly. A
status page rendered as HTML loads in any browser, on any device, with no
build step. Writing the artifact directly as HTML, instead of generating it
from intermediate markdown, removes a whole layer.

vibesift is the smallest possible thing that does this:

- Pure Node CLI, zero runtime dependencies
- Inline CSS, no CDN, no JS framework
- State persisted as JSON inside the HTML itself (single source of truth)
- Auto-commits every change to the current branch
- One canonical skill markdown that installs into Claude Code, Codex,
  OpenCode, Cursor Agent, and Gemini CLI

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
vibesift ship blue-widget task add "wire color picker"
vibesift ship blue-widget task done 1
vibesift status blue-widget                  # print current state
vibesift list                                # list every session in this repo
```

Enable GitHub Pages on `/docs` of your default branch and the page is live at
`https://<owner>.github.io/<repo>/sessions/blue-widget/` within a minute.

**See vibesift dogfooding itself:** [docs/sessions/v0-1-launch/](docs/sessions/v0-1-launch/index.html)
(once you enable GitHub Pages on `/docs`, this will be live at
`https://neurot1cal.github.io/vibesift/sessions/v0-1-launch/`)

## Cross-harness skill

vibesift ships one canonical skill markdown at `skills/vibesift/SKILL.md`.
The CLI is the source of truth; the skill is a thin wrapper that tells your
agent when to call it.

```bash
vibesift install                  # detect + symlink into every harness
vibesift harnesses                # list which harnesses are detected
```

| Harness        | Target                                          |
| -------------- | ----------------------------------------------- |
| Claude Code    | `~/.claude/skills/vibesift/SKILL.md`            |
| Codex          | `~/.codex/skills/vibesift/SKILL.md`             |
| OpenCode       | `~/.opencode/agents/vibesift/SKILL.md`          |
| Cursor Agent   | `~/.cursor/skills/vibesift/SKILL.md`            |
| Gemini CLI     | `~/.gemini/extensions/vibesift/SKILL.md`        |

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
npm test                          # 16 unit tests, no devDependencies
node src/cli.js --help            # local CLI
```

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Documentation

- [skills/vibesift/SKILL.md](skills/vibesift/SKILL.md) — canonical agent skill
- [CHANGELOG.md](CHANGELOG.md) — release history
- [SECURITY.md](SECURITY.md) — vulnerability reporting
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — community standards

## Related

- [plannotator](https://github.com/backnotprop/plannotator) — annotate
  agent plans + diffs (interactive). Different shape: workspace, not status.
- [GitHub Spec Kit](https://github.com/github/spec-kit) — markdown-first
  spec-driven development.
- [Kiro](https://kiro.dev/) — agentic IDE for spec-driven development.
- ["The Unreasonable Effectiveness of HTML"](https://simonwillison.net/2026/May/8/unreasonable-effectiveness-of-html/) — the design thesis vibesift runs on.

## License

vibesift is dual-licensed under your choice of:

- The [MIT License](LICENSE-MIT)
- The [Apache License, Version 2.0](LICENSE-APACHE)

See [LICENSE](LICENSE) for the rationale.
