// Filesystem glue between `parsePlan` and `state.applyImportedPlan`. Reads
// the plan/ directory, picks the best PRD + build-plan files, parses them,
// and hands a single { prdPath, buildPlanPath, prd, buildPlan } object back
// to the CLI. Kept in its own file so the parser stays pure (and trivially
// testable from string inputs).

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, resolve, isAbsolute } from 'node:path';
import { parsePRD, parseBuildPlan, pickPlanFiles } from './parsePlan.js';

export function loadPlan({ planDir, repoRoot }) {
  if (!existsSync(planDir)) {
    return { ok: false, reason: `plan directory not found: ${planDir}` };
  }
  if (!statSync(planDir).isDirectory()) {
    return { ok: false, reason: `not a directory: ${planDir}` };
  }
  const entries = readdirSync(planDir, { withFileTypes: true })
    .filter(e => e.isFile())
    .map(e => e.name);

  const { prd: prdName, buildPlan: bpName } = pickPlanFiles(entries);
  if (!prdName && !bpName) {
    return {
      ok: false,
      reason: `no PRD or build-plan markdown files found in ${planDir} (looked for PRD*, BUILD_PLAN*, ROADMAP*, PLAN.md and similar)`,
    };
  }

  const result = {
    ok: true,
    prdPath: null,
    buildPlanPath: null,
    prd: { problem: '', goals: [], nonGoals: [] },
    buildPlan: { tasks: [], milestones: [] },
    found: { prdName, bpName },
  };

  // Paths embedded in state are stored relative to repoRoot when possible —
  // that's the unit the rendered HTML can link back to safely.
  const rel = abs => {
    if (!repoRoot) return abs;
    const r = relative(repoRoot, abs);
    // If the plan dir sits outside the repo (rare), fall back to the absolute
    // path. We don't want `../../` link soup in the HTML.
    return r.startsWith('..') ? abs : r;
  };

  if (prdName) {
    const abs = join(planDir, prdName);
    const text = readFileSync(abs, 'utf8');
    result.prd = parsePRD(text);
    result.prdPath = rel(abs);
  }
  if (bpName) {
    const abs = join(planDir, bpName);
    const text = readFileSync(abs, 'utf8');
    result.buildPlan = parseBuildPlan(text);
    result.buildPlanPath = rel(abs);
  }
  return result;
}

// Resolve --from to an absolute path. Accepts either an absolute path or one
// relative to cwd. Defaults to "./plan" when undefined.
export function resolvePlanDir(fromFlag, cwd = process.cwd()) {
  const raw = fromFlag || './plan';
  return isAbsolute(raw) ? raw : resolve(cwd, raw);
}
