#!/usr/bin/env node
// vibesift — static HTML status broadcaster for terminal-driven flows.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  emptyState, parseState, advancePhase, appendDecision,
  addOption, addConstraint, addTask, markTaskDone, setRationale, setDiffUrl,
  PHASES,
} from './state.js';
import { renderHTML } from './template.js';
import {
  repoRoot, currentBranch, originUrl,
  autoCommit, parseGithubOwnerRepo, diffUrl,
} from './git.js';
import { install, listHarnesses } from './install.js';

const HELP = `vibesift — Scope, Sift, Ship.

Commands
  vibesift init <slug> --title "..." [--problem "..."]
  vibesift scope <slug> add-constraint "..."
  vibesift sift  <slug> add-option "..."
  vibesift sift  <slug> rationale "..."
  vibesift ship  <slug> task add "..."
  vibesift ship  <slug> task done <id>
  vibesift decide <slug> --phase <scope|sift|ship> --text "..."
  vibesift advance <slug>
  vibesift status <slug>
  vibesift list
  vibesift bootstrap   (run once per repo: scaffolds docs/sessions/ + index.html)
  vibesift install     (symlinks the skill into every detected agent harness)
  vibesift harnesses   (lists detected agent harnesses)

Sessions are written to <repo>/docs/sessions/<slug>/index.html.
Each command auto-commits the change to the current branch.
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

function saveAndCommit(state, path, message) {
  writeFileSync(path, renderHTML(state));
  const result = autoCommit({ paths: [path], message });
  return result;
}

function reportCommit(result, message) {
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

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;

function cmdInit(argv) {
  const { _: pos, flags } = parseArgs(argv);
  const slug = pos[0];
  if (!slug || !SLUG_RE.test(slug)) die('usage: vibesift init <slug> --title "..." [--problem "..."]');
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
  const result = autoCommit({
    paths: [path],
    message: `vibesift: scope started for ${slug}`,
  });
  reportCommit(result, `created ${path}`);
  process.stdout.write(`session: ${slug}\nstatus: scoping\nfile: docs/sessions/${slug}/index.html\n`);
}

function cmdScope(argv) {
  const slug = argv[0];
  const sub = argv[1];
  if (!slug || sub !== 'add-constraint') die('usage: vibesift scope <slug> add-constraint "..."');
  const text = argv.slice(2).join(' ').trim();
  if (!text) die('constraint text required');
  const { state, path } = loadState(slug);
  addConstraint(state, text);
  const result = saveAndCommit(state, path, `vibesift: scope constraint on ${slug}`);
  reportCommit(result, `added constraint to ${slug}`);
}

function cmdSift(argv) {
  const slug = argv[0];
  const sub = argv[1];
  if (!slug) die('usage: vibesift sift <slug> <add-option|rationale> "..."');
  const text = argv.slice(2).join(' ').trim();
  if (!text) die('text required');
  const { state, path } = loadState(slug);
  if (sub === 'add-option') {
    addOption(state, text);
    const r = saveAndCommit(state, path, `vibesift: sift option on ${slug}`);
    reportCommit(r, `added option to ${slug}`);
  } else if (sub === 'rationale') {
    setRationale(state, text);
    const r = saveAndCommit(state, path, `vibesift: sift rationale on ${slug}`);
    reportCommit(r, `set rationale on ${slug}`);
  } else {
    die('usage: vibesift sift <slug> <add-option|rationale> "..."');
  }
}

function cmdShip(argv) {
  const slug = argv[0];
  const sub = argv[1];
  if (!slug || sub !== 'task') die('usage: vibesift ship <slug> task <add|done> ...');
  const action = argv[2];
  const { state, path } = loadState(slug);
  if (action === 'add') {
    const text = argv.slice(3).join(' ').trim();
    if (!text) die('task text required');
    const id = addTask(state, text);
    const r = saveAndCommit(state, path, `vibesift: ship task #${id} added on ${slug}`);
    reportCommit(r, `task #${id}: ${text}`);
  } else if (action === 'done') {
    const id = argv[3];
    if (!id) die('task id required');
    markTaskDone(state, id);
    const r = saveAndCommit(state, path, `vibesift: ship task #${id} done on ${slug}`);
    reportCommit(r, `task #${id} marked done`);
  } else {
    die('usage: vibesift ship <slug> task <add|done> ...');
  }
}

function cmdDecide(argv) {
  const { _: pos, flags } = parseArgs(argv);
  const slug = pos[0];
  if (!slug) die('usage: vibesift decide <slug> --phase <scope|sift|ship> --text "..."');
  if (!flags.phase || !PHASES.includes(flags.phase)) die('--phase must be one of: ' + PHASES.join(', '));
  if (!flags.text || flags.text === true) die('--text is required');
  const { state, path } = loadState(slug);
  appendDecision(state, flags.phase, flags.text);
  const r = saveAndCommit(state, path, `vibesift: decision (${flags.phase}) on ${slug}`);
  reportCommit(r, `decision recorded in ${flags.phase}`);
}

function cmdAdvance(argv) {
  const slug = argv[0];
  if (!slug) die('usage: vibesift advance <slug>');
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
  const r = saveAndCommit(state, path, `vibesift: advance ${slug} → ${state.phase}`);
  reportCommit(r, `${before} → ${state.phase}`);
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
  .footer { margin-top: 3rem; color: #52525b; font-size: 0.75rem; text-align: center; }
</style>
</head><body>
<h1>vibesift sessions</h1>
<p class="empty">No sessions yet. Run <code>vibesift init &lt;slug&gt; --title "..."</code> to create one.</p>
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

function cmdBootstrap() {
  const root = repoRoot();
  if (!root) die('not in a git repository');
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
    case 'status': return cmdStatus(rest);
    case 'list': return cmdList();
    case 'bootstrap': return cmdBootstrap();
    case 'install': return cmdInstall(rest);
    case 'harnesses': return cmdHarnesses();
    default: die(`unknown command: ${cmd}\n\n${HELP}`);
  }
}

main();
