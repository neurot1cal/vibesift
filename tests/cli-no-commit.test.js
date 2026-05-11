// Verifies the --no-commit flag: file is still written, but autoCommit is
// skipped and stderr emits the warning. Spawns the CLI as a subprocess via
// spawnSync (NOT execSync — CodeQL js/indirect-command-line-injection flags
// shell-string interpolation; spawnSync with an argv array sends bytes
// verbatim with no shell parsing).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
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

// --parent <id> wires the parent linkage from CLI through to addTask. The
// state.js side is already covered by tests/state.test.js; this test only
// verifies the flag parsing + composition with --agent and that the
// resulting parentId is round-tripped into the rendered HTML.
test('ship task add --parent wires the parentId through to state', () => {
  const { dir, env } = makeRepo();
  try {
    mkdirSync(join(dir, 'docs', 'sessions'), { recursive: true });

    const initR = runCli(dir, env, ['init', 'demo', '--title', 'Demo', '--no-commit']);
    assert.equal(initR.status, 0, `init failed: ${initR.stderr}`);

    // First task — no parent. Becomes id 1.
    const t1 = runCli(dir, env, ['ship', 'demo', 'task', 'add', 'parent task', '--no-commit']);
    assert.equal(t1.status, 0, `task 1 failed: ${t1.stderr}`);

    // Second task — child of #1, with --agent composed alongside --parent.
    // Both flags should compose; order shouldn't matter.
    const t2 = runCli(dir, env, [
      'ship', 'demo', 'task', 'add', 'child task',
      '--parent', '1', '--agent', 'worker', '--no-commit',
    ]);
    assert.equal(t2.status, 0, `task 2 failed: ${t2.stderr}`);

    const htmlPath = join(dir, 'docs', 'sessions', 'demo', 'index.html');
    const html = readFileSync(htmlPath, 'utf8');
    // The state JSON block carries parentId — proves the flag survived
    // CLI parsing → addTask → render → parse pipeline.
    assert.match(html, /"parentId":\s*1/, 'rendered state must include parentId:1');
    assert.match(html, /"agent":\s*"worker"/, 'rendered state must include agent:worker');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ship task add --parent errors when parent id does not exist', () => {
  const { dir, env } = makeRepo();
  try {
    mkdirSync(join(dir, 'docs', 'sessions'), { recursive: true });

    const initR = runCli(dir, env, ['init', 'demo', '--title', 'Demo', '--no-commit']);
    assert.equal(initR.status, 0, `init failed: ${initR.stderr}`);

    // Add a child task pointing at a non-existent parent — must fail
    // non-zero with a recognisable error and not write to the HTML.
    const r = runCli(dir, env, [
      'ship', 'demo', 'task', 'add', 'orphan',
      '--parent', '99', '--no-commit',
    ]);
    assert.notEqual(r.status, 0, `expected non-zero exit; stderr: ${r.stderr}`);
    assert.match(r.stderr, /parent task 99 not found/, `stderr should report missing parent; got: ${r.stderr}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// `vibesift deploy <slug>` stamps state.deployedAt and is idempotent.
// We test both the first-time stamp AND the re-run no-op; --no-commit
// keeps the test off git so the assertion is purely about the file +
// stderr.
test('deploy --no-commit stamps deployedAt and is idempotent on second run', () => {
  const { dir, env } = makeRepo();
  try {
    mkdirSync(join(dir, 'docs', 'sessions'), { recursive: true });

    const initR = runCli(dir, env, ['init', 'demo', '--title', 'Demo', '--no-commit']);
    assert.equal(initR.status, 0, `init failed: ${initR.stderr}`);

    // First deploy: stamps deployedAt.
    const d1 = runCli(dir, env, ['deploy', 'demo', '--no-commit']);
    assert.equal(d1.status, 0, `first deploy failed: ${d1.stderr}`);

    const htmlPath = join(dir, 'docs', 'sessions', 'demo', 'index.html');
    let html = readFileSync(htmlPath, 'utf8');
    // deployedAt must now be a number (not null) in the embedded JSON.
    const m1 = html.match(/"deployedAt":\s*(\d+)/);
    assert.ok(m1, `deployedAt must be a numeric timestamp; got HTML state: ${html.slice(html.indexOf('"deployedAt"'), html.indexOf('"deployedAt"') + 60)}`);
    const firstStamp = Number(m1[1]);

    // Second deploy: no-op. Idempotent — stderr reports "already deployed",
    // exit code stays 0, and the timestamp does NOT change.
    const d2 = runCli(dir, env, ['deploy', 'demo', '--no-commit']);
    assert.equal(d2.status, 0, `second deploy failed: ${d2.stderr}`);
    assert.match(d2.stderr, /already deployed at/, `idempotent run should report existing date; got: ${d2.stderr}`);

    html = readFileSync(htmlPath, 'utf8');
    const m2 = html.match(/"deployedAt":\s*(\d+)/);
    assert.ok(m2, 'deployedAt still present after second deploy');
    assert.equal(Number(m2[1]), firstStamp, 'second deploy must NOT bump the timestamp');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('deploy without --no-commit creates exactly one commit', () => {
  const { dir, env } = makeRepo();
  try {
    mkdirSync(join(dir, 'docs', 'sessions'), { recursive: true });

    // Init WITH commit so we have a baseline.
    const initR = runCli(dir, env, ['init', 'demo', '--title', 'Demo']);
    assert.equal(initR.status, 0, `init failed: ${initR.stderr}`);

    const before = spawnSync('git', ['-C', dir, 'log', '--oneline'], { encoding: 'utf8' });
    const commitsBefore = before.stdout.trim().split('\n').length;

    const d = runCli(dir, env, ['deploy', 'demo']);
    assert.equal(d.status, 0, `deploy failed: ${d.stderr}`);

    const after = spawnSync('git', ['-C', dir, 'log', '--oneline'], { encoding: 'utf8' });
    const commitsAfter = after.stdout.trim().split('\n').length;
    assert.equal(commitsAfter, commitsBefore + 1, `deploy should add exactly one commit; before=${commitsBefore} after=${commitsAfter}`);
    assert.match(after.stdout, /vibesift: deployed demo/, `commit message should be 'vibesift: deployed demo'; got: ${after.stdout}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('end-to-end: parent + child task + deploy renders pipeline + tree SVG with agent badges', () => {
  const { dir, env } = makeRepo();
  try {
    mkdirSync(join(dir, 'docs', 'sessions'), { recursive: true });

    // Drive the full new flow: init → advance to ship → parent task with
    // agent → child task with --parent + --agent → deploy. Then read the
    // rendered HTML and assert the pipeline shows Deployed as current and
    // the tree SVG carries both task names and both agent badges.
    const calls = [
      ['init', 'e2e', '--title', 'E2E flow'],
      ['advance', 'e2e'],
      ['advance', 'e2e'],
      ['ship', 'e2e', 'task', 'add', 'parent task', '--agent', 'main'],
      ['ship', 'e2e', 'task', 'add', 'child task', '--parent', '1', '--agent', 'worktree-A'],
      ['deploy', 'e2e'],
    ];
    for (const args of calls) {
      const r = runCli(dir, env, args);
      assert.equal(r.status, 0, `${args.join(' ')} failed: ${r.stderr}`);
    }

    const html = readFileSync(join(dir, 'docs', 'sessions', 'e2e', 'index.html'), 'utf8');

    // After deploy, the lifecycle is concluded — every pipeline stage
    // renders as 'completed' and there is no 'current' stage.
    assert.match(html, /data-stage="deployed"[^>]*data-status="completed"/);
    assert.doesNotMatch(html, /data-status="current"/);
    // Tree SVG is present with both task names and agent badges.
    assert.match(html, /class="ship-tree"/);
    assert.match(html, />parent task</);
    assert.match(html, />child task</);
    assert.match(html, />main</);
    assert.match(html, />worktree-A</);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('deploy --at backfills with the override timestamp', () => {
  const { dir, env } = makeRepo();
  try {
    mkdirSync(join(dir, 'docs', 'sessions'), { recursive: true });
    const initR = runCli(dir, env, ['init', 'legacy', '--title', 'Legacy session']);
    assert.equal(initR.status, 0, `init failed: ${initR.stderr}`);

    const deployR = runCli(dir, env, ['deploy', 'legacy', '--at', '2026-05-09T22:56:18Z']);
    assert.equal(deployR.status, 0, `deploy --at failed: ${deployR.stderr}`);

    // The HTML's embedded JSON should carry the override as deployedAt.
    const html = readFileSync(join(dir, 'docs', 'sessions', 'legacy', 'index.html'), 'utf8');
    const expected = Date.UTC(2026, 4, 9, 22, 56, 18); // 2026-05-09 22:56:18 UTC
    assert.match(html, new RegExp(`"deployedAt": ${expected}`));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('deploy --at rejects unparseable date strings', () => {
  const { dir, env } = makeRepo();
  try {
    mkdirSync(join(dir, 'docs', 'sessions'), { recursive: true });
    runCli(dir, env, ['init', 's', '--title', 'S']);
    const r = runCli(dir, env, ['deploy', 's', '--at', 'not-a-date', '--no-commit']);
    assert.notEqual(r.status, 0, 'should exit non-zero');
    assert.match(r.stderr, /could not parse "not-a-date" as a date/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('init auto-regenerates the landing index', () => {
  const { dir, env } = makeRepo();
  try {
    mkdirSync(join(dir, 'docs', 'sessions'), { recursive: true });
    // Bootstrap to create the docs/index.html that index regen needs.
    const bootR = runCli(dir, env, ['bootstrap']);
    assert.equal(bootR.status, 0, `bootstrap failed: ${bootR.stderr}`);

    const initR = runCli(dir, env, ['init', 'autoindex', '--title', 'Auto-Index Session']);
    assert.equal(initR.status, 0, `init failed: ${initR.stderr}`);

    // docs/index.html should now reference the new session.
    const indexHtml = readFileSync(join(dir, 'docs', 'index.html'), 'utf8');
    assert.match(indexHtml, /href="sessions\/autoindex\/"/);

    // git log should show the index-regen commit landed alongside init.
    const log = spawnSync('git', ['-C', dir, 'log', '--oneline'], { encoding: 'utf8' });
    assert.match(log.stdout, /vibesift: index regenerated/);
    assert.match(log.stdout, /vibesift: scope started for autoindex/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('init --no-commit skips the index regen', () => {
  const { dir, env } = makeRepo();
  try {
    mkdirSync(join(dir, 'docs', 'sessions'), { recursive: true });
    runCli(dir, env, ['bootstrap']);
    const before = readFileSync(join(dir, 'docs', 'index.html'), 'utf8');

    const r = runCli(dir, env, ['init', 'preview-only', '--title', 'Preview', '--no-commit']);
    assert.equal(r.status, 0, `init failed: ${r.stderr}`);

    // index.html should be unchanged because --no-commit skipped the regen.
    const after = readFileSync(join(dir, 'docs', 'index.html'), 'utf8');
    assert.equal(after, before, 'docs/index.html should not have been touched');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('bootstrap aborts on a dirty working tree without --force', () => {
  const { dir, env } = makeRepo();
  try {
    // Leave an untracked file. `git status --porcelain` lists untracked
    // files with `??` so the dirty-tree check fires either way (staged or
    // untracked). Untracked is the more common real-world shape.
    spawnSync('sh', ['-c', `echo "junk" > "${dir}/scratch.txt"`], { env });

    const r = runCli(dir, env, ['bootstrap']);
    assert.notEqual(r.status, 0, 'bootstrap should exit non-zero on dirty tree');
    assert.match(r.stderr, /uncommitted file/);
    assert.match(r.stderr, /--force/);

    // No bootstrap commit should have been created.
    const log = spawnSync('git', ['-C', dir, 'log', '--oneline'], { encoding: 'utf8' });
    assert.doesNotMatch(log.stdout, /vibesift: bootstrap/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('bootstrap --force proceeds on a dirty tree', () => {
  const { dir, env } = makeRepo();
  try {
    spawnSync('sh', ['-c', `echo "junk" > "${dir}/scratch.txt"`], { env });

    const r = runCli(dir, env, ['bootstrap', '--force']);
    assert.equal(r.status, 0, `bootstrap --force failed: ${r.stderr}`);

    const log = spawnSync('git', ['-C', dir, 'log', '--oneline'], { encoding: 'utf8' });
    assert.match(log.stdout, /vibesift: bootstrap/);
    // The untracked scratch.txt should NOT have been pulled into the
    // bootstrap commit (autoCommit only stages docs/index.html explicitly).
    const showStaged = spawnSync('git', ['-C', dir, 'show', '--name-only', 'HEAD'], { encoding: 'utf8' });
    assert.doesNotMatch(showStaged.stdout, /scratch\.txt/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('non-init state-mutation commands auto-regen the landing index', () => {
  // The v0.2.7 fix: render, task done, decide, etc. — all state-mutation
  // commands now regenerate the landing. Before v0.2.7, only `init` did,
  // so the landing went stale the moment a session was edited. This test
  // simulates the stale-landing state by corrupting docs/index.html
  // post-init, then runs a non-init mutation and verifies the regen
  // restored the session row.
  const { dir, env } = makeRepo();
  try {
    mkdirSync(join(dir, 'docs', 'sessions'), { recursive: true });
    runCli(dir, env, ['bootstrap']);
    runCli(dir, env, ['init', 'm1', '--title', 'First']);

    // Corrupt the landing — remove the m1 session row entirely.
    const indexPath = join(dir, 'docs', 'index.html');
    let indexHtml = readFileSync(indexPath, 'utf8');
    indexHtml = indexHtml.replace(/<a class="sess-row"[\s\S]*?<\/a>\s*/g, '');
    writeFileSync(indexPath, indexHtml);
    spawnSync('git', ['-C', dir, 'add', 'docs/index.html'], { env });
    spawnSync('git', ['-C', dir, 'commit', '-m', 'test: corrupt landing'], { env });
    assert.doesNotMatch(readFileSync(indexPath, 'utf8'), /href="sessions\/m1\/"/, 'landing should be corrupted pre-render');

    // Run a render — a non-init state mutation. Regen should fire and
    // restore the m1 row.
    const r = runCli(dir, env, ['render', 'm1']);
    assert.equal(r.status, 0, `render failed: ${r.stderr}`);

    const indexAfter = readFileSync(indexPath, 'utf8');
    assert.match(indexAfter, /href="sessions\/m1\/"/, 'render should have regenerated the landing with m1');

    const log = spawnSync('git', ['-C', dir, 'log', '--oneline'], { encoding: 'utf8' });
    const regenCount = (log.stdout.match(/vibesift: index regenerated/g) || []).length;
    assert.ok(regenCount >= 2, `expected >=2 regen commits (init + render), got ${regenCount}: ${log.stdout}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('render --no-commit does not trigger an index regen commit', () => {
  const { dir, env } = makeRepo();
  try {
    mkdirSync(join(dir, 'docs', 'sessions'), { recursive: true });
    runCli(dir, env, ['bootstrap']);
    runCli(dir, env, ['init', 'preview', '--title', 'Preview']);

    const before = spawnSync('git', ['-C', dir, 'log', '--oneline'], { encoding: 'utf8' });
    const beforeCount = before.stdout.trim().split('\n').length;

    const r = runCli(dir, env, ['render', 'preview', '--no-commit']);
    assert.equal(r.status, 0, `render --no-commit failed: ${r.stderr}`);

    const after = spawnSync('git', ['-C', dir, 'log', '--oneline'], { encoding: 'utf8' });
    const afterCount = after.stdout.trim().split('\n').length;
    assert.equal(afterCount, beforeCount, `no new commits expected; before=${beforeCount} after=${afterCount}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
