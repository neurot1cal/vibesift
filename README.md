# vibesift

**Scope. Sift. Ship.** Static HTML status pages for terminal-driven agentic flows.

vibesift turns each session of design + planning + implementation work into a
single static HTML file in your repo, served by GitHub Pages, viewable from any
phone. The terminal drives the flow. The page is read-only.

## What you get

- One HTML file per session at `docs/sessions/<slug>/index.html`
- Three phases — Scope, Sift, Ship — each with structured state
- Every command auto-commits to your current branch
- Self-contained HTML: inline CSS, no CDN, no JS framework, no external service
- Mobile-readable, dark-mode by default
- Cross-harness skill: works in Claude Code, Codex, OpenCode, Cursor Agent, Gemini CLI

## Quick start

```bash
# in the repo you want to track
npx vibesift bootstrap                     # scaffolds docs/sessions/, one-time
npx vibesift install                       # installs the skill into your agent

# start a session
npx vibesift init blue-widget --title "Build a blue widget" --problem "Users need X"
npx vibesift scope blue-widget add-constraint "must work offline"
npx vibesift decide blue-widget --phase scope --text "go static, no backend"
npx vibesift advance blue-widget

# explore options, pick one
npx vibesift sift blue-widget add-option "vanilla JS"
npx vibesift sift blue-widget add-option "Preact"
npx vibesift sift blue-widget rationale "vanilla keeps the bundle smallest"
npx vibesift decide blue-widget --phase sift --text "vanilla JS"
npx vibesift advance blue-widget

# break into tasks, mark them done
npx vibesift ship blue-widget task add "scaffold index.html"
npx vibesift ship blue-widget task done 1
```

Enable GitHub Pages on `/docs` of your default branch and your sessions are
live at `https://<owner>.github.io/<repo>/sessions/blue-widget/`.

## Cross-harness skill

The CLI is the canonical surface. Each agent harness gets a thin wrapper that
points at the same skill file:

```bash
vibesift install
```

This detects which harnesses you have installed and symlinks
`skills/vibesift/SKILL.md` into:

| Harness        | Target                                          |
| -------------- | ----------------------------------------------- |
| Claude Code    | `~/.claude/skills/vibesift/SKILL.md`            |
| Codex          | `~/.codex/skills/vibesift/SKILL.md`             |
| OpenCode       | `~/.opencode/agents/vibesift/SKILL.md`          |
| Cursor Agent   | `~/.cursor/skills/vibesift/SKILL.md`            |
| Gemini CLI     | `~/.gemini/extensions/vibesift/SKILL.md`        |

The skill describes when to invoke vibesift commands. The CLI does the work.
Adding a new harness means one entry in `src/install.js`.

## Why HTML, not markdown

Markdown is an exchange format we tolerated. HTML is what humans actually want
to read — clickable, filterable, styled, navigable. A status page rendered as
HTML loads in any browser, on any device, without a build step. That's the
shape of the artifact. The terminal generates it.

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

The CLI parses the script tag, mutates the JSON, regenerates the HTML, and
commits. Round-trip is lossless.

## Out of scope (v1)

- **Comments / annotations** — the page is read-only. Reviewers read the page;
  they don't write back through it.
- **External (non-collaborator) reviewers** — no auth, no GitHub OAuth, no
  central worker. v2 territory.
- **Real-time updates** — Pages serves whatever's committed. Reload to see
  new state.

## Tests

```bash
npm test
```

## License

MIT
