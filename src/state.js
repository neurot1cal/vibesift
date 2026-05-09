// State serialization. The HTML page is the single source of truth: the CLI
// embeds session state as a JSON script tag inside the page itself, then
// reads/mutates/writes it back. No sidecar files. The page can stand alone
// (open in a browser, view source, see everything).

// String-based delimiters instead of a regex with `[\s\S]*?`. CodeQL flagged
// the previous `/<script…>([\s\S]*?)<\/script>/` shape as polynomial-redos
// because the lazy quantifier can backtrack on adversarial input. indexOf
// is linear-time, has no backtracking, and is faster on the happy path too.
const STATE_OPEN = '<script type="application/json" id="vibesift-state">';
const STATE_CLOSE = '</script>';

export const PHASES = ['scope', 'sift', 'ship'];

export function emptyState({ slug, title, problem = '', branch = '', repo = '' }) {
  const now = Date.now();
  return {
    schemaVersion: 1,
    slug,
    title,
    branch,
    repo,
    phase: 'scope',
    createdAt: now,
    updatedAt: now,
    scope: {
      problem,
      constraints: [],
      decision: null,
      decidedAt: null,
    },
    sift: {
      options: [],
      decision: null,
      rationale: '',
      decidedAt: null,
    },
    ship: {
      tasks: [],
      diffUrl: null,
      shippedAt: null,
    },
    decisions: [],
    deployedAt: null,
  };
}

export function parseState(html) {
  const start = html.indexOf(STATE_OPEN);
  if (start < 0) throw new Error('vibesift state block not found in HTML');
  const contentStart = start + STATE_OPEN.length;
  const end = html.indexOf(STATE_CLOSE, contentStart);
  if (end < 0) throw new Error('vibesift state block unterminated');
  return JSON.parse(html.slice(contentStart, end));
}

export function advancePhase(state) {
  const i = PHASES.indexOf(state.phase);
  if (i < 0 || i === PHASES.length - 1) return state;
  state.phase = PHASES[i + 1];
  state.updatedAt = Date.now();
  return state;
}

export function appendDecision(state, phase, text) {
  if (!PHASES.includes(phase)) throw new Error(`unknown phase: ${phase}`);
  const decidedAt = Date.now();
  const entry = { phase, text, decidedAt };
  state.decisions.push(entry);
  if (phase === 'scope') {
    state.scope.decision = text;
    state.scope.decidedAt = decidedAt;
  } else if (phase === 'sift') {
    state.sift.decision = text;
    state.sift.decidedAt = decidedAt;
  } else if (phase === 'ship') {
    state.ship.shippedAt = decidedAt;
  }
  state.updatedAt = decidedAt;
  return state;
}

export function addOption(state, text) {
  state.sift.options.push({ text, addedAt: Date.now() });
  state.updatedAt = Date.now();
  return state;
}

export function addConstraint(state, text) {
  state.scope.constraints.push(text);
  state.updatedAt = Date.now();
  return state;
}

export function addTask(state, text, opts = {}) {
  const id = state.ship.tasks.length + 1;
  const task = { id, text, done: false };
  // Optional agent attribution. Only attach the field if a non-empty name
  // was supplied — keeps existing sessions byte-identical when no agent is
  // named, and round-trips cleanly through parseState.
  if (opts && typeof opts.agent === 'string' && opts.agent.trim()) {
    task.agent = opts.agent.trim();
  }
  // Optional parent linkage for tree rendering. Validate the parent exists
  // BEFORE attaching, so a typo'd id surfaces as an error instead of an
  // orphaned task that the tree renderer can't place.
  if (opts && opts.parentId !== undefined && opts.parentId !== null) {
    const pid = Number(opts.parentId);
    const parent = state.ship.tasks.find(t => t.id === pid);
    if (!parent) throw new Error(`parent task ${opts.parentId} not found`);
    task.parentId = pid;
  }
  state.ship.tasks.push(task);
  state.updatedAt = Date.now();
  return id;
}

export function markTaskDone(state, id) {
  const task = state.ship.tasks.find(t => t.id === Number(id));
  if (!task) throw new Error(`task ${id} not found`);
  task.done = true;
  state.updatedAt = Date.now();
  return state;
}

