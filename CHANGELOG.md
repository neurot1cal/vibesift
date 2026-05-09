# Changelog

All notable changes to vibesift are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- SHA-pin every third-party action in `ci.yml` and `release.yml` so a
  tag rewrite or hijacked release can't silently substitute workflow
  code. Each pin carries a comment with the human-readable version.
- Add `dependency-review.yml` to gate pull requests on CVE severity
  (`moderate`) and on a license allow-list (MIT, Apache-2.0,
  BSD-2-Clause, BSD-3-Clause, ISC, 0BSD, CC0-1.0).
- Add `scorecard.yml` (OpenSSF Scorecard) running weekly Tuesday plus
  on `push` to main, branch-protection changes, and manual dispatch.
  SARIF uploads to the Security tab.
- Add `.github/CODEOWNERS` requiring review on skill content,
  installer, template renderer, security policy, and workflow files.
- Add `.github/FUNDING.yml` placeholder pointing at the GitHub Sponsors
  profile for `@neurot1cal`.

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

[Unreleased]: https://github.com/neurot1cal/vibesift/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/neurot1cal/vibesift/releases/tag/v0.1.0
