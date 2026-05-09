#!/usr/bin/env node
// vibesift — static HTML status broadcaster for terminal-driven flows.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import {
  emptyState, parseState, advancePhase, appendDecision,
  addOption, addConstraint, addTask, markTaskDone, setRationale, setDiffUrl,
  markDeployed, applyImportedPlan, PHASES,
} from './state.js';
import { loadPlan, resolvePlanDir } from './importPlan.js';
import { renderHTML } from './template.js';
import {
  repoRoot, currentBranch, originUrl,
  autoCommit, parseGithubOwnerRepo, diffUrl,
} from './git.js';
import { install, listHarnesses } from './install.js';
import { regenerateLandingIndex } from './index-renderer.js';

const HELP = `vibesift — Scope, Sift, Ship.

Commands
  vibesift init <slug> --title "..." [--problem "..."] [--no-commit]
  vibesift scope <slug> add-constraint "..." [--no-commit]
  vibesift sift  <slug> add-option "..." [--no-commit]
  vibesift sift  <slug> rationale "..." [--no-commit]
  vibesift ship  <slug> task add "..." [--agent <name>] [--parent <id>] [--no-commit]
  vibesift ship  <slug> task done <id> [--no-commit]
  vibesift ship  <slug> diff <url> [--no-commit]   (manually set the ship diff URL — e.g. a merged PR link)
  vibesift deploy <slug> [--at <iso-date>] [--no-commit]   (stamp deployedAt — idempotent; --at backfills with a historical date)
  vibesift decide <slug> --phase <scope|sift|ship> --text "..." [--no-commit]
  vibesift advance <slug> [--no-commit]
  vibesift render <slug> [--no-commit]   (re-render HTML from existing state — use after template upgrades)
  vibesift status <slug>
  vibesift list
  vibesift index       (regenerates the landing's sessions list from docs/sessions/)
  vibesift import-plan <slug> [--from <plan-dir>] [--title "..."] [--no-commit]
                       (read PRD + build-plan markdown from <plan-dir>, default ./plan,
                        and render a visual checklist; idempotent on re-run)
  vibesift bootstrap [--force]   (run once per repo: scaffolds docs/sessions/ + index.html. Fails on dirty tree unless --force.)
  vibesift install     (symlinks the skill into every detected agent harness)
  vibesift harnesses   (lists detected agent harnesses)

Sessions are written to <repo>/docs/sessions/<slug>/index.html.
Each command auto-commits the change to the current branch.
Pass --no-commit to write the file but skip the commit (preview-before-commit).
GitHub Pages set to /docs serves the index immediately.
`;

