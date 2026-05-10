import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTree } from '../src/svg-tree.js';

// Helper: build a state with the given task list. We don't need the rest
// of the state shape — renderTree only reads state.ship.tasks.
const stateWith = tasks => ({ ship: { tasks } });

test('empty state.ship.tasks returns ""', () => {
  assert.equal(renderTree(stateWith([])), '');
});

test('missing ship/tasks branch returns "" (defensive)', () => {
  assert.equal(renderTree({}), '');
  assert.equal(renderTree({ ship: {} }), '');
});

test('single flat task: SVG contains the task text', () => {
  const svg = renderTree(stateWith([
    { id: 1, text: 'wire the badge', done: false },
  ]));
  assert.match(svg, /<svg /);
  assert.match(svg, /wire the badge/);
  // Single root, no connector path required.
  assert.doesNotMatch(svg, /class="tree-connector"/);
});

test('multiple flat tasks all render', () => {
  const svg = renderTree(stateWith([
    { id: 1, text: 'first', done: false },
    { id: 2, text: 'second', done: false },
    { id: 3, text: 'third', done: false },
  ]));
  assert.match(svg, /first/);
  assert.match(svg, /second/);
  assert.match(svg, /third/);
});

test('single-level child is indented further right than its parent', () => {
  const svg = renderTree(stateWith([
    { id: 1, text: 'parent', done: false },
    { id: 2, text: 'child',  done: false, parentId: 1 },
  ]));
  // Pull every status circle's cx attribute. Order matches row order.
  const cxs = [...svg.matchAll(/<circle [^>]*cx="(\d+(?:\.\d+)?)"/g)].map(m => parseFloat(m[1]));
  assert.equal(cxs.length, 2, 'two status circles for two rows');
  assert.ok(cxs[1] > cxs[0], `child cx (${cxs[1]}) should be > parent cx (${cxs[0]})`);
  // Connector should be present.
  assert.match(svg, /class="tree-connector"/);
});

test('grandchild renders without throwing and is deeper than child', () => {
  const svg = renderTree(stateWith([
    { id: 1, text: 'root', done: false },
    { id: 2, text: 'child', done: false, parentId: 1 },
    { id: 3, text: 'grandchild', done: false, parentId: 2 },
  ]));
  const cxs = [...svg.matchAll(/<circle [^>]*cx="(\d+(?:\.\d+)?)"/g)].map(m => parseFloat(m[1]));
  assert.equal(cxs.length, 3);
  assert.ok(cxs[0] < cxs[1], 'child > root');
  assert.ok(cxs[1] < cxs[2], 'grandchild > child');
});

test('done task gets the positive color and a line-through marker', () => {
  const svg = renderTree(stateWith([
    { id: 1, text: 'finished work', done: true },
  ]));
  // Filled circle with --positive.
  assert.match(svg, /fill="#22c55e"/);
  // Line-through on the text element.
  assert.match(svg, /text-decoration="line-through"/);
  // Done class marker for completeness.
  assert.match(svg, /class="task-label task-done"/);
});

test('todo task is hollow (stroke-only) circle', () => {
  const svg = renderTree(stateWith([
    { id: 1, text: 'pending', done: false },
  ]));
  assert.match(svg, /class="task-status task-status-todo"/);
  assert.match(svg, /fill="none"/);
});

test('task with agent renders the agent name in a badge', () => {
  const svg = renderTree(stateWith([
    { id: 1, text: 'do thing', done: false, agent: 'alice' },
  ]));
  assert.match(svg, /class="task-agent-badge"/);
  assert.match(svg, /class="task-agent-label"/);
  assert.match(svg, />alice</);
  // Yellow badge background (--accent), dark text (--bg).
  assert.match(svg, /fill="#facc15"/);
  assert.match(svg, /fill="#09090b"/);
});

test('task without agent emits no badge', () => {
  const svg = renderTree(stateWith([
    { id: 1, text: 'plain task', done: false },
  ]));
  assert.doesNotMatch(svg, /class="task-agent-badge"/);
});

test('task referencing missing parent does not throw and renders at depth 0', () => {
  // No id=99 anywhere — renderer should fall back to root depth.
  let svg;
  assert.doesNotThrow(() => {
    svg = renderTree(stateWith([
      { id: 1, text: 'orphan', done: false, parentId: 99 },
    ]));
  });
  assert.match(svg, /orphan/);
  // Depth 0 means cx == PAD_X + ICON_R == 8 + 5 == 13.
  const cx = parseFloat(svg.match(/<circle [^>]*cx="(\d+(?:\.\d+)?)"/)[1]);
  assert.equal(cx, 13);
  // No connector should be drawn for a missing-parent reference.
  assert.doesNotMatch(svg, /class="tree-connector"/);
});

test('output never contains a <script> tag', () => {
  const svg = renderTree(stateWith([
    { id: 1, text: 'normal',     done: false },
    { id: 2, text: 'with agent', done: true,  agent: 'bob', parentId: 1 },
  ]));
  assert.ok(!svg.includes('<script'), 'no <script> tag in SVG output');
});

test('user-supplied text is HTML-escaped (no XSS via task text or agent)', () => {
  const svg = renderTree(stateWith([
    { id: 1, text: '<img src=x onerror=alert(1)>', done: false, agent: '<b>x</b>' },
  ]));
  assert.ok(!svg.includes('<img src=x'), 'raw <img must not appear');
  assert.ok(!svg.includes('<b>x</b>'),    'raw <b>x</b> must not appear');
  assert.match(svg, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(svg, /&lt;b&gt;x&lt;\/b&gt;/);
});

test('long task text is truncated with an ellipsis', () => {
  const long = 'a'.repeat(80);
  const svg = renderTree(stateWith([
    { id: 1, text: long, done: false },
  ]));
  assert.ok(!svg.includes(long), 'full 80-char string should not survive');
  assert.match(svg, /…/);
});

test('SVG includes a <title> element as the first child for screen readers', () => {
  const svg = renderTree(stateWith([
    { id: 1, text: 'task one', done: true,  agent: 'alice' },
    { id: 2, text: 'task two', done: false, agent: 'bob'   },
    { id: 3, text: 'task three', done: false },
  ]));
  // <title> should sit immediately after the opening <svg ...> tag.
  assert.match(svg, /<svg [^>]*>\s*<title>/);
  assert.match(svg, /<title>Implementation tree: 3 tasks across 2 agents, 1 done<\/title>/);
});

test('SVG sets preserveAspectRatio for mobile-friendly scaling', () => {
  const svg = renderTree(stateWith([
    { id: 1, text: 'x', done: false },
  ]));
  assert.match(svg, /preserveAspectRatio="xMinYMin meet"/);
  assert.match(svg, /viewBox="0 0 \d+ \d+"/);
});
