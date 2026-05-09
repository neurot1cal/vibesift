// Per-user wrapper installer. Detects which agent harnesses are present on
// this machine and symlinks (or copies) the canonical SKILL.md into each
// harness's expected directory. The CLI is the single canonical source;
// these wrappers are pure pointers.
//
// Adding a new harness = one entry in HARNESSES below.

import { existsSync, mkdirSync, symlinkSync, copyFileSync, readlinkSync, unlinkSync, statSync, renameSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HOME = homedir();

// The canonical skill file, shipped inside the package.
const HERE = dirname(fileURLToPath(import.meta.url));
const CANONICAL_SKILL = resolve(HERE, '..', 'skills', 'vibesift', 'SKILL.md');

// Each harness has: a name, a probe (what to look for to confirm it's installed),
// and a target directory where the skill markdown belongs.
const HARNESSES = [
  {
    name: 'Claude Code',
    probe: () => existsSync(join(HOME, '.claude')),
    target: () => join(HOME, '.claude', 'skills', 'vibesift', 'SKILL.md'),
  },
  {
    name: 'Codex',
    probe: () => existsSync(join(HOME, '.codex')) || existsSync(join(HOME, '.config', 'codex')),
    target: () => existsSync(join(HOME, '.codex'))
      ? join(HOME, '.codex', 'skills', 'vibesift', 'SKILL.md')
      : join(HOME, '.config', 'codex', 'skills', 'vibesift', 'SKILL.md'),
  },
  {
    name: 'OpenCode',
    probe: () => existsSync(join(HOME, '.opencode')) || existsSync(join(HOME, '.config', 'opencode')),
    target: () => existsSync(join(HOME, '.opencode'))
      ? join(HOME, '.opencode', 'agents', 'vibesift', 'SKILL.md')
      : join(HOME, '.config', 'opencode', 'agents', 'vibesift', 'SKILL.md'),
  },
  {
    name: 'Cursor Agent',
    probe: () => existsSync(join(HOME, '.cursor')) || existsSync(join(HOME, '.config', 'cursor')),
    target: () => existsSync(join(HOME, '.cursor'))
      ? join(HOME, '.cursor', 'skills', 'vibesift', 'SKILL.md')
      : join(HOME, '.config', 'cursor', 'skills', 'vibesift', 'SKILL.md'),
  },
  {
    name: 'Gemini CLI',
    probe: () => existsSync(join(HOME, '.gemini')),
    target: () => join(HOME, '.gemini', 'extensions', 'vibesift', 'SKILL.md'),
  },
];

function isSymlinkPointingTo(path, target) {
  try {
    const link = readlinkSync(path);
    return resolve(dirname(path), link) === target;
  } catch {
    return false;
  }
}

function installAt(target, mode) {
  mkdirSync(dirname(target), { recursive: true });
  if (existsSync(target)) {
    if (isSymlinkPointingTo(target, CANONICAL_SKILL)) {
      return { status: 'already-linked', target };
    }
    // Existing different file — back up rather than clobber.
    const backup = `${target}.backup-${Date.now()}`;
    try {
      // Move via rename — same filesystem, fast, atomic on POSIX. Use
      // lstat semantics: rename moves the link itself, not its pointee,
      // so a symlink target is preserved as a symlink in the backup.
      renameSync(target, backup);
    } catch {
      // Rename can fail across filesystems; fall back to unlink. We
      // accept potential loss of the prior file content in that case
      // because the alternative is leaving a stale skill in place.
      try { unlinkSync(target); } catch {}
    }
  }
  if (mode === 'symlink') {
    try {
      symlinkSync(CANONICAL_SKILL, target);
      return { status: 'symlinked', target };
    } catch (e) {
      // Symlinks can fail on Windows or restricted FS — fall back to copy.
      copyFileSync(CANONICAL_SKILL, target);
      return { status: 'copied (symlink failed)', target };
    }
  }
  copyFileSync(CANONICAL_SKILL, target);
  return { status: 'copied', target };
}

export function install({ mode = 'symlink', only = null } = {}) {
  if (!existsSync(CANONICAL_SKILL)) {
    return { ok: false, reason: `canonical skill not found at ${CANONICAL_SKILL}` };
  }
  const results = [];
  for (const h of HARNESSES) {
    if (only && only !== h.name.toLowerCase().replace(/\s+/g, '-')) continue;
    if (!h.probe()) {
      results.push({ harness: h.name, status: 'not-detected' });
      continue;
    }
    const target = h.target();
    try {
      const r = installAt(target, mode);
      results.push({ harness: h.name, ...r });
    } catch (e) {
      results.push({ harness: h.name, status: 'error', error: String(e) });
    }
  }
  return { ok: true, canonical: CANONICAL_SKILL, results };
}

export function listHarnesses() {
  return HARNESSES.map(h => ({ name: h.name, detected: h.probe() }));
}
