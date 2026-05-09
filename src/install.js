// Per-user wrapper installer. Detects which agent harnesses are present on
// this machine and symlinks (or copies) the canonical SKILL.md into each
// harness's expected directory. The CLI is the single canonical source;
// these wrappers are pure pointers.
//
// Adding a new harness = one entry in HARNESSES below.
//
// Verified against authoritative docs (May 2026):
//   - Claude Code → ~/.claude/skills/<name>/SKILL.md
//     https://docs.anthropic.com/claude/docs/skills
//   - Codex → ~/.agents/skills/<name>/SKILL.md (NOT ~/.codex/skills/)
//     https://developers.openai.com/codex/skills
//   - OpenCode → ~/.config/opencode/skills/<name>/SKILL.md
//     OpenCode also auto-discovers ~/.claude/skills/ and ~/.agents/skills/,
//     so a Claude Code or Codex install lights up OpenCode for free.
//     https://opencode.ai/docs/skills/
//   - Gemini CLI → ~/.gemini/extensions/<name>/{gemini-extension.json,
//     skills/<name>/SKILL.md} — requires the manifest at extension root.
//     https://google-gemini.github.io/gemini-cli/docs/extensions/
//   - Cursor → has NO global skills filesystem. Project Rules live in
//     .cursor/rules/<name>.mdc per-repo. Use `vibesift install --project`.
//     https://cursor.com/docs/context/rules

