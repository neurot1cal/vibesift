import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyState, addConstraint, appendDecision, addOption,
  addTask, markTaskDone, advancePhase,
} from '../src/state.js';
import { renderHTML } from '../src/template.js';

test('renderHTML produces a complete HTML document', () => {
  const s = emptyState({ slug: 'render-test', title: 'Render Test' });
  const html = renderHTML(s);
  assert.match(html, /<!doctype html>/);
  assert.match(html, /<title>Render Test<\/title>/);
  assert.match(html, /<script type="application\/json" id="vibesift-state">/);
});

test('Scoping badge appears for fresh session', () => {
  const s = emptyState({ slug: 'a', title: 'A' });
  const html = renderHTML(s);
  assert.match(html, /badge-active/);
  assert.match(html, />Scoping</);
});

test('Shipped badge appears after ship decision', () => {
  const s = emptyState({ slug: 'a', title: 'A' });
  advancePhase(s); advancePhase(s);
  appendDecision(s, 'ship', 'shipped to prod');
  const html = renderHTML(s);
  assert.match(html, /badge-shipped/);
  assert.match(html, />Shipped</);
});

test('escapes HTML in user-supplied text', () => {
  const s = emptyState({ slug: 'a', title: '<script>alert(1)</script>' });
  addConstraint(s, '<img src=x onerror=alert(1)>');
  const html = renderHTML(s);
  // The title escapes to &lt; — original raw script tag must NOT appear.
  // Note: the trailing </script> for the state JSON block is allowed.
  const beforeStateBlock = html.split('id="vibesift-state"')[0];
  assert.ok(!beforeStateBlock.includes('<script>alert(1)</script>'));
  assert.match(beforeStateBlock, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(beforeStateBlock, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('decision log lists every appended decision', () => {
  const s = emptyState({ slug: 'a', title: 'A' });
  appendDecision(s, 'scope', 'first decision');
  appendDecision(s, 'sift', 'second decision');
  const html = renderHTML(s);
  assert.match(html, /Decision log/);
  assert.match(html, /first decision/);
  assert.match(html, /second decision/);
});

test('task checklist renders done + todo states', () => {
  const s = emptyState({ slug: 'a', title: 'A' });
  advancePhase(s); advancePhase(s);
  addTask(s, 'task one');
  addTask(s, 'task two');
  markTaskDone(s, 1);
  const html = renderHTML(s);
  assert.match(html, /task-done.*task one/s);
  assert.match(html, /task-todo.*task two/s);
});

test('viewport meta tag present for mobile readability', () => {
  const s = emptyState({ slug: 'a', title: 'A' });
  const html = renderHTML(s);
  assert.match(html, /<meta name="viewport"/);
});
