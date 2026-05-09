# Contributing to vibesift

Thanks for your interest. vibesift is small on purpose. The bar for new
features is "does this make the static HTML page more useful as a status
broadcast?" Things that pull the project toward an interactive workspace
are out of scope (see [README.md → Out of scope](README.md#out-of-scope-v1)).

## Quick start

```bash
git clone https://github.com/neurot1cal/vibesift.git
cd vibesift
npm test                       # 16 tests, no install needed
node src/cli.js --help         # poke around
node src/cli.js install        # symlinks the skill into your harness
```

## Project structure

```
src/cli.js          — command parser, the user-facing entry point
src/state.js        — pure JSON state mutators (zero side effects)
src/template.js     — HTML generator (zero side effects)
src/git.js          — git auto-commit helpers (the only side-effect layer
                      besides cli.js)
src/install.js      — cross-harness skill installer
skills/vibesift/    — canonical agent skill (single source of truth for all
                      harnesses)
tests/*.test.js     — node:test, no test framework, no devDependencies
```

The discipline: `state.js` and `template.js` are pure functions. Every other
file imports them, never the reverse. Tests cover them independently of git
or filesystem.

## Local development

The CLI runs directly from source — no build step. After editing `src/`, run
`npm test` and a quick smoke:

```bash
cd /tmp && rm -rf vibesift-smoke && mkdir vibesift-smoke && cd vibesift-smoke
git init && git config user.email t@t && git config user.name t
node ~/git/vibesift/src/cli.js bootstrap
node ~/git/vibesift/src/cli.js init test --title "Test"
# … exercise whatever changed
```

## Style

- ESM only. `import`/`export`. No CommonJS.
- Node 20+ syntax allowed. No Babel.
- Zero runtime dependencies. The package ships with `dependencies: {}`.
- Two-space indent. Single quotes. Trailing commas.
- Comments explain WHY when the why is non-obvious. They never explain WHAT
  the code does.
- Named exports preferred over default. Tree-shake friendly.

## Testing

```bash
npm test
```

Uses Node's built-in test runner (`node --test`). No vitest / jest / mocha.
This keeps the repo dependency-free.

For a new feature, add a unit test for the pure logic + a smoke-test snippet
in the PR description showing the full lifecycle still works end-to-end.

## Cross-platform

CI runs on macOS, Ubuntu, and Windows × Node 20 / 22. The CLI must pass on
all of them. Watch out for:

- Always use `path.join`, never string concat
- No POSIX-only commands in `child_process.execSync`
- Symlinks fall back to copy on FS that doesn't support them
- Test stdout encoding — Windows cmd doesn't render UTF-8 by default

## Pull requests

- Branch off `main`
- Conventional Commits style is preferred but not required:
  `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`
- Keep PRs focused. One logical change per PR.
- Tests pass on all CI matrix entries before review.
- A reviewer may ask you to write a smoke session as a session HTML file
  in the docs/ — yes, vibesift dogfoods itself.

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## License

Contributions are dual-licensed under MIT or Apache-2.0 at your option. See
[LICENSE](LICENSE).