import { existsSync, mkdirSync, symlinkSync, copyFileSync, readlinkSync, unlinkSync, renameSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HOME = homedir();

// The canonical skill file, shipped inside the package.
const HERE = dirname(fileURLToPath(import.meta.url));
const CANONICAL_SKILL = resolve(HERE, '..', 'skills', 'vibesift', 'SKILL.md');

// Each global harness has: a name, a probe (what to look for to confirm it's
// installed), and an action. Default action symlinks (or copies) the canonical
// SKILL.md into the harness's expected path. Some harnesses need a small
// wrapper file alongside (e.g. Gemini's gemini-extension.json manifest).
const HARNESSES = [
  {
    name: 'Claude Code',
    note: 'verified — global skill loader',
    probe: () => existsSync(join(HOME, '.claude')),
    target: () => join(HOME, '.claude', 'skills', 'vibesift', 'SKILL.md'),
  },
  {
    name: 'Codex',
    // OpenAI Codex CLI scans $HOME/.agents/skills, not ~/.codex/skills.
    // The .codex directory exists for config (config.toml) but not skills.
    note: 'verified — uses ~/.agents/skills (open agent skills standard)',
    probe: () => existsSync(join(HOME, '.codex')) || existsSync(join(HOME, '.agents')),
    target: () => join(HOME, '.agents', 'skills', 'vibesift', 'SKILL.md'),
  },
  {
    name: 'OpenCode',
    // OpenCode loads skills from ~/.config/opencode/skills/ AND auto-reads
    // ~/.claude/skills/ and ~/.agents/skills/. We write the canonical
    // location; the Claude/Codex installs cover OpenCode for free anyway.
    note: 'verified — also auto-reads ~/.claude/skills and ~/.agents/skills',
    probe: () => existsSync(join(HOME, '.config', 'opencode')) || existsSync(join(HOME, '.opencode')),
    target: () => join(HOME, '.config', 'opencode', 'skills', 'vibesift', 'SKILL.md'),
  },
  {
    name: 'Gemini CLI',
    // Gemini extensions require a gemini-extension.json manifest at the
    // extension root, plus skills/<name>/SKILL.md inside.
    note: 'verified — extension manifest + bundled skill',
    probe: () => existsSync(join(HOME, '.gemini')),
    target: () => join(HOME, '.gemini', 'extensions', 'vibesift', 'skills', 'vibesift', 'SKILL.md'),
    extras: () => [{
      path: join(HOME, '.gemini', 'extensions', 'vibesift', 'gemini-extension.json'),
      content: JSON.stringify({
        name: 'vibesift',
        version: readPackageVersion(),
        description: 'Scope, sift, ship — static HTML status pages for terminal-driven flows',
      }, null, 2) + '\n',
    }],
  },
];

// Per-project harnesses. Activated by `vibesift install --project`. These
// drop a file inside the current repo (committed alongside the code), not
// into the user's home directory.
const PROJECT_HARNESSES = [
  {
    name: 'Cursor',
    // Cursor has no global skills filesystem. Project Rules live in
    // .cursor/rules/<name>.mdc per-repo and ship with the codebase.
    note: 'per-project only — Cursor has no global skills filesystem',
    target: (cwd) => join(cwd, '.cursor', 'rules', 'vibesift.mdc'),
    transform: (skillBody) => toCursorMdc(skillBody),
  },
];

function readPackageVersion() {
  try {
    const pkgPath = resolve(HERE, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

// Cursor .mdc rules use frontmatter with description / alwaysApply / globs,
// not the Claude/Codex name+description shape. We rewrite the frontmatter
// and keep the body verbatim so the trigger guidance is identical.
function toCursorMdc(skillBody) {
  // Strip the existing frontmatter block (between the first pair of ---).
  const m = skillBody.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const body = m ? m[2] : skillBody;
  const description = m
    ? (m[1].match(/^description:\s*(.+)$/m)?.[1] ?? 'vibesift session driver').trim()
    : 'vibesift session driver';
  const front = [
    '---',
    `description: ${description}`,
    'alwaysApply: false',
    '---',
    '',
  ].join('\n');
  return front + body;
}

function isSymlinkPointingTo(path, target) {
  try {
    const link = readlinkSync(path);
    return resolve(dirname(path), link) === target;
  } catch {
    return false;
  }
}

function backupExisting(target) {
  if (!existsSync(target)) return;
  if (isSymlinkPointingTo(target, CANONICAL_SKILL)) return;
  const backup = `${target}.backup-${Date.now()}`;
  try {
    renameSync(target, backup);
  } catch {
    try { unlinkSync(target); } catch {}
  }
}

function installAt(target, mode) {
  mkdirSync(dirname(target), { recursive: true });
  if (existsSync(target)) {
    if (isSymlinkPointingTo(target, CANONICAL_SKILL)) {
      return { status: 'already-linked', target };
    }
    backupExisting(target);
  }
  if (mode === 'symlink') {
    try {
      symlinkSync(CANONICAL_SKILL, target);
      return { status: 'symlinked', target };
    } catch {
      copyFileSync(CANONICAL_SKILL, target);
      return { status: 'copied (symlink failed)', target };
    }
  }
  copyFileSync(CANONICAL_SKILL, target);
  return { status: 'copied', target };
}

function writeExtra(extra) {
  mkdirSync(dirname(extra.path), { recursive: true });
  // Atomic create-or-skip: writeFileSync with flag 'wx' fails fast with
  // EEXIST when the file already exists. No existsSync race.
  try {
    writeFileSync(extra.path, extra.content, { flag: 'wx' });
    return { status: 'extra-written', target: extra.path };
  } catch (e) {
    if (e.code === 'EEXIST') {
      return { status: 'extra-already-exists', target: extra.path };
    }
    throw e;
  }
}

function writeProjectFile(target, transformedBody) {
  mkdirSync(dirname(target), { recursive: true });
  // Atomic move-then-write: renameSync either succeeds (target existed and
  // was preserved as a .backup-<ts>) or fails ENOENT (didn't exist). Either
  // way the target slot is free for the writeFileSync below. Replaces the
  // existsSync→writeFileSync TOCTOU CodeQL flagged as js/file-system-race.
  try {
    renameSync(target, `${target}.backup-${Date.now()}`);
  } catch (e) {
    if (e.code !== 'ENOENT') {
      // Not "file missing" — surface the real failure via writeFileSync below
    }
  }
  writeFileSync(target, transformedBody);
  return { status: 'written', target };
}

function projectFlagFromArgv(argv = process.argv) {
  // Allow --project on the command line without requiring cli.js to thread
  // a new flag through. cli.js is locked; this lets the new subcommand work
  // through the same `install({ mode, only })` call site.
  return argv.includes('--project');
}

export function install({ mode = 'symlink', only = null, project = projectFlagFromArgv(), cwd = process.cwd() } = {}) {
  if (!existsSync(CANONICAL_SKILL)) {
    return { ok: false, reason: `canonical skill not found at ${CANONICAL_SKILL}` };
  }

  if (project) {
    const skillBody = readFileSync(CANONICAL_SKILL, 'utf8');
    const results = [];
    for (const h of PROJECT_HARNESSES) {
      const key = h.name.toLowerCase().replace(/\s+/g, '-');
      if (only && only !== key) continue;
      const target = h.target(cwd);
      try {
        const transformed = h.transform ? h.transform(skillBody) : skillBody;
        const r = writeProjectFile(target, transformed);
        results.push({ harness: h.name, note: h.note, ...r });
      } catch (e) {
        results.push({ harness: h.name, note: h.note, status: 'error', error: String(e) });
      }
    }
    return { ok: true, mode: 'project', canonical: CANONICAL_SKILL, results };
  }

  const results = [];
  for (const h of HARNESSES) {
    const key = h.name.toLowerCase().replace(/\s+/g, '-');
    if (only && only !== key) continue;
    if (!h.probe()) {
      results.push({ harness: h.name, note: h.note, status: 'not-detected' });
      continue;
    }
    const target = h.target();
    try {
      const r = installAt(target, mode);
      const entry = { harness: h.name, note: h.note, ...r };
      if (h.extras) {
        entry.extras = [];
        for (const extra of h.extras()) {
          try {
            entry.extras.push(writeExtra(extra));
          } catch (e) {
            entry.extras.push({ status: 'extra-error', target: extra.path, error: String(e) });
          }
        }
      }
      results.push(entry);
    } catch (e) {
      results.push({ harness: h.name, note: h.note, status: 'error', error: String(e) });
    }
  }
  return { ok: true, mode: 'global', canonical: CANONICAL_SKILL, results };
}

export function listHarnesses() {
  const global = HARNESSES.map(h => ({
    name: h.name, scope: 'global', detected: h.probe(), note: h.note,
  }));
  const project = PROJECT_HARNESSES.map(h => ({
    name: h.name, scope: 'project', detected: null, note: h.note,
  }));
  return [...global, ...project];
}
