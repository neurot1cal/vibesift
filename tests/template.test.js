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

test('JSON state block escapes </script> to prevent breakout', () => {
  // Regression test: user-supplied text containing the literal `</script>`
  // would break out of the JSON block and execute as HTML/JS without the
  // </>/& encoding fix. This test asserts the encoding
  // is in place by feeding payloads that exercise each metacharacter.
  const s = emptyState({ slug: 'a', title: 'safe' });
  s.scope.constraints.push('</script><script>alert(1)</script>');
  s.scope.constraints.push('<!-- <script>alert(2)</script> -->');
  s.scope.constraints.push('alert("&" symbol)');
  const html = renderHTML(s);
  // Find the state block and assert no raw breakout sequences inside it.
  const stateMatch = html.match(/<script type="application\/json" id="vibesift-state">\s*([\s\S]*?)\s*<\/script>/);
  assert.ok(stateMatch, 'state block must be present');
  const body = stateMatch[1];
  // The bytes `</script` MUST NOT appear inside the JSON, even though
  // the ATTACKER's input contained that exact sequence.
  assert.doesNotMatch(body, /<\/script/i, 'no raw </script in JSON');
  assert.doesNotMatch(body, /<!--/, 'no raw HTML comment opener');
  // The payload must be present in escaped form (round-trippable).
  // JSON parsing of the body should succeed and preserve the strings.
  const parsed = JSON.parse(body);
  assert.equal(parsed.scope.constraints[0], '</script><script>alert(1)</script>');
  assert.equal(parsed.scope.constraints[1], '<!-- <script>alert(2)</script> -->');
  assert.equal(parsed.scope.constraints[2], 'alert("&" symbol)');
});
