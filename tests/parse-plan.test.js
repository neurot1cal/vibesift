import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePRD, parseBuildPlan, pickPlanFiles } from '../src/parsePlan.js';

test('parseBuildPlan: empty input returns empty arrays', () => {
  const r = parseBuildPlan('');
  assert.deepEqual(r.tasks, []);
  assert.deepEqual(r.milestones, []);
});

test('parseBuildPlan: H2 → milestone, H3 → subMilestone, checkboxes → tasks', () => {
  const md = `# Build Plan

## Phase I — Setup

### I.1 Accounts

- [x] sign-up form
- [ ] sign-in form
- [~] profile page

### I.2 Posting

- [ ] new project form
`;
  const { tasks, milestones } = parseBuildPlan(md);
  assert.equal(milestones.length, 1);
  assert.equal(milestones[0].title, 'Phase I — Setup');
  assert.equal(tasks.length, 4);
  assert.deepEqual(tasks[0], {
    milestone: 'Phase I — Setup',
    subMilestone: 'I.1 Accounts',
    text: 'sign-up form',
    done: true,
    inProgress: false,
  });
  assert.equal(tasks[1].done, false);
  assert.equal(tasks[2].inProgress, true);
  assert.equal(tasks[2].done, false);
  assert.equal(tasks[3].subMilestone, 'I.2 Posting');
});

test('parseBuildPlan: strips milestone status markers like "✓ Complete"', () => {
  const md = `## Phase III — Refactoring ✓ Complete

- [x] refactor stuff
`;
  const { milestones, tasks } = parseBuildPlan(md);
  assert.equal(milestones[0].title, 'Phase III — Refactoring');
  assert.equal(milestones[0].status, 'complete');
  assert.equal(tasks[0].milestone, 'Phase III — Refactoring');
});

test('parseBuildPlan: italic context becomes a milestone/sub note', () => {
  const md = `## Phase I

*Focus: responsive UI, mock data.*

### I.1 Setup

*Confirm: no real auth.*

- [ ] sign-in
`;
  const { milestones, tasks } = parseBuildPlan(md);
  assert.equal(milestones[0].note, 'Focus: responsive UI, mock data.');
  assert.equal(tasks[0].subMilestone, 'I.1 Setup');
});

test('parseBuildPlan: skips tables, prose, blockquotes, hrs', () => {
  const md = `## Phase I

| col | col |
| --- | --- |
| a | b |

This is prose that should be ignored.

> a quote

---

- [ ] real task
`;
  const { tasks } = parseBuildPlan(md);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].text, 'real task');
});

test('parseBuildPlan: H3 without preceding H2 synthesizes a "General" milestone', () => {
  const md = `### Loose section

- [ ] orphan task
`;
  const { milestones, tasks } = parseBuildPlan(md);
  assert.equal(milestones[0].title, 'General');
  assert.equal(tasks[0].milestone, 'General');
  assert.equal(tasks[0].subMilestone, 'Loose section');
});

test('parsePRD: extracts problem + goals + non-goals from typical PRD', () => {
  const md = `# Product

## 1. Vision & problem

**Vision:** something.

**Problem:** Construction bidding is hard. We need to fix it.

## 2. Goals (MVP)

- **G1 — Accounts:** users can sign in
- **G2 — Posting:** owners can post

**Non-goals (typical for MVP unless explicitly added later):** Full payment infra; native mobile apps.

## 3. Personas
`;
  const r = parsePRD(md);
  assert.match(r.problem, /Construction bidding is hard/);
  assert.equal(r.goals.length, 2);
  assert.match(r.goals[0], /G1 — Accounts/);
  // Inline "**Non-goals:** A; B." gets split on ; for separate display.
  assert.equal(r.nonGoals.length, 2);
  assert.match(r.nonGoals[0], /Full payment infra/);
  assert.match(r.nonGoals[1], /native mobile apps/);
});

test('parsePRD: handles dedicated Non-goals section', () => {
  const md = `## Goals

- ship MVP

## Non-goals

- payments
- mobile apps
`;
  const r = parsePRD(md);
  assert.equal(r.goals.length, 1);
  assert.equal(r.nonGoals.length, 2);
});

test('parsePRD: empty input returns empty result', () => {
  const r = parsePRD('');
  assert.equal(r.problem, '');
  assert.deepEqual(r.goals, []);
  assert.deepEqual(r.nonGoals, []);
});

test('pickPlanFiles: prefers PRD.md and BUILD-PLAN.md by name', () => {
  const r = pickPlanFiles(['PRD.md', 'BUILD-PLAN.md', 'README.md', 'notes.md']);
  assert.equal(r.prd, 'PRD.md');
  assert.equal(r.buildPlan, 'BUILD-PLAN.md');
});

test('pickPlanFiles: case-insensitive and finds variants', () => {
  const r = pickPlanFiles(['prd.markdown', 'roadmap.md', 'random.md']);
  assert.equal(r.prd, 'prd.markdown');
  assert.equal(r.buildPlan, 'roadmap.md');
});

test('pickPlanFiles: returns null when nothing matches', () => {
  const r = pickPlanFiles(['LICENSE', 'README.md']);
  // README isn't matched by either pattern set
  assert.equal(r.prd, null);
  assert.equal(r.buildPlan, null);
});

test('pickPlanFiles: avoids picking the same file for both roles', () => {
  // "plan.md" matches the build-plan patterns (it's the fallback). When it's
  // the only file, it should NOT also be selected as the PRD.
  const r = pickPlanFiles(['plan.md']);
  assert.equal(r.buildPlan, 'plan.md');
  assert.equal(r.prd, null);
});