export function setRationale(state, text) {
  state.sift.rationale = text;
  state.updatedAt = Date.now();
  return state;
}

export function setDiffUrl(state, url) {
  state.ship.diffUrl = url;
  state.updatedAt = Date.now();
  return state;
}

// Mark the session as deployed to production. Idempotent: the first call
// stamps the timestamp; subsequent calls are no-ops so the original deploy
// time is preserved as the canonical "live" moment.
//
// opts.at (number, ms since epoch) overrides Date.now() for retroactive
// backfill. Set this when the actual deployment happened in the past and
// you're running `vibesift deploy --at <iso-date>` to record it accurately.
// updatedAt always reflects the moment the mark happened (when the CLI ran),
// not the override timestamp. updatedAt is the audit trail of activity, not
// of when the lifecycle event occurred.
export function markDeployed(state, opts = {}) {
  if (state.deployedAt) return state;
  let at = Date.now();
  if (opts && opts.at !== undefined && opts.at !== null) {
    const override = Number(opts.at);
    if (!Number.isFinite(override) || override <= 0) {
      throw new Error(`markDeployed: opts.at must be a finite positive number, got ${opts.at}`);
    }
    at = override;
  }
  state.deployedAt = at;
  state.updatedAt = Date.now();
  return state;
}

// Apply a parsed plan (PRD + build-plan) onto the state in an idempotent way.
// Re-running this should converge: tasks already present (matched by
// milestone+sub+text) get their `done` flag refreshed; tasks not seen before
// are appended with new ids; tasks the user added by hand stay untouched.
//
// The function never overwrites existing CLI-authored content:
//   - state.scope.problem is only set if currently empty (so an explicit
//     `decide --phase scope` is preserved across imports)
//   - decisions, options, rationale are not touched
//   - existing task `agent` fields are not stripped
//
// `parsed` shape (loose — see parsePlan.js):
//   { prd: { problem, goals, nonGoals }, buildPlan: { tasks, milestones },
//     prdPath, buildPlanPath }
export function applyImportedPlan(state, parsed) {
  const now = Date.now();
  const prd = parsed.prd || {};
  const bp = parsed.buildPlan || { tasks: [], milestones: [] };

  state.plan = {
    prdPath: parsed.prdPath || null,
    buildPlanPath: parsed.buildPlanPath || null,
    problem: prd.problem || '',
    goals: Array.isArray(prd.goals) ? prd.goals.slice() : [],
    nonGoals: Array.isArray(prd.nonGoals) ? prd.nonGoals.slice() : [],
    milestones: (bp.milestones || []).map(m => ({
      title: m.title,
      status: m.status || null,
      note: m.note || null,
    })),
    importedAt: now,
  };

  if (!state.scope.problem && prd.problem) {
    state.scope.problem = prd.problem;
  }

  // Index existing imported tasks by composite key so re-import is O(n).
  // Only tasks that carry a milestone (i.e. were imported, not hand-added via
  // `vibesift ship task add`) are eligible for the upsert; hand-added tasks
  // stay flat in the list with no milestone tag.
  const keyFor = t => `${t.milestone || ''}\x1f${t.subMilestone || ''}\x1f${t.text}`;
  const existing = new Map();
  for (const t of state.ship.tasks) {
    if (t.milestone) existing.set(keyFor(t), t);
  }

  let added = 0;
  let updated = 0;
  for (const incoming of bp.tasks) {
    const key = keyFor(incoming);
    const hit = existing.get(key);
    if (hit) {
      if (hit.done !== incoming.done) {
        hit.done = incoming.done;
        updated++;
      }
      // Surface in-progress without a separate field by leaving done=false;
      // a `progress` flag would round-trip but isn't needed for v1.
    } else {
      const task = {
        id: state.ship.tasks.length + 1,
        text: incoming.text,
        done: !!incoming.done,
        milestone: incoming.milestone || null,
      };
      if (incoming.subMilestone) task.subMilestone = incoming.subMilestone;
      state.ship.tasks.push(task);
      existing.set(key, task);
      added++;
    }
  }

  state.updatedAt = now;
  return { added, updated, total: bp.tasks.length };
}
