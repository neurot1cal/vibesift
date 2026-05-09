// HTML generator. Self-contained: inline CSS, no CDN, no JS framework.
// The page is fully readable offline. State lives in a script tag at the
// bottom for the CLI to round-trip.

import { PHASES } from './state.js';

const escapeHtml = s =>
  String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

const fmtDate = ts => {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
};

const phaseLabel = {
  scope: 'Scope',
  sift: 'Sift',
  ship: 'Ship',
};

function statusBadge(state) {
  if (state.ship.shippedAt) return { text: 'Shipped', tone: 'shipped' };
  const i = PHASES.indexOf(state.phase);
  if (i === 2) return { text: 'Shipping', tone: 'active' };
  if (i === 1) return { text: 'Sifting', tone: 'active' };
  return { text: 'Scoping', tone: 'active' };
}

function nav(state) {
  return PHASES.map(p => {
    const active = p === state.phase;
    const done = PHASES.indexOf(p) < PHASES.indexOf(state.phase) ||
                 (p === 'ship' && state.ship.shippedAt);
    const cls = active ? 'nav-item nav-active' : done ? 'nav-item nav-done' : 'nav-item';
    return `<a href="#${p}" class="${cls}">${phaseLabel[p]}</a>`;
  }).join('');
}

function scopeSection(state) {
  const s = state.scope;
  const constraints = s.constraints.length
    ? `<ul class="constraints">${s.constraints.map(c => `<li>${escapeHtml(c)}</li>`).join('')}</ul>`
    : '<p class="empty">No constraints recorded.</p>';
  const decision = s.decision
    ? `<div class="decision">
         <span class="decision-label">Decision</span>
         <p>${escapeHtml(s.decision)}</p>
         <span class="decision-time">${fmtDate(s.decidedAt)}</span>
       </div>`
    : '<p class="pending">Pending decision.</p>';
  return `
    <section id="scope" class="phase">
      <h2>Scope</h2>
      <h3>Problem</h3>
      <p class="problem">${s.problem ? escapeHtml(s.problem) : '<em class="empty">Not set.</em>'}</p>
      <h3>Constraints</h3>
      ${constraints}
      ${decision}
    </section>`;
}

function siftSection(state) {
  const s = state.sift;
  const options = s.options.length
    ? `<ul class="options">${s.options.map(o => `<li>${escapeHtml(o.text)}</li>`).join('')}</ul>`
    : '<p class="empty">No options yet.</p>';
  const decision = s.decision
    ? `<div class="decision">
         <span class="decision-label">Chose</span>
         <p>${escapeHtml(s.decision)}</p>
         ${s.rationale ? `<p class="rationale">${escapeHtml(s.rationale)}</p>` : ''}
         <span class="decision-time">${fmtDate(s.decidedAt)}</span>
       </div>`
    : '<p class="pending">No selection yet.</p>';
  return `
    <section id="sift" class="phase">
      <h2>Sift</h2>
      <h3>Options considered</h3>
      ${options}
      ${decision}
    </section>`;
}

function shipSection(state) {
  const s = state.ship;
  const tasks = s.tasks.length
    ? `<ul class="tasks">${s.tasks.map(t => `
        <li class="${t.done ? 'task-done' : 'task-todo'}">
          <span class="task-mark">${t.done ? '✓' : '·'}</span>
          <span class="task-text">${escapeHtml(t.text)}</span>
        </li>
      `).join('')}</ul>`
    : '<p class="empty">No tasks yet.</p>';
  const diff = s.diffUrl
    ? `<p><a class="diff-link" href="${escapeHtml(s.diffUrl)}">View diff →</a></p>`
    : '';
  const shipped = s.shippedAt
    ? `<p class="shipped">Shipped ${fmtDate(s.shippedAt)}.</p>`
    : '';
  return `
    <section id="ship" class="phase">
      <h2>Ship</h2>
      <h3>Tasks</h3>
      ${tasks}
      ${diff}
      ${shipped}
    </section>`;
}

function decisionsLog(state) {
  if (!state.decisions.length) return '';
  return `
    <section class="log">
      <h2>Decision log</h2>
      <ol>
        ${state.decisions.map(d => `
          <li>
            <span class="log-phase">${phaseLabel[d.phase] ?? d.phase}</span>
            <span class="log-text">${escapeHtml(d.text)}</span>
            <span class="log-time">${fmtDate(d.decidedAt)}</span>
          </li>
        `).join('')}
      </ol>
    </section>`;
}

