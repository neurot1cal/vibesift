// 5-stage horizontal pipeline SVG: Idea → Scope → Sift → Ship → Deployed.
// Embedded near the top of every session's HTML so reviewers see lifecycle
// position at a glance. Inline SVG, scaled via viewBox so it fits a 375px
// mobile viewport without overflow. No animations, no <script>, no external
// resources — same self-contained discipline as the rest of the rendered page.

// Brand palette mirrored from CLAUDE.md. Don't drift. The accent yellow is
// the "Sift" / current-stage marker; positive green marks completed stages;
// pending stages are transparent fills with a neutral border + zinc text.
const ACCENT = '#facc15';   // current stage
const POSITIVE = '#22c55e'; // completed
const BG = '#09090b';       // text on filled pill (high contrast)
const PENDING_STROKE = '#52525b';
const PENDING_TEXT = '#a1a1aa';

const STAGES = ['Idea', 'Scope', 'Sift', 'Ship', 'Deployed'];

// Layout: 5 pills laid out left-to-right with arrow connectors between
// adjacent pills. viewBox 500x32 keeps the math integer-friendly and the
// page-layout impact small. Pill width 80 fits "Deployed" at 10px font;
// connector arrows live in the 20-unit gap between pills.
const PILL_W = 80;
const PILL_H = 24;
const GAP = 20;
const PAD_X = 10;
const VB_W = PAD_X * 2 + STAGES.length * PILL_W + (STAGES.length - 1) * GAP; // 500
const VB_H = 32;
const PILL_Y = (VB_H - PILL_H) / 2; // 4
const PILL_R = 12; // half of PILL_H — fully rounded ends

function escapeAttr(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Map session state → which stage index is current.
// Idea is NEVER current; by the time we render anything, init has happened.
// scope/sift/ship phase values map to stages 1/2/3. ship + deployedAt → 4.
// Falls back to "Scope" (index 1) for any unrecognized phase shape so the
// SVG never throws on a partial / future state object.
function currentStageIndex(state) {
  const s = state || {};
  if (s.phase === 'ship') return s.deployedAt ? 4 : 3;
  if (s.phase === 'sift') return 2;
  if (s.phase === 'scope') return 1;
  return 1;
}

function pillFor(label, status, x) {
  let fill, stroke, textFill;
  if (status === 'current') {
    fill = ACCENT;
    stroke = ACCENT;
    textFill = BG;
  } else if (status === 'completed') {
    fill = POSITIVE;
    stroke = POSITIVE;
    textFill = BG;
  } else {
    fill = 'transparent';
    stroke = PENDING_STROKE;
    textFill = PENDING_TEXT;
  }
  const cx = x + PILL_W / 2;
  const cy = PILL_Y + PILL_H / 2 + 0.5; // small optical nudge for baseline
  return (
    `<g class="pipeline-stage" data-stage="${escapeAttr(label.toLowerCase())}" data-status="${status}">` +
      `<rect x="${x}" y="${PILL_Y}" width="${PILL_W}" height="${PILL_H}" ` +
        `rx="${PILL_R}" ry="${PILL_R}" ` +
        `fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>` +
      `<text x="${cx}" y="${cy}" ` +
        `font-family="ui-sans-serif, system-ui, sans-serif" ` +
        `font-size="10" font-weight="600" ` +
        `text-anchor="middle" dominant-baseline="middle" ` +
        `fill="${textFill}">${escapeAttr(label)}</text>` +
    '</g>'
  );
}

// Connector: a short horizontal line + a small triangular arrowhead, drawn
// between pill (i) and pill (i+1). Color matches the upstream pill's status
// so a green→green run reads as continuous progress and the transition into
// the current/pending region is visually distinct.
function connectorFor(upstreamStatus, x) {
  let color;
  if (upstreamStatus === 'completed') color = POSITIVE;
  else if (upstreamStatus === 'current') color = ACCENT;
  else color = PENDING_STROKE;
  const y = PILL_Y + PILL_H / 2;
  const x1 = x + 3;
  const x2 = x + GAP - 6;
  // Arrowhead: 4-wide, 3-tall isoceles triangle pointing right.
  const tipX = x2 + 5;
  const baseTop = y - 3;
  const baseBot = y + 3;
  return (
    `<g class="pipeline-connector">` +
      `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" ` +
        `stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>` +
      `<polygon points="${x2},${baseTop} ${x2},${baseBot} ${tipX},${y}" ` +
        `fill="${color}"/>` +
    '</g>'
  );
}

export function renderPipeline(state) {
  const current = currentStageIndex(state);
  const parts = [];
  for (let i = 0; i < STAGES.length; i++) {
    const x = PAD_X + i * (PILL_W + GAP);
    let status;
    if (i < current) status = 'completed';
    else if (i === current) status = 'current';
    else status = 'pending';
    parts.push(pillFor(STAGES[i], status, x));
    if (i < STAGES.length - 1) {
      const connectorX = x + PILL_W;
      parts.push(connectorFor(status, connectorX));
    }
  }
  const currentLabel = STAGES[current];
  const title = `Pipeline: current stage ${currentLabel}`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" class="pipeline" ` +
      `viewBox="0 0 ${VB_W} ${VB_H}" ` +
      `preserveAspectRatio="xMidYMid meet" ` +
      `role="img" aria-label="${escapeAttr(title)}">` +
      `<title>${escapeAttr(title)}</title>` +
      parts.join('') +
    '</svg>'
  );
}
