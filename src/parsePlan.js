// Markdown parsers for `import-plan`. Pure functions of strings: no fs, no
// regexes with catastrophic backtracking, no runtime deps. Two entry points:
//
//   parsePRD(text)        → { problem, goals, nonGoals }
//   parseBuildPlan(text)  → { tasks: [...], milestones: [...] }
//
// The build-plan parser walks a small line-based state machine. We deliberately
// don't pull in a markdown library: vibesift ships zero runtime deps, and the
// shapes we need (H2/H3 headings + checkbox bullets) are trivial to recognize
// without one. Anything we don't recognize (tables, prose, hr) is skipped.

// Strip soft markers that authors add to phase headings. We keep these as a
// hint on the milestone so the renderer can show "✓ Complete" later, but we
// don't want them inside the milestone title used for grouping. Order matters:
// match the longest pattern first so "✓ Complete" doesn't fall through as just
// the check mark.
const MILESTONE_STATUS_PATTERNS = [
  { re: / ✓ Complete$/i, status: 'complete' },
  { re: / Complete$/i, status: 'complete' },
  { re: / ✓$/, status: 'complete' },
];

function splitMilestoneStatus(raw) {
  let title = raw.trim();
  let status = null;
  for (const { re, status: s } of MILESTONE_STATUS_PATTERNS) {
    if (re.test(title)) {
      title = title.replace(re, '').trim();
      status = s;
      break;
    }
  }
  return { title, status };
}

// Recognize a checkbox bullet at any indentation:
//   - [ ] todo
//   - [x] done
//   - [~] in progress (we keep done=false but tag as in-progress)
// Returns null when the line doesn't match. Leading whitespace is allowed so
// nested bullets parse, though we flatten everything under the current H3.
function matchCheckbox(line) {
  const m = line.match(/^\s*[-*]\s+\[([ xX~])\]\s+(.+?)\s*$/);
  if (!m) return null;
  const mark = m[1].toLowerCase();
  return {
    text: m[2],
    done: mark === 'x',
    inProgress: mark === '~',
  };
}