function die(msg, code = 1) {
  process.stderr.write(`vibesift: ${msg}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        out.flags[key] = true;
      } else {
        out.flags[key] = next;
        i++;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function sessionsDir(cwd = process.cwd()) {
  const root = repoRoot(cwd);
  if (!root) die('not in a git repository — run from inside the repo you want to track');
  return join(root, 'docs', 'sessions');
}

function sessionPath(slug, cwd = process.cwd()) {
  return join(sessionsDir(cwd), slug, 'index.html');
}

function loadState(slug, cwd = process.cwd()) {
  const path = sessionPath(slug, cwd);
  if (!existsSync(path)) die(`session not found: ${slug} (looked at ${path})`);
  const html = readFileSync(path, 'utf8');
  return { state: parseState(html), path };
}

function saveAndCommit(state, path, message, opts = {}) {
  const commit = opts.commit !== false;
  writeFileSync(path, renderHTML(state));
  if (!commit) {
    process.stderr.write('vibesift: --no-commit set, file written but not committed\n');
    return { ok: true, committed: false, skipped: true };
  }
  const result = autoCommit({ paths: [path], message });
  // Auto-regen the landing index after any successful state-mutation commit
  // so the landing's "last updated" date reflects the most recent activity.
  // Without this, the landing goes stale the moment a session is edited,
  // re-rendered, or has a task marked done — only `vibesift init` and the
  // explicit `vibesift index` command kept the landing fresh before v0.2.7.
  regenIndexAfterCommit(result);
  return result;
}

// Shared regen-after-mutation helper. Call after any successful state-
// mutation autoCommit. Idempotent — if regen produces no diff, no commit
// is made. Best-effort: a missing or malformed docs/index.html doesn't
// fail the calling command.
function regenIndexAfterCommit(commitResult) {
  if (!commitResult || !commitResult.committed || commitResult.skipped) return;
  try {
    const root = repoRoot();
    if (!root) return;
    const idx = regenerateLandingIndex({ repoRoot: root });
    if (idx.changed) {
      autoCommit({ paths: [idx.path], message: 'vibesift: index regenerated' });
    }
  } catch (e) {
    process.stderr.write(`vibesift: index regen skipped — ${e.message}\n`);
  }
}

function reportCommit(result, message) {
  if (result.skipped) return;
  if (!result.ok) {
    process.stderr.write(`vibesift: skipped commit — ${result.reason}\n`);
    return;
  }
  if (!result.committed) {
    process.stderr.write(`vibesift: ${result.reason}\n`);
    return;
  }
  process.stdout.write(`✓ ${message}\n`);
}

// Strip --no-commit from a positional argv (used by cmds that don't run
// parseArgs because their text payload is built via argv.slice(N).join(' ')).
// Returns { argv: <argv with --no-commit removed>, noCommit: <bool> }.
function extractNoCommit(argv) {
  const noCommit = argv.includes('--no-commit');
  return { argv: argv.filter(a => a !== '--no-commit'), noCommit };
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;

function cmdInit(argv) {
  const { _: pos, flags } = parseArgs(argv);
  const slug = pos[0];
  if (!slug || !SLUG_RE.test(slug)) die('usage: vibesift init <slug> --title "..." [--problem "..."] [--no-commit]');
  if (!flags.title) die('--title is required');
  const cwd = process.cwd();
  const dir = join(sessionsDir(cwd), slug);
  if (existsSync(join(dir, 'index.html'))) die(`session already exists: ${slug}`);
  mkdirSync(dir, { recursive: true });
  const branch = currentBranch(cwd);
  const repo = originUrl(cwd);
  const state = emptyState({
    slug, title: flags.title, problem: flags.problem || '', branch, repo,
  });
  const path = join(dir, 'index.html');
  writeFileSync(path, renderHTML(state));
  if (flags['no-commit']) {
    process.stderr.write('vibesift: --no-commit set, file written but not committed\n');
  } else {
    const result = autoCommit({
      paths: [path],
      message: `vibesift: scope started for ${slug}`,
    });
    reportCommit(result, `created ${path}`);
    // Regenerate the landing index so the new session appears at the
    // root immediately. Shared helper handles the audit-trail commit;
    // best-effort, won't undo the init on regen failure.
    regenIndexAfterCommit(result);
  }
  process.stdout.write(`session: ${slug}\nstatus: scoping\nfile: docs/sessions/${slug}/index.html\n`);
}

function cmdScope(argv) {
  const { argv: rest, noCommit } = extractNoCommit(argv);
  const slug = rest[0];
  const sub = rest[1];
  if (!slug || sub !== 'add-constraint') die('usage: vibesift scope <slug> add-constraint "..." [--no-commit]');
  const text = rest.slice(2).join(' ').trim();
  if (!text) die('constraint text required');
  const { state, path } = loadState(slug);
  addConstraint(state, text);
  const result = saveAndCommit(state, path, `vibesift: scope constraint on ${slug}`, { commit: !noCommit });
  reportCommit(result, `added constraint to ${slug}`);
}

function cmdSift(argv) {
  const { argv: rest, noCommit } = extractNoCommit(argv);
  const slug = rest[0];
  const sub = rest[1];
  if (!slug) die('usage: vibesift sift <slug> <add-option|rationale> "..." [--no-commit]');
  const text = rest.slice(2).join(' ').trim();
  if (!text) die('text required');
  const { state, path } = loadState(slug);
  if (sub === 'add-option') {
    addOption(state, text);
    const r = saveAndCommit(state, path, `vibesift: sift option on ${slug}`, { commit: !noCommit });
    reportCommit(r, `added option to ${slug}`);
  } else if (sub === 'rationale') {
    setRationale(state, text);
    const r = saveAndCommit(state, path, `vibesift: sift rationale on ${slug}`, { commit: !noCommit });
    reportCommit(r, `set rationale on ${slug}`);
  } else {
    die('usage: vibesift sift <slug> <add-option|rationale> "..." [--no-commit]');
  }
}

function cmdShip(argv) {
  const { argv: rest, noCommit } = extractNoCommit(argv);
  const slug = rest[0];
  const sub = rest[1];
  if (!slug) die('usage: vibesift ship <slug> <task|diff> ... [--no-commit]');
  if (sub === 'task') {
    const action = rest[2];
    const { state, path } = loadState(slug);
    if (action === 'add') {
      // Pull --agent <name> and --parent <id> out of the positional
      // task-text args before joining. The flags can appear anywhere after
      // `add`; everything else is the task text. They compose freely.
      const taskArgs = rest.slice(3);
      let agent = null;
      let parent = null;
      const textParts = [];
      for (let i = 0; i < taskArgs.length; i++) {
        if (taskArgs[i] === '--agent' && i + 1 < taskArgs.length) {
          agent = taskArgs[i + 1];
          i++;
        } else if (taskArgs[i] === '--parent' && i + 1 < taskArgs.length) {
          parent = taskArgs[i + 1];
          i++;
        } else {
          textParts.push(taskArgs[i]);
        }
      }
      const text = textParts.join(' ').trim();
      if (!text) die('task text required');
      const trimmedAgent = typeof agent === 'string' ? agent.trim() : '';
      const trimmedParent = typeof parent === 'string' ? parent.trim() : '';
      const opts = {};
      if (trimmedAgent) opts.agent = trimmedAgent;
      if (trimmedParent) opts.parentId = trimmedParent;
      let id;
      try {
        id = addTask(state, text, Object.keys(opts).length ? opts : undefined);
      } catch (e) {
        die(e.message);
      }
      const message = trimmedAgent
        ? `vibesift: ship task #${id} added to ${trimmedAgent} on ${slug}`
        : `vibesift: ship task #${id} added on ${slug}`;
      const r = saveAndCommit(state, path, message, { commit: !noCommit });
      reportCommit(r, trimmedAgent ? `task #${id} [${trimmedAgent}]: ${text}` : `task #${id}: ${text}`);
    } else if (action === 'done') {
      const id = rest[3];
      if (!id) die('task id required');
      markTaskDone(state, id);
      const r = saveAndCommit(state, path, `vibesift: ship task #${id} done on ${slug}`, { commit: !noCommit });
      reportCommit(r, `task #${id} marked done`);
    } else {
      die('usage: vibesift ship <slug> task <add|done> ... [--no-commit]');
    }
  } else if (sub === 'diff') {
    const url = rest[2];
    if (!url) die('usage: vibesift ship <slug> diff <url> [--no-commit]');
    const { state, path } = loadState(slug);
    setDiffUrl(state, url);
    const r = saveAndCommit(state, path, `vibesift: ship diff URL set on ${slug}`, { commit: !noCommit });
    reportCommit(r, `diff URL set on ${slug}`);
  } else {
    die('usage: vibesift ship <slug> <task|diff> ... [--no-commit]');
  }
}

