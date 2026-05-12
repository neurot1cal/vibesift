import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyState, addConstraint, appendDecision, addOption,
  addTask, markTaskDone, advancePhase, setDiffUrl,
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

test('long constraints render as collapsible <details> records', () => {
  const s = emptyState({ slug: 'a', title: 'A' });
  const longText = 'Must run on Node 20+ with no native deps. Reason: the project ships across ARM, x86, and Windows from a single tarball, and a native build step would require platform-specific binaries that npm cannot reliably distribute.';
  addConstraint(s, longText);
  const html = renderHTML(s);
  assert.match(html, /<details class="record">/);
  // Summary is the first sentence (terminator followed by whitespace).
  assert.match(html, /<summary>Must run on Node 20\+ with no native deps\.<\/summary>/);
  // Full text is present in the body.
  assert.ok(html.includes(longText), 'full constraint text present in body');
});

test('short constraints render inline, not collapsed', () => {
  const s = emptyState({ slug: 'a', title: 'A' });
  addConstraint(s, 'must work offline');
  const html = renderHTML(s);
  // No <details> wrapper around the short text.
  assert.match(html, /<span class="record-text">must work offline<\/span>/);
  assert.doesNotMatch(html, /<details class="record">[^<]*<summary>must work offline/);
});

test('long options render as collapsible records', () => {
  const s = emptyState({ slug: 'a', title: 'A' });
  advancePhase(s);
  addOption(s, 'Option B: regenerate the index from sessions on every commit. Single source of truth, but adds a code path and a template to maintain. Better fit at 5+ sessions.');
  const html = renderHTML(s);
  assert.match(html, /<details class="record">/);
  assert.match(html, /<summary>Option B: regenerate the index from sessions on every commit\.<\/summary>/);
});

test('long problem statement is collapsible', () => {
  const longProblem = 'docs/index.html is the bootstrap placeholder. First-time visitors see nothing useful, and the canonical dogfood session is not linked from the public surface.';
  const s = emptyState({ slug: 'a', title: 'A', problem: longProblem });
  const html = renderHTML(s);
  assert.match(html, /<details class="record">/);
  assert.match(html, /<summary>docs\/index\.html is the bootstrap placeholder\.<\/summary>/);
});

test('renderRecord falls back to char-truncation when no sentence boundary found', () => {
  const s = emptyState({ slug: 'a', title: 'A' });
  // Long text with no sentence terminator at all.
  const noPeriod = 'a long single-clause constraint with absolutely no sentence terminator anywhere within the first eighty characters or even after that point';
  addConstraint(s, noPeriod);
  const html = renderHTML(s);
  assert.match(html, /<details class="record">/);
  // Falls back to 77-char slice + ellipsis. Assert prefix + ellipsis terminator
  // rather than the exact cut-point so the test is robust to small wording changes.
  assert.match(html, /<summary>a long single-clause constraint with absolutely no sentence terminator/);
  assert.match(html, /…<\/summary>/);
});

test('diff link renders only when diffUrl is set', () => {
  const withUrl = emptyState({ slug: 'a', title: 'A' });
  setDiffUrl(withUrl, 'https://github.com/o/r/pull/42');
  const htmlWith = renderHTML(withUrl);
  assert.match(htmlWith, /class="diff-link"/);
  assert.match(htmlWith, /href="https:\/\/github\.com\/o\/r\/pull\/42"/);
  assert.match(htmlWith, /View diff/);

  const without = emptyState({ slug: 'b', title: 'B' });
  assert.equal(without.ship.diffUrl, null);
  const htmlWithout = renderHTML(without);
  assert.doesNotMatch(htmlWithout, /class="diff-link"/);
  assert.doesNotMatch(htmlWithout, /View diff/);
});

test('task with agent renders the .task-agent badge', () => {
  const s = emptyState({ slug: 'a', title: 'A' });
  advancePhase(s); advancePhase(s);
  addTask(s, 'wire the badge', { agent: 'alice' });
  const html = renderHTML(s);
  assert.match(html, /<span class="task-agent">alice<\/span>/);
});