// Section heading: `## title` or `### title`.
function matchHeading(line) {
  const m = line.match(/^(#{1,6})\s+(.+?)\s*$/);
  if (!m) return null;
  return { level: m[1].length, text: m[2] };
}

// Italic context lines like `*Confirm: no real DB writes*` or
// `*Focus: Firebase, business logic.*`. We attach these as notes to the
// surrounding subMilestone (or as a milestone note when no sub is open).
function matchItalicNote(line) {
  const m = line.match(/^\s*\*([^*][^*]*?)\*\s*$/);
  if (!m) return null;
  return m[1].trim();
}

export function parseBuildPlan(text) {
  const lines = String(text || '').split(/\r?\n/);
  const tasks = [];
  const milestones = [];
  let curMilestone = null;
  let curSub = null;

  for (const line of lines) {
    if (!line.trim()) continue;
    if (/^---+\s*$/.test(line.trim())) continue; // horizontal rule
    if (line.trim().startsWith('|')) continue;   // table row
    if (line.trim().startsWith('>')) continue;   // blockquote

    const heading = matchHeading(line);
    if (heading) {
      if (heading.level === 1) continue; // doc title
      if (heading.level === 2) {
        const { title, status } = splitMilestoneStatus(heading.text);
        curMilestone = { title, status, note: null };
        curSub = null;
        milestones.push(curMilestone);
        continue;
      }
      if (heading.level === 3) {
        // Subsection. If it doesn't sit under a milestone, synthesize one.
        if (!curMilestone) {
          curMilestone = { title: 'General', status: null, note: null };
          milestones.push(curMilestone);
        }
        curSub = { title: heading.text, note: null };
        continue;
      }
      // H4-H6: ignore for grouping; treat content under them as still in the
      // current sub.
      continue;
    }

    const cb = matchCheckbox(line);
    if (cb) {
      tasks.push({
        milestone: curMilestone ? curMilestone.title : null,
        subMilestone: curSub ? curSub.title : null,
        text: cb.text,
        done: cb.done,
        inProgress: cb.inProgress,
      });
      continue;
    }

    const note = matchItalicNote(line);
    if (note) {
      // Attach to the most specific scope we have. Don't clobber an earlier
      // note: the first italic line after a heading is the most informative
      // (usually `*Focus: ...*`); later ones tend to be inline confirms tied
      // to specific tasks we can't reliably attach to.
      if (curSub && !curSub.note) curSub.note = note;
      else if (curMilestone && !curMilestone.note) curMilestone.note = note;
      continue;
    }

    // Everything else (prose, plain bullets without a checkbox, code) is
    // skipped. The build plan is a checklist; we don't try to surface arbitrary
    // body text.
  }

  return { tasks, milestones };
}

// PRD parser. We extract the bare minimum the renderer can use:
//   - problem statement (first paragraph after "Problem:" inside section 1
//     or under a `## ... problem` heading)
//   - goals (bullet list under any `## ... Goals` heading)
//   - nonGoals (bullets after a "Non-goals" mention in the same section)
//
// This is intentionally fuzzy. PRDs in the wild use wildly different layouts;
// we lean on a handful of heuristics that match BidAssured's PRD and similar
// docs without imposing a schema.
// Split a non-goals tail like "Full payments; native apps; full CRM." into
// individual items, trimming punctuation and stray quotes.
function splitAndPush(tail, out) {
  const cleaned = tail.replace(/[.\s]+$/, '').trim();
  if (!cleaned) return;
  const parts = cleaned.split(/\s*;\s*/).map(p => p.trim()).filter(Boolean);
  for (const p of parts) out.push(p);
}

export function parsePRD(text) {
  const lines = String(text || '').split(/\r?\n/);
  let problem = '';
  const goals = [];
  const nonGoals = [];

  let section = null; // 'problem' | 'goals' | null
  let collectedProblemLines = [];
  let inNonGoals = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const heading = matchHeading(line);

    if (heading) {
      // Flush problem section accumulator on heading change.
      if (section === 'problem' && collectedProblemLines.length) {
        problem = collectedProblemLines.join(' ').replace(/\s+/g, ' ').trim();
        collectedProblemLines = [];
      }
      const t = heading.text.toLowerCase();
      if (heading.level >= 2 && /problem/.test(t) && !/non.?problem/.test(t)) {
        section = 'problem';
        inNonGoals = false;
        continue;
      }
      if (heading.level >= 2 && /goal/.test(t) && !/non.?goal/.test(t)) {
        section = 'goals';
        inNonGoals = false;
        continue;
      }
      if (heading.level >= 2 && /non.?goal/.test(t)) {
        section = 'goals';
        inNonGoals = true;
        continue;
      }
      // Other heading: leave the goals section open if it was just opened, or
      // close it. Closing is safer; the bullets we want sit immediately under
      // the heading.
      section = null;
      inNonGoals = false;
      continue;
    }

    if (section === 'problem') {
      // The PRD format we target uses bold-prefix paragraphs:
      // `**Problem:** Construction bidding involves trust...`
      // Strip the bold prefix and accumulate until the next heading or blank
      // line follows non-empty content.
      const stripped = trimmed
        .replace(/^\*\*Problem:?\*\*\s*/i, '')
        .replace(/^Problem:\s*/i, '');
      if (stripped) collectedProblemLines.push(stripped);
      continue;
    }

    if (section === 'goals') {
      // Bullet items beginning with `- ` or `* `. Numbered lists allowed.
      const m = trimmed.match(/^(?:[-*]|\d+\.)\s+(.+)$/);
      if (m) {
        // PRDs commonly nest: "**Non-goals (...):** ...". A line like that
        // flips us into nonGoals mode for the rest of the section.
        if (/^\*\*Non.?goals?[^*]*\*\*/i.test(m[1])) {
          inNonGoals = true;
          const tail = m[1].replace(/^\*\*Non.?goals?[^*]*\*\*\s*:?\s*/i, '');
          if (tail) splitAndPush(tail, nonGoals);
          continue;
        }
        (inNonGoals ? nonGoals : goals).push(m[1]);
        continue;
      }
      // Paragraph form: a top-level line "**Non-goals (...):** Foo; bar."
      // The PRDs we target frequently inline non-goals as a single trailing
      // sentence rather than a bullet list. Split on `;` so each item lands
      // separately in the rendered output.
      if (/^\*\*Non.?goals?[^*]*\*\*/i.test(trimmed)) {
        inNonGoals = true;
        const tail = trimmed.replace(/^\*\*Non.?goals?[^*]*\*\*\s*:?\s*/i, '');
        if (tail) splitAndPush(tail, nonGoals);
        continue;
      }
      continue;
    }
  }

  if (section === 'problem' && collectedProblemLines.length) {
    problem = collectedProblemLines.join(' ').replace(/\s+/g, ' ').trim();
  }

  return { problem, goals, nonGoals };
}

// Filename heuristics. Case-insensitive: matches PRD, prd.md, Product-Requirements.md,
// BUILD_PLAN, build-plan.md, ROADMAP, plan.md, etc.
const PRD_PATTERNS = [
  /^prd\b/i,
  /product[\s_-]*requirements?/i,
  /^spec\b/i,
];
const BUILD_PLAN_PATTERNS = [
  /^build[\s_-]*plan\b/i,
  /^roadmap\b/i,
  /^tasks?\b/i,
  /^plan\b/i,
];

function rank(filename, patterns) {
  const base = filename.toLowerCase();
  for (let i = 0; i < patterns.length; i++) {
    if (patterns[i].test(base)) return i;
  }
  return -1;
}

// Given a list of filenames in a directory, pick the best PRD and build-plan
// candidates. Returns { prd, buildPlan } where each value is the chosen
// filename (without directory) or null.
export function pickPlanFiles(filenames) {
  const md = filenames.filter(n => /\.(md|markdown|mdx)$/i.test(n));
  let prdName = null;
  let prdRank = Infinity;
  let bpName = null;
  let bpRank = Infinity;
  for (const name of md) {
    const r1 = rank(name, PRD_PATTERNS);
    if (r1 >= 0 && r1 < prdRank) { prdRank = r1; prdName = name; }
    const r2 = rank(name, BUILD_PLAN_PATTERNS);
    if (r2 >= 0 && r2 < bpRank) { bpRank = r2; bpName = name; }
  }
  // Avoid the same file picked for both roles when more than one .md exists.
  if (prdName && prdName === bpName && md.length > 1) {
    const others = md.filter(n => n !== prdName);
    let alt = null, altR = Infinity;
    for (const name of others) {
      const r = rank(name, BUILD_PLAN_PATTERNS);
      if (r >= 0 && r < altR) { altR = r; alt = name; }
    }
    if (alt) bpName = alt;
  }
  return { prd: prdName, buildPlan: bpName };
}