// Try to discover a stable PR URL for the given branch via the `gh` CLI.
// Returns the PR url string on success, or null on any failure (gh missing,
// no matching PR, JSON parse error). Always uses execFileSync with an argv
// array — never shell-string interpolation — to avoid the indirect command
// injection sink CodeQL flags.
function detectPrUrl({ owner, repo, branch }) {
  if (!owner || !repo || !branch) return null;
  const target = `${owner}/${repo}`;
  // 1) Open PR with the given head branch.
  try {
    const out = execFileSync(
      'gh',
      ['pr', 'view', '--json', 'url', '--repo', target, branch],
      { stdio: ['ignore', 'pipe', 'ignore'] }
    ).toString();
    const parsed = JSON.parse(out);
    if (parsed && typeof parsed.url === 'string' && parsed.url) return parsed.url;
  } catch {
    /* fall through to merged-PR search */
  }
  // 2) Most recent merged PR with that head branch.
  try {
    const out = execFileSync(
      'gh',
      [
        'pr', 'list',
        '--state', 'merged',
        '--search', `head:${branch}`,
        '--json', 'number,headRefName,url,mergedAt',
        '--repo', target,
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] }
    ).toString();
    const list = JSON.parse(out);
    if (Array.isArray(list) && list.length) {
      const matches = list.filter(p => p && p.headRefName === branch && typeof p.url === 'string');
      if (!matches.length) return null;
      // Pick most recently merged.
      matches.sort((a, b) => {
        const ta = a.mergedAt ? Date.parse(a.mergedAt) : 0;
        const tb = b.mergedAt ? Date.parse(b.mergedAt) : 0;
        return tb - ta;
      });
      return matches[0].url;
    }
  } catch {
    /* gh missing or no merged matches */
  }
  return null;
}