const STYLES = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #09090b;
    color: #fafafa;
    font: 16px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    padding: 1.5rem 1rem 4rem;
    max-width: 760px;
    margin: 0 auto;
  }
  header { border-bottom: 1px solid #27272a; padding-bottom: 1rem; margin-bottom: 1.5rem; }
  h1 { font-size: 1.5rem; margin: 0 0 0.25rem; line-height: 1.2; }
  h2 { font-size: 1.125rem; margin-top: 2rem; margin-bottom: 0.5rem; color: #fafafa; }
  h3 { font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.05em; color: #a1a1aa; margin: 1.25rem 0 0.5rem; }
  p { margin: 0.5rem 0; color: #d4d4d8; }
  ul, ol { padding-left: 1.25rem; color: #d4d4d8; }
  li { margin: 0.25rem 0; }
  a { color: #fafafa; }
  em { color: #71717a; }
  .meta { color: #a1a1aa; font-size: 0.875rem; }
  .meta a { color: #a1a1aa; }
  .meta-line { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; margin-top: 0.5rem; }
  .badge {
    display: inline-block;
    padding: 0.125rem 0.625rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .badge-active { background: #1e3a8a; color: #bfdbfe; }
  .badge-shipped { background: #14532d; color: #bbf7d0; }
  nav { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
  .nav-item {
    flex: 1;
    text-align: center;
    padding: 0.5rem 0.75rem;
    border: 1px solid #27272a;
    border-radius: 6px;
    text-decoration: none;
    color: #a1a1aa;
    font-size: 0.875rem;
    min-width: 100px;
  }
  .nav-active { background: #fafafa; color: #09090b; border-color: #fafafa; font-weight: 600; }
  .nav-done { color: #71717a; }
  .nav-done::after { content: " ✓"; color: #4ade80; }
  .phase { margin-bottom: 2rem; padding-top: 0.5rem; }
  .empty { color: #52525b; font-style: italic; font-size: 0.875rem; }
  .pending { color: #ca8a04; font-size: 0.875rem; padding: 0.625rem 0.875rem; background: rgba(202,138,4,0.08); border-left: 3px solid #ca8a04; border-radius: 0 4px 4px 0; }
  .problem { font-size: 1.0625rem; line-height: 1.6; }
  .constraints, .options, .tasks { padding-left: 1.25rem; }
  .decision {
    margin-top: 1.5rem;
    padding: 0.875rem 1rem;
    background: #0a0a0a;
    border: 1px solid #27272a;
    border-left: 3px solid #fafafa;
    border-radius: 0 6px 6px 0;
  }
  .decision-label {
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #71717a;
    font-weight: 600;
  }
  .decision p { margin: 0.375rem 0; color: #fafafa; font-size: 1rem; }
  .decision .rationale { color: #a1a1aa; font-size: 0.9375rem; }
  .decision-time { font-size: 0.75rem; color: #52525b; }
  .tasks { list-style: none; padding-left: 0; }
  .task-mark { display: inline-block; width: 1.25rem; font-weight: 600; }
  .task-todo .task-mark { color: #71717a; }
  .task-done .task-mark { color: #4ade80; }
  .task-done .task-text { color: #71717a; text-decoration: line-through; }
  .diff-link {
    display: inline-block;
    margin-top: 0.5rem;
    padding: 0.5rem 0.875rem;
    border: 1px solid #3f3f46;
    border-radius: 6px;
    text-decoration: none;
    font-size: 0.875rem;
  }
  .shipped { color: #4ade80; font-weight: 600; margin-top: 1rem; }
  .log { margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid #27272a; }
  .log ol { padding-left: 1.5rem; }
  .log li { margin: 0.5rem 0; font-size: 0.875rem; }
  .log-phase {
    display: inline-block;
    min-width: 4rem;
    color: #71717a;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
  }
  .log-text { color: #d4d4d8; }
  .log-time { display: block; color: #52525b; font-size: 0.75rem; margin-top: 0.125rem; }
  footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #27272a; color: #52525b; font-size: 0.75rem; text-align: center; }
  footer a { color: #71717a; }
`;

export function renderHTML(state) {
  const badge = statusBadge(state);
  const branchLine = state.branch
    ? `<span>branch: <code>${escapeHtml(state.branch)}</code></span>`
    : '';
  const repoLine = state.repo
    ? `<span><a href="${escapeHtml(state.repo)}">${escapeHtml(state.repo.replace(/^https?:\/\//, ''))}</a></span>`
    : '';
  // Escape JSON for safe embedding in <script type="application/json">.
  // Plain JSON.stringify does NOT encode `</script>` or `<!--`, both of
  // which would break out of the script block and execute as HTML/JS.
  // Replace `<`, `>`, `&` with their JSON \uXXXX forms — JSON parsers
  // accept these natively, but the HTML parser sees no metacharacters.
  // OWASP-recommended pattern for JSON-in-HTML.
  const safeJson = JSON.stringify(state, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="vibesift">
<meta name="robots" content="noindex">
<title>${escapeHtml(state.title)}</title>
<style>${STYLES}</style>
</head>
<body>
<header>
  <h1>${escapeHtml(state.title)}</h1>
  <div class="meta-line">
    <span class="badge badge-${badge.tone}">${badge.text}</span>
    ${repoLine}
    ${branchLine}
    <span class="meta">updated ${fmtDate(state.updatedAt)}</span>
  </div>
</header>
<nav>${nav(state)}</nav>
<main>
${scopeSection(state)}
${siftSection(state)}
${shipSection(state)}
${decisionsLog(state)}
</main>
<footer>generated by <a href="https://github.com/vibesift/vibesift">vibesift</a> · this page is read-only · the terminal drives the flow</footer>
<script type="application/json" id="vibesift-state">
${safeJson}
</script>
</body>
</html>
`;
}
