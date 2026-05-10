// Implementation task tree as a single inline SVG. Embedded inside the
// Ship section so reviewers see fan-out across parallel agents at a glance.
//
// Inputs come from `state.ship.tasks`, where each task is
// `{ id, text, done, agent?, parentId? }`. Tasks without parentId are roots
// (depth 0); tasks pointing at a parent id sit at parent.depth + 1. If a
// task references a parent id that doesn't exist, the function does NOT
// throw — it falls back to depth 0. state.js validates parents at add
// time, but the renderer stays defensive so a hand-edited state block
// never wedges the page.
//
// Geometry: single column, vertical layout. Each row is 24px tall. Status
// icon sits indented by depth * 24 px from the left margin. The
// L-shaped connector is drawn before the icon: a vertical line down the
// left side from the parent's row center to the child's row center, then
// a short horizontal nub feeding into the icon. No animations, no
// <script>, no external resources.

const COLOR_POSITIVE = '#22c55e';   // --positive: done indicator + done text
const COLOR_ACCENT = '#facc15';     // --accent: agent badge background
const COLOR_BG = '#09090b';         // --bg: agent badge text (AA on yellow)
const COLOR_TEXT = '#d4d4d8';       // neutral task text
const COLOR_TEXT_FAINT = '#71717a'; // hollow-circle stroke
const COLOR_CONNECTOR = '#52525b';  // tree connector lines

const ROW_H = 24;        // row height in px
const INDENT = 24;       // px per depth level
const ICON_R = 5;        // status circle radius
const PAD_X = 8;         // outer left/right padding
const ICON_TEXT_GAP = 10;// gap between status icon and task text
const TEXT_AGENT_GAP = 8;// gap between task text and agent badge
const FONT_SIZE = 13;    // px
const AGENT_FONT_SIZE = 10;
const MAX_TEXT_CHARS = 30; // truncation budget — readability over aggression
const FONT_FAMILY = 'ui-sans-serif, system-ui, sans-serif';

// SVG attribute escape — XML 1.0 metacharacters. Same shape as
// template.js's escapeHtml so output is safe to embed in HTML.
const escapeAttr = s =>
  String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

// Truncate to MAX_TEXT_CHARS in JS, not via SVG textLength or CSS overflow.
// SVG <text> has no overflow:hidden equivalent, so a long task name would
// run off the viewBox and clip silently. Slice + ellipsis keeps the layout
// predictable and the screen-reader title accurate.
function truncate(text) {
  const s = String(text || '');
  if (s.length <= MAX_TEXT_CHARS) return s;
  return s.slice(0, MAX_TEXT_CHARS - 1) + '…';
}

// Estimate text width for viewBox sizing. Actual width depends on the
// renderer's font metrics, but we don't have those at SVG-generation time.
// 0.6em per char is a reasonable upper bound for ui-sans-serif at the
// sizes we use; viewBox preserveAspectRatio=meet handles the rest.
function estimateWidth(text, fontSize) {
  return Math.ceil(String(text || '').length * fontSize * 0.6);
}

// Build the depth map for every task in declaration order.
// Returns an array of { task, depth } in the same order as state.ship.tasks.
// Defensive: a task referencing a missing parent renders at depth 0.
function buildLayout(tasks) {
  const depthById = new Map();
  return tasks.map(task => {
    let depth = 0;
    if (task.parentId !== undefined && task.parentId !== null) {
      const parentDepth = depthById.get(task.parentId);
      if (parentDepth !== undefined) {
        depth = parentDepth + 1;
      }
      // If parentDepth is undefined, the parent doesn't exist (yet, or
      // ever). Treat as a root. This should not happen because state.js
      // validates parents at add time, but the renderer stays defensive.
    }
    depthById.set(task.id, depth);
    return { task, depth };
  });
}

// Find the most recent ancestor row for a child — used to draw the
// vertical connector segment. Walks backwards through prior rows to find
// the row that owns the child's parentId.
function findParentRow(rows, childIdx) {
  const child = rows[childIdx];
  if (child.task.parentId === undefined || child.task.parentId === null) {
    return -1;
  }
  for (let i = childIdx - 1; i >= 0; i--) {
    if (rows[i].task.id === child.task.parentId) return i;
  }
  return -1; // missing parent — no connector drawn
}