function cmdDecide(argv) {
  const { _: pos, flags } = parseArgs(argv);
  const slug = pos[0];
  if (!slug) die('usage: vibesift decide <slug> --phase <scope|sift|ship> --text "..." [--no-commit]');
  if (!flags.phase || !PHASES.includes(flags.phase)) die('--phase must be one of: ' + PHASES.join(', '));
  if (!flags.text || flags.text === true) die('--text is required');
  const { state, path } = loadState(slug);
  appendDecision(state, flags.phase, flags.text);
  // On ship-decision, the session is "done" — try to upgrade any
  // stale-branch diff URL (compare/main...feat-branch) to a stable PR URL
  // before the head ref disappears under us. The branch is the most common
  // thing to vanish: PR #10 merged with --delete-branch and the diff link
  // 404'd. Best-effort: if `gh` isn't installed or no PR matches, leave the
  // existing URL alone and emit a stderr hint.
  if (flags.phase === 'ship') {
    const url = state.ship.diffUrl;
    if (url && url.includes('/compare/')) {
      const repoMeta = parseGithubOwnerRepo(state.repo);
      const stable = repoMeta
        ? detectPrUrl({ owner: repoMeta.owner, repo: repoMeta.repo, branch: state.branch })
        : null;
      if (stable) {
        setDiffUrl(state, stable);
        process.stderr.write(`vibesift: updated diff URL to ${stable}\n`);
      } else {
        process.stderr.write(
          `vibesift: diff URL still points at branch ref; consider 'vibesift ship ${slug} diff <url>' to set a stable URL\n`
        );
      }
    }
  }
  const r = saveAndCommit(state, path, `vibesift: decision (${flags.phase}) on ${slug}`, { commit: !flags['no-commit'] });
  reportCommit(r, `decision recorded in ${flags.phase}`);
}

