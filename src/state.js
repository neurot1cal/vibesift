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

export function addTask(state, text) {
  const id = state.ship.tasks.length + 1;
  state.ship.tasks.push({ id, text, done: false });
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
