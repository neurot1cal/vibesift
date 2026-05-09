import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { emptyState, applyImportedPlan, parseState } from '../src/state.js';
import { renderHTML } from '../src/template.js';
import { loadPlan } from '../src/importPlan.js';

function fixtureRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'vibesift-import-'));
  // Init a real git repo so the cli's autoCommit doesn't error in higher-level
  // smoke tests; not strictly required for these unit tests but matches reality.
  try {
    execFileSync('git', ['init', '-q', dir], { stdio: 'ignore' });
    execFileSync('git', ['-C', dir, 'config', 'user.email', 'test@example.com'], { stdio: 'ignore' });
    execFileSync('git', ['-C', dir, 'config', 'user.name', 'Test'], { stdio: 'ignore' });
  } catch {
    // No git available — fine for unit tests below.
  }
  return dir;
}

function writePlan(dir, files) {
  const planDir = join(dir, 'plan');
  mkdirSync(planDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(planDir, name), content);
  }
  return planDir;
}

const SAMPLE_PRD = `# Sample Product

## 1. Problem

**Problem:** Users can't track their projects. They lose work between phases.

## 2. Goals

- **G1:** track all projects in one place
- **G2:** clear status at a glance

**Non-goals:** real-time collab; mobile apps.
`;

const SAMPLE_BP = `# Build Plan

## Phase I — Setup

*Focus: scaffolding only.*

### I.1 Auth

- [x] sign-up form
- [ ] sign-in form

### I.2 Profile

- [ ] profile page

## Phase II — Logic ✓ Complete

- [x] schema
- [x] permissions
`;

test('loadPlan: finds and parses both files', () => {
  const repo = fixtureRepo();
  const planDir = writePlan(repo, { 'PRD.md': SAMPLE_PRD, 'BUILD-PLAN.md': SAMPLE_BP });
  const r = loadPlan({ planDir, repoRoot: repo });
  assert.equal(r.ok, true);
  assert.equal(r.found.prdName, 'PRD.md');
  assert.equal(r.found.bpName, 'BUILD-PLAN.md');
  assert.equal(r.prdPath, 'plan/PRD.md');
  assert.equal(r.buildPlanPath, 'plan/BUILD-PLAN.md');
  assert.match(r.prd.problem, /track their projects/);
  assert.equal(r.buildPlan.tasks.length, 5);
  assert.equal(r.buildPlan.milestones.length, 2);
  assert.equal(r.buildPlan.milestones[1].status, 'complete');
});

test('loadPlan: missing dir returns ok:false', () => {
  const repo = fixtureRepo();
  const r = loadPlan({ planDir: join(repo, 'does-not-exist'), repoRoot: repo });
  assert.equal(r.ok, false);
  assert.match(r.reason, /not found/);
});

test('loadPlan: empty plan dir reports the right error', () => {
  const repo = fixtureRepo();
  const planDir = writePlan(repo, {});
  const r = loadPlan({ planDir, repoRoot: repo });
  assert.equal(r.ok, false);
  assert.match(r.reason, /no PRD or build-plan/);
});

test('loadPlan: PRD-only is allowed', () => {
  const repo = fixtureRepo();
  const planDir = writePlan(repo, { 'PRD.md': SAMPLE_PRD });
  const r = loadPlan({ planDir, repoRoot: repo });
  assert.equal(r.ok, true);
  assert.equal(r.buildPlan.tasks.length, 0);
  assert.equal(r.prd.goals.length, 2);
});

test('loadPlan: build-plan-only is allowed', () => {
  const repo = fixtureRepo();
  const planDir = writePlan(repo, { 'BUILD-PLAN.md': SAMPLE_BP });
  const r = loadPlan({ planDir, repoRoot: repo });
  assert.equal(r.ok, true);
  assert.equal(r.prd.problem, '');
  assert.equal(r.buildPlan.tasks.length, 5);
});

test('applyImportedPlan: sets state.plan, populates ship.tasks with milestones', () => {
  const state = emptyState({ slug: 's', title: 'S' });
  state.phase = 'ship';
  const result = applyImportedPlan(state, {
    prdPath: 'plan/PRD.md',
    buildPlanPath: 'plan/BUILD-PLAN.md',
    prd: { problem: 'p', goals: ['G1', 'G2'], nonGoals: ['NG'] },
    buildPlan: {
      tasks: [
        { milestone: 'M', subMilestone: 'S', text: 'a', done: false, inProgress: false },
        { milestone: 'M', subMilestone: 'S', text: 'b', done: true, inProgress: false },
      ],
      milestones: [{ title: 'M', status: null, note: 'note' }],
    },
  });
  assert.equal(result.added, 2);
  assert.equal(result.updated, 0);
  assert.equal(state.plan.prdPath, 'plan/PRD.md');
  assert.equal(state.plan.goals.length, 2);
  assert.equal(state.scope.problem, 'p', 'empty problem populated from PRD');
  assert.equal(state.ship.tasks.length, 2);
  assert.equal(state.ship.tasks[0].milestone, 'M');
  assert.equal(state.ship.tasks[1].done, true);
});

