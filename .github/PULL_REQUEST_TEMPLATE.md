## Summary

<!-- One or two sentences. What changed and why. -->

## Test plan

<!-- Bullet list of what you ran. Include CI matrix entries if you tested
locally on more than one OS. The default is "all CI matrix entries pass". -->

- [ ] `npm test` passes locally
- [ ] CI matrix passes (macOS / Ubuntu / Windows × Node 20 / 22)
- [ ] Smoke run end-to-end (init → scope → sift → ship → status) on a fresh repo

## Scope check

<!-- vibesift is a read-only status broadcaster. Confirm this PR doesn't drag
the project into being an interactive workspace. -->

- [ ] Change is consistent with "page is read-only, terminal drives" model
- [ ] No new runtime dependencies added (or, if added, justified below)

## Notes for reviewer

<!-- Anything non-obvious, follow-ups deferred to other PRs, etc. -->