export function renderTree(state) {
  const tasks = state?.ship?.tasks || [];
  if (tasks.length === 0) return '';

  const rows = buildLayout(tasks);
  const maxDepth = rows.reduce((m, r) => Math.max(m, r.depth), 0);

  // Width budget: deepest indent + icon + gap + estimated text width
  // (truncated) + agent badge if any + paddings. Take the max across rows.
  const widths = rows.map(({ task, depth }) => {
    const truncated = truncate(task.text);
    const textW = estimateWidth(truncated, FONT_SIZE);
    let agentW = 0;
    if (task.agent) {
      // Badge: 6px horizontal padding either side + estimated text width.
      agentW = TEXT_AGENT_GAP + 12 + estimateWidth(task.agent, AGENT_FONT_SIZE);
    }
    return PAD_X + depth * INDENT + ICON_R * 2 + ICON_TEXT_GAP + textW + agentW + PAD_X;
  });
  const width = Math.max(240, ...widths);
  const height = rows.length * ROW_H + 8; // small bottom pad

  const doneCount = tasks.filter(t => t.done).length;
  const agentSet = new Set(tasks.filter(t => t.agent).map(t => t.agent));
  const titleText = `Implementation tree: ${tasks.length} task${tasks.length === 1 ? '' : 's'}` +
    (agentSet.size ? ` across ${agentSet.size} agent${agentSet.size === 1 ? '' : 's'}` : '') +
    `, ${doneCount} done`;

  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" class="task-tree" ` +
    `viewBox="0 0 ${width} ${height}" ` +
    `width="${width}" height="${height}" ` +
    `preserveAspectRatio="xMinYMin meet" role="img" ` +
    `aria-label="${escapeAttr(titleText)}">`
  );
  parts.push(`<title>${escapeAttr(titleText)}</title>`);

  // Pass 1: connectors. Drawn first so icons sit on top.
  rows.forEach((row, idx) => {
    const parentIdx = findParentRow(rows, idx);
    if (parentIdx < 0) return;
    const parentDepth = rows[parentIdx].depth;
    // Vertical line runs down the parent's indent column, from the
    // parent's row center to the child's row center.
    const xVert = PAD_X + parentDepth * INDENT + ICON_R;
    const yParent = parentIdx * ROW_H + ROW_H / 2;
    const yChild = idx * ROW_H + ROW_H / 2;
    // Horizontal nub: from the vertical line over to just left of the
    // child's icon center.
    const xChildIcon = PAD_X + row.depth * INDENT + ICON_R;
    parts.push(
      `<path class="tree-connector" d="M ${xVert} ${yParent} L ${xVert} ${yChild} L ${xChildIcon - ICON_R} ${yChild}" ` +
      `stroke="${COLOR_CONNECTOR}" stroke-width="1" fill="none"/>`
    );
  });

  // Pass 2: rows (icon + text + optional agent badge).
  rows.forEach(({ task, depth }, idx) => {
    const cy = idx * ROW_H + ROW_H / 2;
    const cx = PAD_X + depth * INDENT + ICON_R;
    // Status icon — filled if done, stroke-only otherwise.
    if (task.done) {
      parts.push(
        `<circle class="task-status task-status-done" cx="${cx}" cy="${cy}" r="${ICON_R}" ` +
        `fill="${COLOR_POSITIVE}"/>`
      );
    } else {
      parts.push(
        `<circle class="task-status task-status-todo" cx="${cx}" cy="${cy}" r="${ICON_R - 0.5}" ` +
        `fill="none" stroke="${COLOR_TEXT_FAINT}" stroke-width="1.5"/>`
      );
    }

    // Task text. Anchor on the baseline, vertical-center via dominant-baseline.
    const textX = cx + ICON_R + ICON_TEXT_GAP;
    const truncated = truncate(task.text);
    const textColor = task.done ? COLOR_POSITIVE : COLOR_TEXT;
    const strike = task.done ? ' text-decoration="line-through"' : '';
    parts.push(
      `<text class="task-label${task.done ? ' task-done' : ''}" ` +
      `x="${textX}" y="${cy}" ` +
      `dominant-baseline="middle" ` +
      `font-family="${FONT_FAMILY}" font-size="${FONT_SIZE}" ` +
      `fill="${textColor}"${strike}>${escapeAttr(truncated)}</text>`
    );

    // Agent badge — small rounded rect with the agent name, accent-yellow.
    if (task.agent) {
      const labelW = estimateWidth(task.agent, AGENT_FONT_SIZE);
      const badgeW = labelW + 12; // 6px padding each side
      const badgeH = 14;
      const badgeX = textX + estimateWidth(truncated, FONT_SIZE) + TEXT_AGENT_GAP;
      const badgeY = cy - badgeH / 2;
      parts.push(
        `<rect class="task-agent-badge" x="${badgeX}" y="${badgeY}" ` +
        `width="${badgeW}" height="${badgeH}" rx="3" ry="3" ` +
        `fill="${COLOR_ACCENT}"/>`
      );
      parts.push(
        `<text class="task-agent-label" x="${badgeX + badgeW / 2}" y="${cy}" ` +
        `text-anchor="middle" dominant-baseline="middle" ` +
        `font-family="${FONT_FAMILY}" font-size="${AGENT_FONT_SIZE}" ` +
        `font-weight="600" fill="${COLOR_BG}">${escapeAttr(task.agent)}</text>`
      );
    }
  });

  parts.push('</svg>');
  return parts.join('');
}
