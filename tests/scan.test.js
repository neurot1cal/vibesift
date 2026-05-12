// Pure scan tests. No subprocess, no filesystem mocking beyond a tmpdir
// fixture: write fake project trees, point scanRepo at them, assert the
// classification + stubs/scaffolds.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanRepo, constraintStubsFor, taskScaffoldFor, humanizeSlug, slugify } from '../src/scan.js';

function makeFixture() {
  return mkdtempSync(join(tmpdir(), 'vibesift-scan-'));
}

test('scanRepo classifies a package.json project as node', () => {
  const dir = makeFixture();
  try {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'demo', version: '0.1.0',
      engines: { node: '20+' },
      dependencies: {},
      devDependencies: {},
    }));
    const out = scanRepo(dir);
    assert.equal(out.projectKind, 'node');
    assert.ok(out.languages.includes('javascript'));
    assert.equal(out.framework, null);
    assert.equal(out.bundler, null);
    assert.ok(out.packageJson, 'packageJson should be populated');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('scanRepo detects next + vite when present in deps', () => {
  const dir = makeFixture();
  try {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'app',
      dependencies: { next: '^14', react: '^18' },
      devDependencies: { vite: '^5' },
    }));
    const out = scanRepo(dir);
    assert.equal(out.framework, 'next');
    assert.equal(out.bundler, 'vite');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('scanRepo classifies Cargo.toml as rust', () => {
  const dir = makeFixture();
  try {
    writeFileSync(join(dir, 'Cargo.toml'), '[package]\nname = "demo"\n');
    const out = scanRepo(dir);
    assert.equal(out.projectKind, 'rust');
    assert.equal(out.hasCargoToml, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('scanRepo classifies pyproject.toml as python', () => {
  const dir = makeFixture();
  try {
    writeFileSync(join(dir, 'pyproject.toml'), '[project]\nname = "demo"\n');
    const out = scanRepo(dir);
    assert.equal(out.projectKind, 'python');
    assert.equal(out.hasPyProject, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('scanRepo treats package.json + Cargo.toml as mixed', () => {
  const dir = makeFixture();
  try {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'm' }));
    writeFileSync(join(dir, 'Cargo.toml'), '[package]\nname = "m"\n');
    const out = scanRepo(dir);
    assert.equal(out.projectKind, 'mixed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('scanRepo finds plan files in repo root', () => {
  const dir = makeFixture();
  try {
    writeFileSync(join(dir, 'PRD.md'), '# spec\n');
    writeFileSync(join(dir, 'PLAN.md'), '# plan\n');
    writeFileSync(join(dir, 'README.md'), '# readme\n');
    const out = scanRepo(dir);
    const paths = out.planFiles.map(f => f.path).sort();
    assert.deepEqual(paths, ['PLAN.md', 'PRD.md']);
    // README must not match.
    assert.ok(!paths.includes('README.md'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('scanRepo finds plan files inside plan/', () => {
  const dir = makeFixture();
  try {
    mkdirSync(join(dir, 'plan'));
    writeFileSync(join(dir, 'plan', 'BUILD_PLAN.md'), '# bp\n');
    writeFileSync(join(dir, 'plan', 'PRD.md'), '# prd\n');
    const out = scanRepo(dir);
    const kinds = out.planFiles.map(f => f.kind).sort();
    assert.ok(kinds.includes('plan'));
    assert.ok(kinds.includes('prd'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('constraintStubsFor includes zero-deps stub when package.json has no deps', () => {
  const dir = makeFixture();
  try {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'demo', engines: { node: '20.0.0' }, dependencies: {},
    }));
    const scan = scanRepo(dir);
    const stubs = constraintStubsFor(scan);
    assert.ok(stubs.some(s => s.includes('Node 20.0.0')), `got: ${stubs}`);
    assert.ok(stubs.some(s => s.toLowerCase().includes('dependencies')), `got: ${stubs}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('taskScaffoldFor returns project-appropriate starter tasks', () => {
  const node = taskScaffoldFor({ projectKind: 'node' });
  const python = taskScaffoldFor({ projectKind: 'python' });
  const unknown = taskScaffoldFor({ projectKind: 'unknown' });
  assert.ok(node.length >= 3);
  assert.notDeepEqual(node, python);
  assert.ok(unknown.length >= 3);
});

test('humanizeSlug capitalizes the first word only', () => {
  assert.equal(humanizeSlug('blue-widget-thing'), 'Blue widget thing');
  assert.equal(humanizeSlug(''), '');
  assert.equal(humanizeSlug('single'), 'Single');
});

test('slugify lowercases and replaces non-alphanumerics with dashes', () => {
  assert.equal(slugify('Build the THING!'), 'build-the-thing');
  assert.equal(slugify('  -leading-trailing-  '), 'leading-trailing');
  assert.equal(slugify(''), '');
});
