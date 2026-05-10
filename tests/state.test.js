import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyState, advancePhase, appendDecision, addOption, addConstraint,
  addTask, markTaskDone, markDeployed, setRationale, setDiffUrl, parseState, PHASES,
} from '../src/state.js';
import { renderHTML } from '../src/template.js';

test('emptyState has all phases initialized', () => {
  const s = emptyState({ slug: 'foo', title: 'Foo' });
  assert.equal(s.slug, 'foo');
  assert.equal(s.phase, 'scope');
  assert.deepEqual(s.scope.constraints, []);
  assert.deepEqual(s.sift.options, []);
  assert.deepEqual(s.ship.tasks, []);
});

test('advancePhase moves through scope → sift → ship', () => {
  const s = emptyState({ slug: 'a', title: 'A' });
  advancePhase(s);
  assert.equal(s.phase, 'sift');
  advancePhase(s);
  assert.equal(s.phase, 'ship');
  advancePhase(s);
  assert.equal(s.phase, 'ship', 'no further advance');
});

test('appendDecision records phase + text and updates phase decision', () => {
  const s = emptyState({ slug: 'a', title: 'A' });
  appendDecision(s, 'scope', 'we will build X');
  assert.equal(s.scope.decision, 'we will build X');
  assert.ok(s.scope.decidedAt);
  assert.equal(s.decisions.length, 1);
});

test('appendDecision rejects unknown phase', () => {
  const s = emptyState({ slug: 'a', title: 'A' });
  assert.throws(() => appendDecision(s, 'bogus', 'x'), /unknown phase/);
});

test('addTask returns sequential ids; markTaskDone flips flag', () => {
  const s = emptyState({ slug: 'a', title: 'A' });
  const id1 = addTask(s, 'first');
  const id2 = addTask(s, 'second');
  assert.equal(id1, 1);
  assert.equal(id2, 2);
  markTaskDone(s, 1);
  assert.equal(s.ship.tasks[0].done, true);
  assert.equal(s.ship.tasks[1].done, false);
});

test('markTaskDone throws on missing id', () => {
  const s = emptyState({ slug: 'a', title: 'A' });
  assert.throws(() => markTaskDone(s, 99), /task 99 not found/);
});

test('addOption + addConstraint + setRationale + setDiffUrl', () => {
  const s = emptyState({ slug: 'a', title: 'A' });
  addOption(s, 'use Postgres');
  addOption(s, 'use SQLite');
  addConstraint(s, 'budget under $50/mo');
  setRationale(s, 'SQLite fits the deployment shape');
  setDiffUrl(s, 'https://github.com/x/y/compare/main...feature');
  assert.equal(s.sift.options.length, 2);
  assert.equal(s.scope.constraints[0], 'budget under $50/mo');
  assert.equal(s.sift.rationale, 'SQLite fits the deployment shape');
  assert.equal(s.ship.diffUrl, 'https://github.com/x/y/compare/main...feature');
});

test('parseState round-trips through renderHTML', () => {
  const original = emptyState({ slug: 'rt', title: 'Round Trip', branch: 'main' });
  addConstraint(original, 'no external services');
  appendDecision(original, 'scope', 'static-only');
  addOption(original, 'option A');
  addOption(original, 'option B');
  appendDecision(original, 'sift', 'option A');
  setRationale(original, 'simpler');
  advancePhase(original);
  advancePhase(original);
  addTask(original, 'write CLI');
  addTask(original, 'write tests');
  markTaskDone(original, 1);
  const html = renderHTML(original);
  const recovered = parseState(html);
  assert.deepEqual(recovered, original);
});

test('PHASES is the expected ordered list', () => {
  assert.deepEqual(PHASES, ['scope', 'sift', 'ship']);
});

test('setDiffUrl updates ship.diffUrl and bumps updatedAt', async () => {
  const s = emptyState({ slug: 'd', title: 'D' });
  assert.equal(s.ship.diffUrl, null);
  const before = s.updatedAt;
  // Yield the event loop so Date.now() can advance — node test runs fast
  // enough on hot caches that two calls within the same millisecond are
  // common, which would mask a "did we touch updatedAt?" bug.
  await new Promise(resolve => setTimeout(resolve, 2));
  setDiffUrl(s, 'https://github.com/o/r/pull/42');
  assert.equal(s.ship.diffUrl, 'https://github.com/o/r/pull/42');
  assert.ok(s.updatedAt > before, 'updatedAt should advance');
});

test('addTask accepts optional {agent} and persists it', () => {
  const s = emptyState({ slug: 'a', title: 'A' });
  const id = addTask(s, 'wire the badge', { agent: 'alice' });
  assert.equal(id, 1);
  assert.equal(s.ship.tasks[0].agent, 'alice');
  // Tasks added without agent should NOT carry the field at all,
  // so existing serialized sessions stay byte-identical.
  const id2 = addTask(s, 'no agent task');
  assert.equal(id2, 2);
  assert.equal(Object.prototype.hasOwnProperty.call(s.ship.tasks[1], 'agent'), false);
});

test('task with .agent round-trips through parseState(renderHTML(...))', () => {
  const original = emptyState({ slug: 'rt-agent', title: 'RT Agent' });
  advancePhase(original); advancePhase(original);
  addTask(original, 'task with agent', { agent: 'bob' });
  addTask(original, 'task without agent');
  const html = renderHTML(original);
  const recovered = parseState(html);
  assert.equal(recovered.ship.tasks[0].agent, 'bob');
  assert.equal(Object.prototype.hasOwnProperty.call(recovered.ship.tasks[1], 'agent'), false);
  assert.deepEqual(recovered, original);
});

