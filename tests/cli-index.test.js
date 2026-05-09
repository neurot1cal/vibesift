import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  regenerateLandingIndex, START_MARKER, END_MARKER, REGEN_NOTICE,
  renderSessionRow,
} from '../src/index-renderer.js';
import { emptyState, advancePhase, appendDecision } from '../src/state.js';
import { renderHTML } from '../src/template.js';

// Build a minimal landing matching the markup of the real docs/index.html so
// the migration path has the structure it expects to find.
function landingHtml({ withMarkers = false } = {}) {
  const sessionsInner = withMarkers
    ? `\n    ${START_MARKER}\n    ${END_MARKER}\n  `
    : '\n  ';
  return [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8"><title>vibesift</title></head>',
    '<body>',
    '  <section class="hero"><h1>HERO_UNTOUCHED</h1></section>',
    '  <section class="sessions" aria-label="Sessions">',
    '    <h3 class="h2"><span class="h2-num">02</span><span class="rule"></span><span>sessions</span></h3>' + sessionsInner +
    '</section>',
    '  <footer>FOOTER_UNTOUCHED</footer>',
    '</body></html>',
    '',
  ].join('\n');
}

function setupTmpRepo({ withMarkers = false } = {}) {
  const tmp = mkdtempSync(join(tmpdir(), 'vibesift-index-test-'));
  mkdirSync(join(tmp, 'docs', 'sessions'), { recursive: true });
  writeFileSync(join(tmp, 'docs', 'index.html'), landingHtml({ withMarkers }));
  return tmp;
}

function writeSession(tmp, slug, { title, updatedAt, phase = 'scope', shipped = false }) {
  const dir = join(tmp, 'docs', 'sessions', slug);
  mkdirSync(dir, { recursive: true });
  const state = emptyState({ slug, title });
  // Walk through the requested phase + ship-state without reaching for
  // wall-clock time — the test wants to control updatedAt precisely.
  if (phase === 'sift' || phase === 'ship') advancePhase(state);
  if (phase === 'ship') advancePhase(state);
  if (shipped) {
    appendDecision(state, 'ship', 'shipped');
  }
  state.updatedAt = updatedAt;
  if (shipped) state.ship.shippedAt = updatedAt;
  writeFileSync(join(dir, 'index.html'), renderHTML(state));
  return state;
}

test('regenerateLandingIndex injects markers + regen notice on first run', () => {
  const tmp = setupTmpRepo({ withMarkers: false });
  try {
    writeSession(tmp, 'a', { title: 'Alpha', updatedAt: 2_000_000_000_000, phase: 'ship' });
    writeSession(tmp, 'b', { title: 'Bravo', updatedAt: 1_000_000_000_000, phase: 'scope' });
    const result = regenerateLandingIndex({ repoRoot: tmp });
    assert.equal(result.changed, true);
    const after = readFileSync(join(tmp, 'docs', 'index.html'), 'utf8');
    assert.ok(after.includes(START_MARKER), 'START marker present');
    assert.ok(after.includes(END_MARKER), 'END marker present');
    assert.ok(after.includes(REGEN_NOTICE), 'regen notice present');
    // Hero, footer, h3 heading must survive.
    assert.ok(after.includes('HERO_UNTOUCHED'), 'hero preserved');
    assert.ok(after.includes('FOOTER_UNTOUCHED'), 'footer preserved');
    assert.ok(after.includes('<span>sessions</span>'), 'section heading preserved');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('regenerateLandingIndex sorts sessions newest first and preserves the env outside markers', () => {
  const tmp = setupTmpRepo({ withMarkers: true });
  try {
    // 'a' is older, 'b' is newer.
    writeSession(tmp, 'a', { title: 'Alpha', updatedAt: 1_000_000_000_000, phase: 'ship' });
    writeSession(tmp, 'b', { title: 'Bravo', updatedAt: 2_000_000_000_000, phase: 'scope' });
    const before = readFileSync(join(tmp, 'docs', 'index.html'), 'utf8');
    const beforeOutside = before.split(START_MARKER)[0] + '|||' + before.split(END_MARKER)[1];

    const result = regenerateLandingIndex({ repoRoot: tmp });
    assert.equal(result.changed, true);
    assert.equal(result.sessions.length, 2);

    const after = readFileSync(join(tmp, 'docs', 'index.html'), 'utf8');

    // Both rows present.
    assert.match(after, /href="sessions\/a\/"/);
    assert.match(after, /href="sessions\/b\/"/);

    // Newest first: 'b' link comes before 'a' link.
    const idxB = after.indexOf('href="sessions/b/"');
    const idxA = after.indexOf('href="sessions/a/"');
    assert.ok(idxB > 0 && idxA > 0, 'both rows rendered');
    assert.ok(idxB < idxA, "'b' (newer) renders before 'a' (older)");

    // Everything OUTSIDE the markers is unchanged.
    const afterOutside = after.split(START_MARKER)[0] + '|||' + after.split(END_MARKER)[1];
    assert.equal(afterOutside, beforeOutside, 'bytes outside markers preserved');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('renderSessionRow encodes status, escapes title, and respects shipped state', () => {
  // Phase=ship + shippedAt set → plain (green) pip.
  const shipped = emptyState({ slug: 'shipped-one', title: 'Shipped <one>' });
  advancePhase(shipped); advancePhase(shipped);
  appendDecision(shipped, 'ship', 'done');
  shipped.updatedAt = Date.UTC(2026, 4, 9);
  shipped.ship.shippedAt = shipped.updatedAt;
  const shippedRow = renderSessionRow(shipped);
  assert.match(shippedRow, /class="sess-status">shipped/);
  assert.match(shippedRow, /Shipped &lt;one&gt;/, 'title HTML-escaped');

  // Phase=scope → is-active pip with phase label.
  const scoping = emptyState({ slug: 'scoping', title: 'Scoping' });
  scoping.updatedAt = Date.UTC(2026, 4, 1);
  const scopingRow = renderSessionRow(scoping);
  assert.match(scopingRow, /class="sess-status is-active">active · scope/);
  assert.match(scopingRow, /<span class="sess-date">2026-05-01<\/span>/);
});