function cmdAdvance(argv) {
  const { argv: rest, noCommit } = extractNoCommit(argv);
  const slug = rest[0];
  if (!slug) die('usage: vibesift advance <slug> [--no-commit]');
  const { state, path } = loadState(slug);
  const before = state.phase;
  advancePhase(state);
  if (state.phase === before) die(`already at final phase: ${before}`);
  // When entering ship, compute the diff URL if we can detect owner/repo.
  if (state.phase === 'ship') {
    const repoMeta = parseGithubOwnerRepo(state.repo);
    if (repoMeta && state.branch && state.branch !== 'main' && state.branch !== 'master') {
      const url = diffUrl({ ...repoMeta, base: 'main', head: state.branch });
      if (url) setDiffUrl(state, url);
    }
  }
  const r = saveAndCommit(state, path, `vibesift: advance ${slug} → ${state.phase}`, { commit: !noCommit });
  reportCommit(r, `${before} → ${state.phase}`);
}

function cmdDeploy(argv) {
  const { _: pos, flags } = parseArgs(argv);
  const slug = pos[0];
  if (!slug) die('usage: vibesift deploy <slug> [--at <iso-date>] [--no-commit]');
  const { state, path } = loadState(slug);
  // Idempotent: if already deployed, surface the existing timestamp on
  // stderr and exit 0 without rewriting the file or creating a commit.
  if (state.deployedAt) {
    process.stderr.write(`vibesift: already deployed at ${new Date(state.deployedAt).toISOString()}\n`);
    return;
  }
  // --at <iso-date>: retroactive backfill for sessions that genuinely
  // shipped earlier (e.g. v0.1.x sessions that predate this command). The
  // value is parsed via Date.parse, which accepts ISO 8601 plus most other
  // common shapes; if it's not parseable to a finite ms, fail fast.
  const opts = {};
  if (flags.at && flags.at !== true) {
    const ms = Date.parse(flags.at);
    if (!Number.isFinite(ms)) die(`--at: could not parse "${flags.at}" as a date`);
    opts.at = ms;
  }
  markDeployed(state, opts);
  const r = saveAndCommit(state, path, `vibesift: deployed ${slug}`, { commit: !flags['no-commit'] });
  reportCommit(r, `deployed ${slug} at ${new Date(state.deployedAt).toISOString()}`);
}

function cmdRender(argv) {
  const { argv: rest, noCommit } = extractNoCommit(argv);
  const slug = rest[0];
  if (!slug) die('usage: vibesift render <slug> [--no-commit]');
  const { state, path } = loadState(slug);
  // Touch updatedAt so the audit trail reflects when the re-render happened.
  state.updatedAt = Date.now();
  writeFileSync(path, renderHTML(state));
  if (noCommit) {
    process.stderr.write('vibesift: --no-commit set, file written but not committed\n');
    return;
  }
  const r = autoCommit({
    paths: [path],
    message: `vibesift: re-render ${slug} from current template`,
  });
  reportCommit(r, `re-rendered ${slug}`);
  // Re-renders bump updatedAt, so the landing's date column needs a refresh.
  regenIndexAfterCommit(r);
}

function cmdStatus(argv) {
  const slug = argv[0];
  if (!slug) die('usage: vibesift status <slug>');
  const { state } = loadState(slug);
  process.stdout.write(`session: ${state.slug}\n`);
  process.stdout.write(`title:   ${state.title}\n`);
  process.stdout.write(`branch:  ${state.branch || '(none)'}\n`);
  process.stdout.write(`phase:   ${state.phase}\n`);
  process.stdout.write(`scope:   ${state.scope.decision ? 'decided' : 'pending'} (${state.scope.constraints.length} constraints)\n`);
  process.stdout.write(`sift:    ${state.sift.decision ? 'decided' : 'pending'} (${state.sift.options.length} options)\n`);
  const tasks = state.ship.tasks;
  const done = tasks.filter(t => t.done).length;
  process.stdout.write(`ship:    ${done}/${tasks.length} tasks${state.ship.shippedAt ? ' · shipped' : ''}\n`);
  // Only emit `agents:` when at least one task carries an agent attribution.
  // Group: per-agent done/total, alphabetically by name; "unassigned" last.
  if (tasks.some(t => t.agent)) {
    const groups = new Map();
    for (const t of tasks) {
      const key = t.agent || 'unassigned';
      const g = groups.get(key) || { done: 0, total: 0 };
      g.total += 1;
      if (t.done) g.done += 1;
      groups.set(key, g);
    }
    const named = [...groups.keys()].filter(k => k !== 'unassigned').sort();
    if (groups.has('unassigned')) named.push('unassigned');
    const parts = named.map(k => {
      const g = groups.get(k);
      return `${k}(${g.done}/${g.total})`;
    });
    process.stdout.write(`agents:  ${parts.join(' ')}\n`);
  }
  process.stdout.write(`updated: ${new Date(state.updatedAt).toISOString()}\n`);
}

