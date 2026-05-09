// HTML generator. Self-contained: inline CSS, no CDN, no JS framework.
// The page is fully readable offline. State lives in a script tag at the
// bottom for the CLI to round-trip.

import { PHASES } from './state.js';

export const escapeHtml = s =>
  String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

// Render one record (constraint, option, problem) as either a plain string
// for short content, or a <details>/<summary> pair for longer content. The
// summary is the first sentence (split on .!?) or the first 80 chars; the
// body is the full text. Default state is closed — the at-a-glance read.
// This is the load-bearing piece of vibesift's pitch: dense markdown becomes
// scannable HTML without losing any of the underlying detail.
function renderRecord(text) {
  const raw = String(text || '');
  const trimmed = raw.trim();
  if (!trimmed) return '';
  // Short enough to leave inline.
  if (trimmed.length <= 80) {
    return `<span class="record-text">${escapeHtml(trimmed)}</span>`;
  }
  // Split into summary + body. Prefer the first sentence; fall back to a
  // hard 80-char cut with ellipsis. The lookahead requires whitespace or
  // end-of-input after the terminator so that file extensions like
  // `index.html` and abbreviations don't get mistaken for sentence ends.
  const sentenceMatch = trimmed.match(/^.{12,80}?[.!?](?=\s|$)/);
  const summary = sentenceMatch ? sentenceMatch[0] : trimmed.slice(0, 77) + '…';
  return `<details class="record"><summary>${escapeHtml(summary)}</summary>` +
         `<div class="record-body">${escapeHtml(trimmed)}</div></details>`;
}

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
    ? `<ul class="constraints">${s.constraints.map(c => `<li>${renderRecord(c)}</li>`).join('')}</ul>`
    : '<p class="empty">No constraints recorded.</p>';
  const decision = s.decision
    ? `<div class="decision">
         <span class="decision-label">Decision</span>
         <p>${escapeHtml(s.decision)}</p>
         <span class="decision-time">${fmtDate(s.decidedAt)}</span>
       </div>`
    : '<p class="pending">Pending decision.</p>';
  const problemBlock = s.problem
    ? `<div class="problem">${renderRecord(s.problem)}</div>`
    : '<p class="empty">Not set.</p>';
  return `
    <section id="scope" class="phase">
      <h2>Scope</h2>
      <h3>Problem</h3>
      ${problemBlock}
      <h3>Constraints</h3>
      ${constraints}
      ${decision}
    </section>`;
}