test('task agent name is HTML-escaped to prevent injection', () => {
  const s = emptyState({ slug: 'a', title: 'A' });
  advancePhase(s); advancePhase(s);
  addTask(s, 'safe task', { agent: '<script>alert(1)</script>' });
  const html = renderHTML(s);
  // The raw script tag must NOT appear inside the rendered task badge.
  // Slice off the embedded JSON state block (which contains the raw payload
  // in JSON-escaped form) before asserting.
  const beforeStateBlock = html.split('id="vibesift-state"')[0];
  assert.ok(
    !beforeStateBlock.includes('<script>alert(1)</script>'),
    'raw script tag must not appear in rendered HTML'
  );
  assert.match(
    beforeStateBlock,
    /<span class="task-agent">&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/span>/
  );
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

test('pipeline SVG renders in the page header for any session', () => {
  const s = emptyState({ slug: 'p', title: 'P' });
  const html = renderHTML(s);
  assert.match(html, /<div class="pipeline"/);
  assert.match(html, /<svg [^>]*role="img"/);
  // All five stage labels appear in the SVG.
  for (const stage of ['Idea', 'Scope', 'Sift', 'Ship', 'Deployed']) {
    assert.match(html, new RegExp(`>${stage}<`), `pipeline missing stage: ${stage}`);
  }
});

test('pipeline marks the current stage based on phase', () => {
  const s = emptyState({ slug: 'p', title: 'P' });
  advancePhase(s); // → sift
  const html = renderHTML(s);
  // The pipeline tags each pill with data-status; the current one is "current".
  assert.match(html, /data-stage="sift"[^>]*data-status="current"/);
});

test('ship-tree SVG is absent when no tasks', () => {
  const s = emptyState({ slug: 't', title: 'T' });
  advancePhase(s); advancePhase(s);
  const html = renderHTML(s);
  assert.doesNotMatch(html, /class="ship-tree"/);
});

test('toolbar contains both theme-toggle and copy-prompt buttons', () => {
  const s = emptyState({ slug: 'p', title: 'P' });
  const html = renderHTML(s);
  assert.match(html, /<div class="toolbar">/);
  assert.match(html, /<button id="copy-prompt"[^>]*>⎘ COPY AS PROMPT<\/button>/);
  assert.match(html, /<button id="theme-toggle"[^>]*>◐ DARK<\/button>/);
});

test('toolbar contains the live auto-refresh pill', () => {
  const s = emptyState({ slug: 'p', title: 'P' });
  const html = renderHTML(s);
  assert.match(html, /<button id="live-indicator"[^>]*>● LIVE<\/button>/);
  assert.match(html, /aria-label="Toggle live auto-refresh"/);
});

test('rendered page embeds the live-poll script', () => {
  const s = emptyState({ slug: 'p', title: 'P' });
  const html = renderHTML(s);
  // The poll loop should be present.
  assert.match(html, /setInterval\(tick, INTERVAL\)/);
  // It must read updatedAt from the embedded state, not from a global.
  assert.match(html, /JSON\.parse\(stateEl\.textContent\)\.updatedAt/);
  // It must reload only when updatedAt changes (no eager reload loop).
  assert.match(html, /nextState\.updatedAt !== lastSeen/);
  // localStorage key matches the theme-toggle convention.
  assert.match(html, /'vibesift:live'/);
});

test('live-poll script does not contain a literal </script> tag', () => {
  // Critical: the poll script references the embedded state block's open
  // and close tags by string concatenation so that no literal `</script>`
  // appears inside the script body. A literal would terminate the script
  // early in browsers (which use a permissive HTML parser, not a JS one).
  const s = emptyState({ slug: 'p', title: 'P' });
  const html = renderHTML(s);
  // Find the LIVE poll script block and inspect only its contents.
  const startMarker = 'setInterval(tick, INTERVAL)';
  const idx = html.indexOf(startMarker);
  assert.ok(idx > 0, 'expected to find live-poll script');
  // Walk back to the enclosing <script> open tag.
  const openIdx = html.lastIndexOf('<script>', idx);
  const closeIdx = html.indexOf('</script>', idx);
  assert.ok(openIdx > 0 && closeIdx > idx, 'malformed live-poll script tag');
  const scriptBody = html.slice(openIdx + '<script>'.length, closeIdx);
  // Body must not contain the literal close tag.
  assert.equal(scriptBody.indexOf('</script>'), -1, 'live-poll script body must not contain a literal </script>');
});

test('copy-prompt button has aria-label for screen readers', () => {
  const s = emptyState({ slug: 'p', title: 'P' });
  const html = renderHTML(s);
  assert.match(html, /id="copy-prompt"[^>]*aria-label="Copy this session as a prompt to paste into Claude"/);
});

test('THEME_SCRIPT contains the copy-as-prompt builder', () => {
  // Sanity check: the inline JS exports must include the prompt-builder
  // logic. Smoke-tests against the structured-prompt sections we promise.
  const s = emptyState({ slug: 'p', title: 'P' });
  const html = renderHTML(s);
  assert.match(html, /copy-prompt/);
  assert.match(html, /## Scope/);
  assert.match(html, /## Sift/);
  assert.match(html, /## Ship/);
  assert.match(html, /Continue from where this left off/);
});

test('scope decision is labeled "Approach" and rendered before constraints', () => {
  const s = emptyState({ slug: 'a', title: 'A', problem: 'a real problem' });
  addConstraint(s, 'a constraint');
  appendDecision(s, 'scope', 'pick option X for reasons');
  const html = renderHTML(s);
  // Label is "Approach", not "Decision".
  assert.match(html, /<span class="decision-label">Approach<\/span>/);
  assert.doesNotMatch(html, /<span class="decision-label">Decision<\/span>/);
  // The approach block appears BEFORE the Constraints heading in source order.
  const scopeSection = html.split('<h2>Scope</h2>')[1].split('<section id="sift"')[0];
  const approachIdx = scopeSection.indexOf('<span class="decision-label">Approach');
  const constraintsHeadingIdx = scopeSection.indexOf('<h3>Constraints</h3>');
  assert.ok(approachIdx > 0, 'approach block must be present');
  assert.ok(constraintsHeadingIdx > 0, 'constraints heading must be present');
  assert.ok(approachIdx < constraintsHeadingIdx, 'approach must precede constraints heading');
});

test('scope renders "Approach not yet set" prompt before approach is recorded', () => {
  const s = emptyState({ slug: 'a', title: 'A', problem: 'p' });
  addConstraint(s, 'c1');
  const html = renderHTML(s);
  assert.match(html, /Approach not yet set/);
  assert.doesNotMatch(html, /<span class="decision-label">Approach<\/span>/);
});

test('sift decision label remains "Chose" — only scope was relabeled', () => {
  const s = emptyState({ slug: 'a', title: 'A' });
  advancePhase(s);
  appendDecision(s, 'sift', 'option B');
  const html = renderHTML(s);
  assert.match(html, /<span class="decision-label">Chose<\/span>/);
});

test('brand-mark links back to the docs root', () => {
  const s = emptyState({ slug: 'p', title: 'P' });
  const html = renderHTML(s);
  // The "vibesift" word is wrapped in an anchor pointing two levels up,
  // which from /sessions/<slug>/ resolves to the docs root landing page.
  assert.match(html, /<a class="brand-home" href="\.\.\/\.\.\/"[^>]*>vibesift<\/a>/);
});

test('ship-tree SVG renders when tasks exist, including agent labels', () => {
  const s = emptyState({ slug: 't', title: 'T' });
  advancePhase(s); advancePhase(s);
  addTask(s, 'parent task', { agent: 'main' });
  addTask(s, 'child task', { parentId: 1, agent: 'worktree-A' });
  const html = renderHTML(s);
  assert.match(html, /class="ship-tree"/);
  assert.match(html, />parent task</);
  assert.match(html, />child task</);
  assert.match(html, />worktree-A</);
});