function cmdList() {
  const dir = sessionsDir();
  if (!existsSync(dir)) {
    process.stdout.write('(no sessions yet — run `vibesift bootstrap`)\n');
    return;
  }
  const entries = readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);
  if (!entries.length) { process.stdout.write('(no sessions)\n'); return; }
  for (const slug of entries) {
    const path = join(dir, slug, 'index.html');
    if (!existsSync(path)) continue;
    try {
      const state = parseState(readFileSync(path, 'utf8'));
      const tasks = state.ship.tasks;
      const done = tasks.filter(t => t.done).length;
      process.stdout.write(`${slug.padEnd(32)} ${state.phase.padEnd(7)} ${done}/${tasks.length} tasks ${state.title}\n`);
    } catch {
      process.stdout.write(`${slug.padEnd(32)} (parse error)\n`);
    }
  }
}

// Bootstrap stub. Contains a minimal <section class="sessions"> block with
// an empty heading so index-renderer can migrate markers in on the next
// `vibesift index` (or auto-index after `vibesift init`). Repos can replace
// this whole file with a richer landing page later — index regen preserves
// everything outside the START/END markers.
const INDEX_TEMPLATE = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>vibesift sessions</title>
<style>
  body { background: #09090b; color: #fafafa; font: 16px/1.55 ui-sans-serif, system-ui;
         margin: 0 auto; max-width: 760px; padding: 2rem 1rem; }
  h1 { font-size: 1.5rem; margin: 0 0 1.5rem; }
  ul { list-style: none; padding: 0; }
  li { margin: 0.5rem 0; padding: 0.875rem 1rem; border: 1px solid #27272a; border-radius: 6px; }
  a { color: #fafafa; text-decoration: none; font-weight: 600; }
  a:hover { text-decoration: underline; }
  .empty { color: #71717a; font-style: italic; }
  .sess-row { display: flex; gap: 0.75rem; padding: 0.75rem 1rem; border: 1px solid #27272a; border-radius: 6px; margin: 0.5rem 0; }
  .sess-status { font-family: ui-monospace, monospace; font-size: 0.75rem; text-transform: uppercase; color: #22c55e; }
  .sess-status.is-active { color: #facc15; }
  .footer { margin-top: 3rem; color: #52525b; font-size: 0.75rem; text-align: center; }
</style>
</head><body>
<h1>vibesift sessions</h1>
<section class="sessions">
  <h3>Sessions</h3>
  <p class="empty">No sessions yet. Run <code>vibesift init &lt;slug&gt; --title "..."</code> to create one.</p>
</section>
<div class="footer">read-only status pages · the terminal drives the flow</div>
</body></html>
`;

function cmdInstall(argv) {
  const { flags } = parseArgs(argv);
  const mode = flags.mode === 'copy' ? 'copy' : 'symlink';
  const only = typeof flags.only === 'string' ? flags.only.toLowerCase() : null;
  const r = install({ mode, only });
  if (!r.ok) die(r.reason);
  process.stdout.write(`canonical skill: ${r.canonical}\n\n`);
  for (const entry of r.results) {
    process.stdout.write(`  ${entry.harness.padEnd(16)} ${entry.status}${entry.target ? '  →  ' + entry.target.replace(process.env.HOME, '~') : ''}\n`);
  }
  process.stdout.write(`\nDone. Restart your harness to pick up the new skill.\n`);
}

function cmdHarnesses() {
  const list = listHarnesses();
  for (const h of list) {
    process.stdout.write(`  ${h.detected ? '✓' : ' '}  ${h.name}\n`);
  }
}

function cmdIndex() {
  const root = repoRoot();
  if (!root) die('not in a git repository');
  let result;
  try {
    result = regenerateLandingIndex({ repoRoot: root });
  } catch (e) {
    die(e.message);
  }
  if (!result.changed) {
    process.stdout.write(`landing already in sync (${result.sessions.length} session${result.sessions.length === 1 ? '' : 's'})\n`);
    return;
  }
  const r = autoCommit({
    paths: [result.path],
    message: 'vibesift: index regenerated',
  });
  reportCommit(r, `index regenerated (${result.sessions.length} session${result.sessions.length === 1 ? '' : 's'})`);
}

function cmdImportPlan(argv) {
  const { _: pos, flags } = parseArgs(argv);
  const slug = pos[0];
  if (!slug || !SLUG_RE.test(slug)) {
    die('usage: vibesift import-plan <slug> [--from <plan-dir>] [--title "..."] [--no-commit]');
  }
  const cwd = process.cwd();
  const root = repoRoot(cwd);
  if (!root) die('not in a git repository. Run from inside the repo you want to track.');

  const planDir = resolvePlanDir(typeof flags.from === 'string' ? flags.from : null, cwd);
  const result = loadPlan({ planDir, repoRoot: root });
  if (!result.ok) die(result.reason);

  // Surface what the parser saw so the user can sanity-check before opening
  // the rendered page.
  process.stderr.write(`vibesift: plan dir: ${planDir}\n`);
  if (result.found.prdName) {
    process.stderr.write(`vibesift: PRD:        ${result.found.prdName}  (problem ${result.prd.problem ? 'set' : 'empty'}, ${result.prd.goals.length} goals, ${result.prd.nonGoals.length} non-goals)\n`);
  } else {
    process.stderr.write('vibesift: PRD:        (none found)\n');
  }
  if (result.found.bpName) {
    process.stderr.write(`vibesift: build plan: ${result.found.bpName}  (${result.buildPlan.milestones.length} milestones, ${result.buildPlan.tasks.length} tasks)\n`);
  } else {
    process.stderr.write('vibesift: build plan: (none found)\n');
  }

  const dir = join(sessionsDir(cwd), slug);
  const path = join(dir, 'index.html');
  const fresh = !existsSync(path);

  let state;
  if (fresh) {
    mkdirSync(dir, { recursive: true });
    const branch = currentBranch(cwd);
    const repo = originUrl(cwd);
    const title = (typeof flags.title === 'string' && flags.title)
      || `Plan: ${slug}`;
    state = emptyState({
      slug, title,
      problem: result.prd.problem || '',
      branch, repo,
    });
    // Skip scope/sift and land directly in ship since the build plan IS the
    // ship task list. The user can still go back and add constraints/options
    // later.
    state.phase = 'ship';
  } else {
    state = parseState(readFileSync(path, 'utf8'));
  }

  const merge = applyImportedPlan(state, {
    prd: result.prd,
    buildPlan: result.buildPlan,
    prdPath: result.prdPath,
    buildPlanPath: result.buildPlanPath,
  });

  writeFileSync(path, renderHTML(state));
  const message = fresh
    ? `vibesift: import-plan created ${slug}`
    : `vibesift: import-plan refreshed ${slug} (+${merge.added}, ~${merge.updated})`;
  if (flags['no-commit']) {
    process.stderr.write('vibesift: --no-commit set, file written but not committed\n');
  } else {
    const r = autoCommit({ paths: [path], message });
    reportCommit(r, fresh ? `created ${path}` : `refreshed ${slug}: +${merge.added} new, ${merge.updated} updated`);
    // Align with v0.2.7+ behavior: every state mutation regenerates the
    // landing index so the root sessions list stays fresh.
    regenIndexAfterCommit(r);
  }

  // Final summary on stdout for shell pipelines / agent flows.
  const total = state.ship.tasks.filter(t => t.milestone).length;
  const done = state.ship.tasks.filter(t => t.milestone && t.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  process.stdout.write(`session: ${slug}\n`);
  process.stdout.write(`status:  ${done}/${total} tasks complete (${pct}%)\n`);
  process.stdout.write(`file:    docs/sessions/${slug}/index.html\n`);
}

function cmdBootstrap(argv = []) {
  const root = repoRoot();
  if (!root) die('not in a git repository');
  // Warn if the working tree is dirty. Bootstrap auto-commits and runs
  // exactly once per repo, often early in setup — the user is unlikely to
  // want their unrelated in-progress changes mixed into the bootstrap
  // commit. autoCommit only stages docs/index.html explicitly, so dirty
  // files won't actually be pulled in, but a dirty tree usually means the
  // user is in the middle of something else and bootstrap is happening
  // accidentally. --force skips the warning.
  if (!argv.includes('--force')) {
    try {
      const status = execFileSync('git', ['-C', root, 'status', '--porcelain'], {
        stdio: ['ignore', 'pipe', 'ignore'],
      }).toString().trim();
      if (status) {
        const lines = status.split('\n').length;
        process.stderr.write(
          `vibesift: working tree has ${lines} uncommitted file${lines === 1 ? '' : 's'}.\n` +
          `Bootstrap will auto-commit only docs/index.html (other files won't be touched), ` +
          `but you may want a clean tree first. Pass --force to skip this check.\n`
        );
        die('aborted on dirty tree (rerun with --force to override)', 1);
      }
    } catch (e) {
      // If git status itself fails, don't block bootstrap — fall through.
      if (e.message && e.message.includes('aborted on dirty tree')) throw e;
    }
  }
  const dir = join(root, 'docs', 'sessions');
  mkdirSync(dir, { recursive: true });
  const indexPath = join(root, 'docs', 'index.html');
  // writeFileSync with flag 'wx' = write-exclusive: atomic, fails if the
  // file already exists. Eliminates the TOCTOU race between existsSync()
  // and writeFileSync() that CodeQL js/file-system-race flagged.
  try {
    writeFileSync(indexPath, INDEX_TEMPLATE, { flag: 'wx' });
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    // File already exists; leave it alone (preserves any manual edits).
  }
  const r = autoCommit({
    paths: [indexPath],
    message: 'vibesift: bootstrap docs/sessions',
  });
  reportCommit(r, `bootstrapped ${root}/docs/sessions/`);
  process.stdout.write(`\nNext: enable GitHub Pages on /docs of the default branch.\n`);
  process.stdout.write(`Repo settings → Pages → Source: Deploy from branch → /docs\n`);
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === '-h' || cmd === '--help') { process.stdout.write(HELP); return; }
  switch (cmd) {
    case 'init': return cmdInit(rest);
    case 'scope': return cmdScope(rest);
    case 'sift': return cmdSift(rest);
    case 'ship': return cmdShip(rest);
    case 'decide': return cmdDecide(rest);
    case 'advance': return cmdAdvance(rest);
    case 'deploy': return cmdDeploy(rest);
    case 'render': return cmdRender(rest);
    case 'status': return cmdStatus(rest);
    case 'list': return cmdList();
    case 'index': return cmdIndex();
    case 'bootstrap': return cmdBootstrap(rest);
    case 'import-plan': return cmdImportPlan(rest);
    case 'install': return cmdInstall(rest);
    case 'harnesses': return cmdHarnesses();
    default: die(`unknown command: ${cmd}\n\n${HELP}`);
  }
}

main();
