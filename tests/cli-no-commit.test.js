// Verifies the --no-commit flag: file is still written, but autoCommit is
// skipped and stderr emits the warning. Spawns the CLI as a subprocess via
// spawnSync (NOT execSync — CodeQL js/indirect-command-line-injection flags
// shell-string interpolation; spawnSync with an argv array sends bytes
// verbatim with no shell parsing).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI = resolve(process.cwd(), 'src/cli.js');

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'vibesift-nocommit-'));
  // Initial commit so HEAD exists; vibesift's autoCommit and `git log` need
  // a base ref. --allow-empty avoids needing a real file.
  const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@e',
                GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@e' };
  const init = spawnSync('git', ['init', '-q', '-b', 'main', dir], { env });
  if (init.status !== 0) throw new Error('git init failed: ' + init.stderr);
  const commit = spawnSync('git', ['-C', dir, 'commit', '--allow-empty', '-q', '-m', 'initial'], { env });
  if (commit.status !== 0) throw new Error('initial commit failed: ' + commit.stderr);
  return { dir, env };
}

function runCli(dir, env, args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: dir, env, encoding: 'utf8',
  });
}

test('--no-commit writes the HTML file but skips the auto-commit', () => {
  const { dir, env } = makeRepo();
  try {
    // Bootstrap docs/sessions so init has somewhere to write. We pass
    // --no-commit on bootstrap too via plain `init`: init creates its
    // own directory under docs/sessions/<slug>/.
    mkdirSync(join(dir, 'docs', 'sessions'), { recursive: true });

    // First, init the session WITH a commit (to set up the file).
    const initR = runCli(dir, env, ['init', 'demo', '--title', 'Demo session']);
    assert.equal(initR.status, 0, `init failed: ${initR.stderr}`);

    // Snapshot the commit count after init.
    const logBefore = spawnSync('git', ['-C', dir, 'log', '--oneline'], { encoding: 'utf8' });
    const commitsBefore = logBefore.stdout.trim().split('\n').length;
    // Should be 2: the initial empty + the init commit.
    assert.equal(commitsBefore, 2, `expected 2 commits after init, got ${commitsBefore}: ${logBefore.stdout}`);

    // Add a constraint with --no-commit.
    const scopeR = runCli(dir, env, ['scope', 'demo', 'add-constraint', 'must work', '--no-commit']);
    assert.equal(scopeR.status, 0, `scope failed: ${scopeR.stderr}`);

    // (a) The HTML file at docs/sessions/demo/index.html contains "must work".
    const htmlPath = join(dir, 'docs', 'sessions', 'demo', 'index.html');
    const html = readFileSync(htmlPath, 'utf8');
    assert.ok(html.includes('must work'), 'rendered HTML must contain the constraint text');

    // (b) git log --oneline shows ONLY the initial commit + the init commit
    // (no constraint commit was created).
    const logAfter = spawnSync('git', ['-C', dir, 'log', '--oneline'], { encoding: 'utf8' });
    const commitsAfter = logAfter.stdout.trim().split('\n').length;
    assert.equal(commitsAfter, 2, `expected commit count unchanged, got ${commitsAfter}: ${logAfter.stdout}`);

    // (c) stderr from the constraint call contained "no-commit set".
    assert.match(scopeR.stderr, /no-commit set/, `stderr should warn about --no-commit; got: ${scopeR.stderr}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--no-commit on init also skips the commit', () => {
  const { dir, env } = makeRepo();
  try {
    mkdirSync(join(dir, 'docs', 'sessions'), { recursive: true });

    const r = runCli(dir, env, ['init', 'preview', '--title', 'Preview only', '--no-commit']);
    assert.equal(r.status, 0, `init --no-commit failed: ${r.stderr}`);

    // File exists on disk.
    const htmlPath = join(dir, 'docs', 'sessions', 'preview', 'index.html');
    const html = readFileSync(htmlPath, 'utf8');
    assert.ok(html.includes('Preview only'), 'init must still write the file');

    // git log only has the initial empty commit; no init commit was created.
    const log = spawnSync('git', ['-C', dir, 'log', '--oneline'], { encoding: 'utf8' });
    const commits = log.stdout.trim().split('\n').length;
    assert.equal(commits, 1, `expected 1 commit (initial only), got ${commits}: ${log.stdout}`);

    assert.match(r.stderr, /no-commit set/, 'init stderr should warn about --no-commit');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
