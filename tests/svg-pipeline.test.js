import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPipeline } from '../src/svg-pipeline.js';

const ACCENT = '#facc15';
const POSITIVE = '#22c55e';

// Locate the <g class="pipeline-stage" data-stage="<name>" data-status="<s>">
// header for a given stage and return the data-status attribute. Tests rely
// on this stable hook rather than positional substring scans so the assertions
// don't break on layout tweaks.
function statusOf(svg, stageName) {
  const re = new RegExp(
    `<g class="pipeline-stage" data-stage="${stageName.toLowerCase()}" data-status="([^"]+)"`
  );
  const m = svg.match(re);
  assert.ok(m, `stage ${stageName} not found in SVG`);
  return m[1];
}

test('renderPipeline returns a non-empty SVG string', () => {
  const svg = renderPipeline({ phase: 'scope' });
  assert.equal(typeof svg, 'string');
  assert.ok(svg.length > 0);
  assert.ok(svg.startsWith('<svg'), 'output starts with <svg');
});

test('all 5 stage labels are present', () => {
  const svg = renderPipeline({ phase: 'scope' });
  for (const stage of ['Idea', 'Scope', 'Sift', 'Ship', 'Deployed']) {
    assert.ok(svg.includes(stage), `missing stage label: ${stage}`);
  }
});

test('phase=scope marks Scope current; Idea completed; later stages pending', () => {
  const svg = renderPipeline({ phase: 'scope' });
  assert.equal(statusOf(svg, 'Idea'), 'completed');
  assert.equal(statusOf(svg, 'Scope'), 'current');
  assert.equal(statusOf(svg, 'Sift'), 'pending');
  assert.equal(statusOf(svg, 'Ship'), 'pending');
  assert.equal(statusOf(svg, 'Deployed'), 'pending');
  // Accent color must appear (current stage fill).
  assert.ok(svg.includes(ACCENT), 'accent color present');
});

test('phase=sift marks Sift current; Idea+Scope completed', () => {
  const svg = renderPipeline({ phase: 'sift' });
  assert.equal(statusOf(svg, 'Idea'), 'completed');
  assert.equal(statusOf(svg, 'Scope'), 'completed');
  assert.equal(statusOf(svg, 'Sift'), 'current');
  assert.equal(statusOf(svg, 'Ship'), 'pending');
  assert.equal(statusOf(svg, 'Deployed'), 'pending');
  assert.ok(svg.includes(ACCENT));
  assert.ok(svg.includes(POSITIVE));
});

test('phase=ship without deployedAt marks Ship current', () => {
  const svg = renderPipeline({ phase: 'ship' });
  assert.equal(statusOf(svg, 'Idea'), 'completed');
  assert.equal(statusOf(svg, 'Scope'), 'completed');
  assert.equal(statusOf(svg, 'Sift'), 'completed');
  assert.equal(statusOf(svg, 'Ship'), 'current');
  assert.equal(statusOf(svg, 'Deployed'), 'pending');
});

test('phase=ship with deployedAt marks Deployed current; Ship completed', () => {
  const svg = renderPipeline({ phase: 'ship', deployedAt: 1715200000000 });
  assert.equal(statusOf(svg, 'Idea'), 'completed');
  assert.equal(statusOf(svg, 'Scope'), 'completed');
  assert.equal(statusOf(svg, 'Sift'), 'completed');
  assert.equal(statusOf(svg, 'Ship'), 'completed');
  assert.equal(statusOf(svg, 'Deployed'), 'current');
});

test('Idea is never the current stage even on a fresh state', () => {
  // Even with no recognized phase, the function defaults to Scope-as-current,
  // so Idea must always be "completed" (or at least never "current").
  const noPhase = renderPipeline({});
  assert.notEqual(statusOf(noPhase, 'Idea'), 'current');
  const scope = renderPipeline({ phase: 'scope' });
  assert.notEqual(statusOf(scope, 'Idea'), 'current');
});

test('SVG contains a <title> element for accessibility', () => {
  const svg = renderPipeline({ phase: 'sift' });
  assert.match(svg, /<title>Pipeline: current stage Sift<\/title>/);
});

test('output contains no <script> substring', () => {
  // Run across every phase value so the assertion catches a regression that
  // only fires for one particular code path.
  const states = [
    { phase: 'scope' },
    { phase: 'sift' },
    { phase: 'ship' },
    { phase: 'ship', deployedAt: 123 },
    {},
  ];
  for (const s of states) {
    const svg = renderPipeline(s);
    assert.ok(!svg.includes('<script'), `script tag present for ${JSON.stringify(s)}`);
  }
});

test('SVG uses viewBox + preserveAspectRatio so it scales rather than overflowing', () => {
  const svg = renderPipeline({ phase: 'scope' });
  assert.match(svg, /viewBox="0 0 \d+ \d+"/);
  assert.match(svg, /preserveAspectRatio="xMidYMid meet"/);
});

test('text elements declare a system font family', () => {
  const svg = renderPipeline({ phase: 'scope' });
  assert.match(svg, /font-family="ui-sans-serif, system-ui, sans-serif"/);
});

test('user-supplied state values cannot inject markup', () => {
  // Phase is the only state field consumed; an unrecognized phase falls back
  // to "Scope" and is never echoed into the SVG. This guards against future
  // changes that might start echoing state fields verbatim.
  const svg = renderPipeline({ phase: '"><script>alert(1)</script>' });
  assert.ok(!svg.includes('<script>alert(1)'), 'no raw script in output');
  assert.ok(!svg.includes('alert(1)'), 'phase never echoed into SVG');
});