function siftSection(state) {
  const s = state.sift;
  const options = s.options.length
    ? `<ul class="options">${s.options.map(o => `<li>${renderRecord(o.text)}</li>`).join('')}</ul>`
    : '<p class="empty">No options yet.</p>';
  const rationale = s.rationale
    ? `<div class="rationale">${renderRecord(s.rationale)}</div>`
    : '';
  const decision = s.decision
    ? `<div class="decision">
         <span class="decision-label">Chose</span>
         <p>${escapeHtml(s.decision)}</p>
         ${rationale}
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

// Brand palette — see BRAND.md for tokens. Both themes share the same
// accent + semantic colors; only neutrals invert.
const STYLES = `
  :root {
    color-scheme: dark light;

    /* Accents (theme-stable) */
    --accent: #facc15;        /* yellow-400 — pinning + hero accent */
    --accent-deep: #ca8a04;   /* yellow-600 — outlines */
    --positive: #22c55e;      /* green-500 — done, shipped */
    --warning: #ca8a04;       /* yellow-600 — pending */

    /* Neutrals (overridden in [data-theme="light"]) */
    --bg: #09090b;
    --surface: #0f0f12;
    --surface-2: #18181b;
    --border: #27272a;
    --border-strong: #3f3f46;
    --text: #fafafa;
    --text-muted: #d4d4d8;
    --text-dim: #a1a1aa;
    --text-faint: #71717a;
    --text-ghost: #52525b;

    /* Semantic backgrounds */
    --badge-active-bg: #1e3a8a;
    --badge-active-fg: #bfdbfe;
    --badge-shipped-bg: #14532d;
    --badge-shipped-fg: #bbf7d0;

    --decision-bg: #0a0a0a;
  }
  [data-theme="light"] {
    --bg: #fafafa;
    --surface: #ffffff;
    --surface-2: #f4f4f5;
    --border: #e4e4e7;
    --border-strong: #d4d4d8;
    --text: #09090b;
    --text-muted: #27272a;
    --text-dim: #52525b;
    --text-faint: #71717a;
    --text-ghost: #a1a1aa;

    --badge-active-bg: #dbeafe;
    --badge-active-fg: #1e3a8a;
    --badge-shipped-bg: #dcfce7;
    --badge-shipped-fg: #166534;

    --decision-bg: #ffffff;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0 auto;
    background: var(--bg);
    color: var(--text);
    font: 16px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    padding: 1.5rem 1rem 4rem;
    max-width: 760px;
    transition: background 150ms ease, color 150ms ease;
  }
  header { border-bottom: 1px solid var(--border); padding-bottom: 1rem; margin-bottom: 1.5rem; position: relative; }
  .brand-mark {
    font-family: ui-monospace, SFMono-Regular, "JetBrains Mono", monospace;
    font-size: 0.6875rem;
    letter-spacing: 0.15em;
    color: var(--text-faint);
    text-transform: uppercase;
    margin-bottom: 0.5rem;
  }
  h1 { font-size: 1.5rem; margin: 0 0 0.25rem; line-height: 1.2; }
  h2 { font-size: 1.125rem; margin-top: 2rem; margin-bottom: 0.5rem; color: var(--text); }
  h3 { font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-dim); margin: 1.25rem 0 0.5rem; }
  p { margin: 0.5rem 0; color: var(--text-muted); }
  ul, ol { padding-left: 1.25rem; color: var(--text-muted); }
  li { margin: 0.25rem 0; }
  a { color: var(--text); }
  em { color: var(--text-faint); }
  code { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 0.875em; color: var(--text-muted); background: var(--surface-2); padding: 0.125rem 0.375rem; border-radius: 3px; }
  .meta { color: var(--text-dim); font-size: 0.875rem; }
  .meta a { color: var(--text-dim); }
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
  .badge-active { background: var(--badge-active-bg); color: var(--badge-active-fg); }
  .badge-shipped { background: var(--badge-shipped-bg); color: var(--badge-shipped-fg); }
  nav { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
  .nav-item {
    flex: 1;
    text-align: center;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    text-decoration: none;
    color: var(--text-dim);
    font-size: 0.875rem;
    min-width: 100px;
  }
  .nav-active { background: var(--text); color: var(--bg); border-color: var(--text); font-weight: 600; }
  .nav-done { color: var(--text-faint); }
  .nav-done::after { content: " ✓"; color: var(--positive); }
  .phase { margin-bottom: 2rem; padding-top: 0.5rem; }
  .empty { color: var(--text-ghost); font-style: italic; font-size: 0.875rem; }
  .pending { color: var(--warning); font-size: 0.875rem; padding: 0.625rem 0.875rem; background: rgba(202,138,4,0.08); border-left: 3px solid var(--warning); border-radius: 0 4px 4px 0; }
  .problem { font-size: 1.0625rem; line-height: 1.6; }
  .constraints, .options, .tasks { padding-left: 1.25rem; }

  /* Collapsible records — load-bearing for the .md-overload pitch.
     Closed by default. Summary line shows first sentence; click to expand. */
  details.record {
    margin: 0.125rem 0;
  }
  details.record > summary {
    cursor: pointer;
    list-style: none;
    color: var(--text-muted);
    padding: 0.125rem 0 0.125rem 0.875rem;
    position: relative;
    border-radius: 3px;
    transition: color 120ms;
  }
  details.record > summary::-webkit-details-marker { display: none; }
  details.record > summary::before {
    content: "›";
    position: absolute;
    left: 0;
    top: 0.0625rem;
    color: var(--text-faint);
    font-family: ui-monospace, monospace;
    font-weight: 600;
    transition: transform 150ms ease, color 150ms ease;
    transform-origin: 0.4em 0.5em;
    display: inline-block;
  }
  details.record[open] > summary::before {
    transform: rotate(90deg);
    color: var(--accent);
  }
  details.record > summary:hover { color: var(--text); }
  details.record > summary:hover::before { color: var(--accent); }
  details.record > .record-body {
    margin-top: 0.375rem;
    padding: 0.625rem 0.875rem 0.625rem 1rem;
    background: var(--surface-2);
    border-left: 2px solid var(--accent-deep);
    border-radius: 0 4px 4px 0;
    color: var(--text-muted);
    font-size: 0.9375rem;
    line-height: 1.55;
    white-space: pre-wrap;
  }
  .record-text { color: var(--text-muted); }
  .problem details.record > .record-body { font-size: 1rem; }

  .decision {
    margin-top: 1.5rem;
    padding: 0.875rem 1rem;
    background: var(--decision-bg);
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    border-radius: 0 6px 6px 0;
  }
  .decision-label {
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-faint);
    font-weight: 600;
  }
  .decision p { margin: 0.375rem 0; color: var(--text); font-size: 1rem; }
  .decision .rationale { color: var(--text-dim); font-size: 0.9375rem; }
  .decision-time { font-size: 0.75rem; color: var(--text-ghost); }
  .tasks { list-style: none; padding-left: 0; }
  .task-mark { display: inline-block; width: 1.25rem; font-weight: 600; }
  .task-todo .task-mark { color: var(--text-faint); }
  .task-done .task-mark { color: var(--positive); }
  .task-done .task-text { color: var(--text-faint); text-decoration: line-through; }
  .diff-link {
    display: inline-block;
    margin-top: 0.5rem;
    padding: 0.5rem 0.875rem;
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    text-decoration: none;
    font-size: 0.875rem;
  }
  .shipped { color: var(--positive); font-weight: 600; margin-top: 1rem; }
  .log { margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid var(--border); }
  .log ol { padding-left: 1.5rem; }
  .log li { margin: 0.5rem 0; font-size: 0.875rem; }
  .log-phase {
    display: inline-block;
    min-width: 4rem;
    color: var(--text-faint);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
  }
  .log-text { color: var(--text-muted); }
  .log-time { display: block; color: var(--text-ghost); font-size: 0.75rem; margin-top: 0.125rem; }
  footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--border); color: var(--text-ghost); font-size: 0.75rem; text-align: center; }
  footer a { color: var(--text-faint); }

  /* Theme toggle — top-right of the page, both themes. */
  .theme-toggle {
    position: absolute;
    top: 0;
    right: 0;
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text-dim);
    font: 0.75rem ui-monospace, SFMono-Regular, monospace;
    padding: 0.375rem 0.625rem;
    border-radius: 4px;
    cursor: pointer;
    letter-spacing: 0.08em;
  }
  .theme-toggle:hover { border-color: var(--accent); color: var(--text); }
`;

// Inline JS — toggle dark/light, persist choice in localStorage, respect
// prefers-color-scheme on first load. Kept tiny on purpose; this is the
// only JS the page ever ships.
const THEME_SCRIPT = `
(function(){
  var KEY='vibesift:theme';
  var root=document.documentElement;
  var btn=document.getElementById('theme-toggle');
  var saved=null;
  try { saved = localStorage.getItem(KEY); } catch(e) {}
  var prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  var theme = saved || (prefersLight ? 'light' : 'dark');
  apply(theme);
  if (btn) btn.addEventListener('click', function(){
    var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    apply(next);
    try { localStorage.setItem(KEY, next); } catch(e) {}
  });
  function apply(t){
    root.setAttribute('data-theme', t);
    if (btn) btn.textContent = t === 'light' ? '◐ DARK' : '◑ LIGHT';
  }
})();
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
  <button id="theme-toggle" class="theme-toggle" type="button" aria-label="Toggle theme">◐ DARK</button>
  <div class="brand-mark">vibesift · ${escapeHtml(state.slug)}</div>
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
<script>${THEME_SCRIPT}</script>
</body>
</html>
`;
}
