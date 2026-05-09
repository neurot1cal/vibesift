// Git helpers. Auto-commit each phase change so the HTML page is always
// at-rest in git, ready for GH Pages to serve. Best-effort: if not in a
// repo, or if there's nothing to commit, fall through silently.

import { execSync } from 'node:child_process';

function tryGit(args, cwd) {
  try {
    return execSync(`git ${args}`, { cwd, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
  } catch {
    return null;
  }
}

export function repoRoot(cwd = process.cwd()) {
  return tryGit('rev-parse --show-toplevel', cwd);
}

export function currentBranch(cwd = process.cwd()) {
  return tryGit('rev-parse --abbrev-ref HEAD', cwd) || '';
}

export function originUrl(cwd = process.cwd()) {
  const raw = tryGit('config --get remote.origin.url', cwd);
  if (!raw) return '';
  // Normalize git@github.com:owner/repo.git → https://github.com/owner/repo
  const ssh = raw.match(/^git@([^:]+):(.+?)(\.git)?$/);
  if (ssh) return `https://${ssh[1]}/${ssh[2]}`;
  return raw.replace(/\.git$/, '');
}

export function autoCommit({ cwd = process.cwd(), paths, message }) {
  const root = repoRoot(cwd);
  if (!root) return { ok: false, reason: 'not a git repo' };
  for (const p of paths) {
    try {
      execSync(`git add ${JSON.stringify(p)}`, { cwd: root, stdio: 'ignore' });
    } catch {
      return { ok: false, reason: `git add failed for ${p}` };
    }
  }
  // Check if anything is actually staged.
  const staged = tryGit('diff --cached --name-only', root);
  if (!staged) return { ok: true, committed: false, reason: 'nothing to commit' };
  try {
    execSync(`git commit -m ${JSON.stringify(message)}`, {
      cwd: root,
      stdio: 'ignore',
    });
    return { ok: true, committed: true, sha: tryGit('rev-parse HEAD', root) };
  } catch {
    return { ok: false, reason: 'git commit failed' };
  }
}

export function diffUrl({ owner, repo, base = 'main', head }) {
  if (!owner || !repo || !head) return null;
  return `https://github.com/${owner}/${repo}/compare/${base}...${head}`;
}

export function parseGithubOwnerRepo(url) {
  if (!url) return null;
  const m = url.match(/github\.com[/:]([^/]+)\/([^/]+?)(\.git)?$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}
