// CLI propose tests. Spawn vibesift in a tmp git repo, pass non-prompting
// flags (since stdin isn't a TTY in spawnSync), verify the session HTML and
// commit behavior. Pattern follows cli-no-commit.test.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI = resolve(process.cwd(), 'src/cli.js');

function makeRepo({ withPackageJson = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'vibesift-propose-'));
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@e',
    GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@e',
  };
  const init = spawnSync('git', ['init', '-q', '-b', 'main', dir], { env });
  if (init.status !== 0) throw new Error('git init failed: ' + init.stderr);
  if (withPackageJson) {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'demo', version: '0.0.1',
      engines: { node: '20+' },
      dependencies: {},
    }));
    spawnSync('git', ['-C', dir, 'add', '.'], { env });
  }
  const commit = spawnSync('git', ['-C', dir, 'commit', '--allow-empty', '-q', '-m', 'initial'], { env });
  if (commit.status !== 0) throw new Error('initial commit failed: ' + commit.stderr);
  return { dir, env };
}

function runCli(dir, env, args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: dir, env, encoding: 'utf8',
  });
}

test('propose creates a session at docs/sessions/<slug>/index.html', () => {
  const { dir, env } = makeRepo({ withPackageJson: true });
  try {
    const r = runCli(dir, env, [
      'propose', 'blue-widget',
      '--title', 'Build the widget',
      '--problem', 'Need a widget',
      '--no-open',
    ]);
    assert.equal(r.status, 0, `propose failed: ${r.stderr}`);
    const htmlPath = join(dir, 'docs', 'sessions', 'blue-widget', 'index.html');
    assert.ok(existsSync(htmlPath), 'session HTML not created');
    const html = readFileSync(htmlPath, 'utf8');
    assert.ok(html.includes('Build the widget'), 'title missing from HTML');
    assert.ok(html.includes('Need a widget'), 'problem missing from HTML');
    // Project-type constraint stub: Node compat line should appear.
    assert.ok(/Stay within Node/.test(html), 'expected node constraint stub');
    // Starter tasks: at least one ship task seeded.
    assert.ok(/task-todo|task-done|class="tasks"/.test(html), 'expected ship task list');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('propose creates a single commit per session', () => {
  const { dir, env } = makeRepo({ withPackageJson: true });
  try {
    const r = runCli(dir, env, [
      'propose', 'one-commit',
      '--title', 'One commit only',
      '--problem', 'X',
      '--no-open',
    ]);
    assert.equal(r.status, 0, `propose failed: ${r.stderr}`);
    const log = spawnSync('git', ['-C', dir, 'log', '--oneline'], { encoding: 'utf8' });
    const lines = log.stdout.trim().split('\n');
    // Expected commits: initial empty + propose. Index regen may add 1 more
    // if the landing index actually changed; with a single new session it
    // does, so total is 3.
    assert.ok(lines.length >= 2, `expected >=2 commits, got ${lines.length}: ${log.stdout}`);
    const proposeLine = lines.find(l => /vibesift: propose one-commit/.test(l));
    assert.ok(proposeLine, `expected a "vibesift: propose" commit; got:\n${log.stdout}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('propose does not clobber an existing session', () => {
  const { dir, env } = makeRepo({ withPackageJson: true });
  try {
    const r1 = runCli(dir, env, [
      'propose', 'dup', '--title', 'first', '--problem', '', '--no-open',
    ]);
    assert.equal(r1.status, 0, `first propose failed: ${r1.stderr}`);
    const htmlPath = join(dir, 'docs', 'sessions', 'dup', 'index.html');
    const before = readFileSync(htmlPath, 'utf8');
    const r2 = runCli(dir, env, [
      'propose', 'dup', '--title', 'second', '--problem', 'changed', '--no-open',
    ]);
    assert.equal(r2.status, 0, `second propose should exit 0; got ${r2.status}: ${r2.stderr}`);
    assert.match(r2.stdout, /already exists/);
    const after = readFileSync(htmlPath, 'utf8');
    assert.equal(after, before, 'existing session HTML must not be modified');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('propose --no-commit writes the file but skips the commit', () => {
  const { dir, env } = makeRepo({ withPackageJson: true });
  try {
    const logBefore = spawnSync('git', ['-C', dir, 'log', '--oneline'], { encoding: 'utf8' });
    const commitsBefore = logBefore.stdout.trim().split('\n').length;

    const r = runCli(dir, env, [
      'propose', 'preview',
      '--title', 'Preview',
      '--problem', '',
      '--no-open',
      '--no-commit',
    ]);
    assert.equal(r.status, 0, `propose failed: ${r.stderr}`);
    const htmlPath = join(dir, 'docs', 'sessions', 'preview', 'index.html');
    assert.ok(existsSync(htmlPath), 'file must still be written');
    assert.match(r.stderr, /no-commit set/, 'should warn about --no-commit');

    const logAfter = spawnSync('git', ['-C', dir, 'log', '--oneline'], { encoding: 'utf8' });
    const commitsAfter = logAfter.stdout.trim().split('\n').length;
    assert.equal(commitsAfter, commitsBefore, 'no new commits should land');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('propose fails clearly when slug is invalid and stdin is non-TTY', () => {
  const { dir, env } = makeRepo({ withPackageJson: true });
  try {
    // No slug arg, no --title, non-TTY stdin: promptLine returns the fallback
    // and slug stays empty → validation error.
    const r = runCli(dir, env, ['propose']);
    assert.notEqual(r.status, 0, 'should fail with no slug + non-TTY');
    assert.match(r.stderr, /slug required/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('propose on a non-node repo still works (unknown projectKind)', () => {
  const { dir, env } = makeRepo({ withPackageJson: false });
  try {
    const r = runCli(dir, env, [
      'propose', 'plain',
      '--title', 'Plain repo',
      '--problem', '',
      '--no-open',
    ]);
    assert.equal(r.status, 0, `propose failed: ${r.stderr}`);
    const htmlPath = join(dir, 'docs', 'sessions', 'plain', 'index.html');
    const html = readFileSync(htmlPath, 'utf8');
    assert.ok(html.includes('Plain repo'));
    // Unknown projects use the generic scaffold (Scaffold/Wire/Test/...)
    assert.ok(/Scaffold/.test(html), 'expected generic scaffold task');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