test('addTask accepts optional {parentId} and persists it as parentId', () => {
  const s = emptyState({ slug: 'a', title: 'A' });
  const id1 = addTask(s, 'parent task');
  const id2 = addTask(s, 'child task', { parentId: id1 });
  assert.equal(id2, 2);
  assert.equal(s.ship.tasks[1].parentId, 1);
  // Tasks added without parentId should NOT carry the field, so existing
  // serialized sessions stay byte-identical.
  assert.equal(Object.prototype.hasOwnProperty.call(s.ship.tasks[0], 'parentId'), false);
});

test('addTask accepts both {parentId, agent} together', () => {
  const s = emptyState({ slug: 'a', title: 'A' });
  addTask(s, 'parent');
  const id = addTask(s, 'subtask', { parentId: 1, agent: 'worktree-A' });
  assert.equal(s.ship.tasks[1].parentId, 1);
  assert.equal(s.ship.tasks[1].agent, 'worktree-A');
  assert.equal(id, 2);
});

test('addTask throws when parentId points at a non-existent task', () => {
  const s = emptyState({ slug: 'a', title: 'A' });
  addTask(s, 'first');
  assert.throws(() => addTask(s, 'orphan', { parentId: 99 }), /parent task 99 not found/);
});

test('addTask throws when parentId is non-positive', () => {
  const s = emptyState({ slug: 'a', title: 'A' });
  addTask(s, 'first');
  assert.throws(() => addTask(s, 'bad', { parentId: 0 }), /parent task 0 not found/);
  assert.throws(() => addTask(s, 'bad', { parentId: -1 }), /parent task -1 not found/);
});

test('parentId round-trips through parseState(renderHTML(...))', () => {
  const original = emptyState({ slug: 'rt-parent', title: 'RT Parent' });
  advancePhase(original); advancePhase(original);
  addTask(original, 'parent', { agent: 'main' });
  addTask(original, 'child', { parentId: 1, agent: 'worktree-A' });
  addTask(original, 'flat task');
  const html = renderHTML(original);
  const recovered = parseState(html);
  assert.equal(recovered.ship.tasks[1].parentId, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(recovered.ship.tasks[2], 'parentId'), false);
  assert.deepEqual(recovered, original);
});

test('emptyState includes deployedAt: null', () => {
  const s = emptyState({ slug: 'a', title: 'A' });
  assert.equal(s.deployedAt, null);
});

test('markDeployed sets deployedAt and bumps updatedAt', async () => {
  const s = emptyState({ slug: 'a', title: 'A' });
  const before = s.updatedAt;
  await new Promise(resolve => setTimeout(resolve, 2));
  markDeployed(s);
  assert.ok(s.deployedAt > 0, 'deployedAt should be set');
  assert.ok(s.updatedAt > before, 'updatedAt should advance');
  assert.equal(s.deployedAt, s.updatedAt);
});

test('markDeployed is idempotent: calling twice keeps the first timestamp', async () => {
  const s = emptyState({ slug: 'a', title: 'A' });
  markDeployed(s);
  const firstDeploy = s.deployedAt;
  await new Promise(resolve => setTimeout(resolve, 2));
  markDeployed(s);
  assert.equal(s.deployedAt, firstDeploy, 'deployedAt should not be overwritten');
});

test('markDeployed honors opts.at for retroactive backfill', () => {
  const s = emptyState({ slug: 'a', title: 'A' });
  const past = Date.UTC(2026, 4, 9, 10, 0, 0); // 2026-05-09 10:00 UTC
  markDeployed(s, { at: past });
  assert.equal(s.deployedAt, past, 'deployedAt should be the override value');
  // updatedAt is when the mark happened (now), NOT the override timestamp,
  // because updatedAt is the audit trail of CLI activity.
  assert.ok(s.updatedAt > past, 'updatedAt should advance past the override timestamp');
});

test('markDeployed rejects non-finite or non-positive opts.at', () => {
  const s = emptyState({ slug: 'a', title: 'A' });
  assert.throws(() => markDeployed(s, { at: 'tomorrow' }), /finite positive/);
  assert.throws(() => markDeployed(s, { at: 0 }), /finite positive/);
  assert.throws(() => markDeployed(s, { at: -1 }), /finite positive/);
  assert.throws(() => markDeployed(s, { at: NaN }), /finite positive/);
});

test('opts.at override is ignored when deployedAt already set (idempotency wins)', () => {
  const s = emptyState({ slug: 'a', title: 'A' });
  markDeployed(s);
  const original = s.deployedAt;
  const past = Date.UTC(2026, 0, 1);
  markDeployed(s, { at: past });
  assert.equal(s.deployedAt, original, 'override should not overwrite existing deployedAt');
});

test('deployedAt round-trips through parseState(renderHTML(...))', () => {
  const original = emptyState({ slug: 'rt-deploy', title: 'RT Deploy' });
  advancePhase(original); advancePhase(original);
  markDeployed(original);
  const html = renderHTML(original);
  const recovered = parseState(html);
  assert.equal(recovered.deployedAt, original.deployedAt);
  assert.deepEqual(recovered, original);
});
