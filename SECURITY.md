# Security Policy

## Supported versions

vibesift is pre-1.0 and ships from `main`. Security fixes land in `main` and
release a new patch version. There are no LTS branches.

| Version | Supported          |
| ------- | ------------------ |
| 0.x     | :white_check_mark: |

## Reporting a vulnerability

**Do not open a public issue for security vulnerabilities.**

Instead, send the details to: `security@vibesift.dev` (or open a private
GitHub Security Advisory at
https://github.com/neurot1cal/vibesift/security/advisories/new).

Include:

- A description of the vulnerability
- Steps to reproduce
- Affected version
- Suggested mitigation if you have one

We aim to acknowledge within 72 hours. Coordinated disclosure timelines are
case-by-case.

## Threat model

vibesift is a CLI that:

- Reads and writes files in the current git repository
- Auto-commits and reports git command output
- Symlinks files into agent harness directories under `~/.claude`,
  `~/.codex`, etc.
- Does **not** make network requests. The CLI is fully offline.
- Does **not** read or write secrets, environment variables (other than `HOME`
  for harness probing), or credentials.

The skill markdown installed into agent harnesses describes shell commands
the agent should run. A malicious modification of `skills/vibesift/SKILL.md`
could trick an agent into running unintended commands, but this requires
write access to your local checkout — an attacker with that access has
broader capabilities already.

## Known non-issues

- HTML output is not user-input-driven (it's generated from CLI args, which
  the user types). XSS in the rendered page is mitigated by HTML-escaping
  every interpolated string.
- The state JSON block is `<script type="application/json">` — never executed
  as code.