test('applyImportedPlan: re-running with same plan is a no-op', () => {
  const state = emptyState({ slug: 's', title: 'S' });
  const parsed = {
    prdPath: 'p', buildPlanPath: 'b',
    prd: { problem: '', goals: [], nonGoals: [] },
    buildPlan: {
      tasks: [{ milestone: 'M', subMilestone: 'S', text: 'a', done: false, inProgress: false }],
      milestones: [{ title: 'M', status: null, note: null }],
    },
  };
  applyImportedPlan(state, parsed);
  const tasksAfterFirst = JSON.parse(JSON.stringify(state.ship.tasks));
  const r2 = applyImportedPlan(state, parsed);
  assert.equal(r2.added, 0);
  assert.equal(r2.updated, 0);
  assert.deepEqual(state.ship.tasks, tasksAfterFirst);
});

test('applyImportedPlan: re-import flips done status when plan changes', () => {
  const state = emptyState({ slug: 's', title: 'S' });
  applyImportedPlan(state, {
    prdPath: 'p', buildPlanPath: 'b',
    prd: { problem: '', goals: [], nonGoals: [] },
    buildPlan: {
      tasks: [{ milestone: 'M', subMilestone: '', text: 'a', done: false, inProgress: false }],
      milestones: [{ title: 'M', status: null, note: null }],
    },
  });
  const r2 = applyImportedPlan(state, {
    prdPath: 'p', buildPlanPath: 'b',
    prd: { problem: '', goals: [], nonGoals: [] },
    buildPlan: {
      tasks: [{ milestone: 'M', subMilestone: '', text: 'a', done: true, inProgress: false }],
      milestones: [{ title: 'M', status: null, note: null }],
    },
  });
  assert.equal(r2.updated, 1);
  assert.equal(state.ship.tasks[0].done, true);
});

test('applyImportedPlan: preserves a manual scope decision', () => {
  const state = emptyState({ slug: 's', title: 'S', problem: 'manual problem' });
  applyImportedPlan(state, {
    prdPath: 'p', buildPlanPath: 'b',
    prd: { problem: 'PRD problem', goals: [], nonGoals: [] },
    buildPlan: { tasks: [], milestones: [] },
  });
  assert.equal(state.scope.problem, 'manual problem',
    'pre-existing problem must not be overwritten by PRD');
});

test('applyImportedPlan: leaves hand-added tasks untouched', () => {
  const state = emptyState({ slug: 's', title: 'S' });
  // Hand-added task — no milestone field.
  state.ship.tasks.push({ id: 1, text: 'manual task', done: false });
  applyImportedPlan(state, {
    prdPath: 'p', buildPlanPath: 'b',
    prd: { problem: '', goals: [], nonGoals: [] },
    buildPlan: {
      tasks: [{ milestone: 'M', subMilestone: '', text: 'plan task', done: false, inProgress: false }],
      milestones: [{ title: 'M', status: null, note: null }],
    },
  });
  assert.equal(state.ship.tasks.length, 2);
  assert.equal(state.ship.tasks[0].text, 'manual task');
  assert.equal(state.ship.tasks[0].milestone, undefined);
  assert.equal(state.ship.tasks[1].milestone, 'M');
});

test('imported state round-trips through renderHTML / parseState', () => {
  const state = emptyState({ slug: 'rt', title: 'RT' });
  state.phase = 'ship';
  applyImportedPlan(state, {
    prdPath: 'plan/PRD.md', buildPlanPath: 'plan/BUILD-PLAN.md',
    prd: { problem: 'p', goals: ['g1'], nonGoals: ['ng1'] },
    buildPlan: {
      tasks: [
        { milestone: 'M', subMilestone: 'S', text: 'a', done: true, inProgress: false },
        { milestone: 'M', subMilestone: 'S', text: 'b', done: false, inProgress: false },
      ],
      milestones: [{ title: 'M', status: null, note: 'note' }],
    },
  });
  const html = renderHTML(state);
  const recovered = parseState(html);
  assert.deepEqual(recovered, state);
});

test('renderHTML: plan summary block appears with progress bar', () => {
  const state = emptyState({ slug: 'a', title: 'A' });
  state.phase = 'ship';
  applyImportedPlan(state, {
    prdPath: 'plan/PRD.md', buildPlanPath: 'plan/BUILD-PLAN.md',
    prd: { problem: '', goals: [], nonGoals: [] },
    buildPlan: {
      tasks: [
        { milestone: 'M', subMilestone: '', text: 'a', done: true, inProgress: false },
        { milestone: 'M', subMilestone: '', text: 'b', done: false, inProgress: false },
      ],
      milestones: [{ title: 'M', status: null, note: null }],
    },
  });
  const html = renderHTML(state);
  assert.match(html, /class="plan-summary"/);
  assert.match(html, /50% complete/);
  assert.match(html, /1 \/ 2 tasks/);
  assert.match(html, /class="milestone"/);
});

test('renderHTML: no plan summary when state.plan is absent', () => {
  const state = emptyState({ slug: 'a', title: 'A' });
  const html = renderHTML(state);
  assert.doesNotMatch(html, /class="plan-summary"/);
});
