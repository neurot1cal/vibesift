// Pure repo scan. Looks at the working tree to classify project kind and
// surface useful starter content for `vibesift propose`. No side effects
// beyond readdirSync / readFileSync / existsSync.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function readJsonMaybe(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

// Filename heuristics for detecting plan / spec / roadmap markdown. Patterns
// are deliberately conservative: README and CHANGELOG must NOT match, and
// arbitrary docs are skipped. Same patterns used by the import-plan branch
// (parsePlan.js) so behavior stays aligned if the two ever merge.
const PRD_PATTERNS = [/^prd\b/i, /product[\s_-]*requirements?/i, /^spec\b/i];
const PLAN_PATTERNS = [
  /^build[\s_-]*plan\b/i,
  /^roadmap\b/i,
  /^tasks?\b/i,
  /^plan\b/i,
];
function classifyPlanFile(name) {
  if (!/\.(md|markdown|mdx)$/i.test(name)) return null;
  if (PRD_PATTERNS.some(re => re.test(name))) return 'prd';
  if (PLAN_PATTERNS.some(re => re.test(name))) return 'plan';
  return null;
}

export function scanRepo(root) {
  const has = (p) => existsSync(join(root, p));

  const out = {
    projectKind: 'unknown',
    framework: null,
    bundler: null,
    languages: [],
    packageJson: null,
    hasPyProject: false,
    hasCargoToml: false,
    hasGoMod: false,
    hasReadme: has('README.md'),
    planFiles: [],
    sessionsDir: has('docs/sessions') ? 'docs/sessions' : null,
  };

  if (has('package.json')) {
    const pkg = readJsonMaybe(join(root, 'package.json'));
    if (pkg) {
      out.packageJson = pkg;
      out.projectKind = 'node';
      out.languages.push('javascript');
      const all = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
      };
      if (all.next) out.framework = 'next';
      else if (all.astro) out.framework = 'astro';
      else if (all.svelte) out.framework = 'svelte';
      else if (all.react) out.framework = 'react';
      if (all.vite) out.bundler = 'vite';
      else if (all.webpack) out.bundler = 'webpack';
      else if (all.rollup) out.bundler = 'rollup';
      else if (all.esbuild) out.bundler = 'esbuild';
    }
  }
  if (has('pyproject.toml')) {
    out.hasPyProject = true;
    out.projectKind = out.projectKind === 'node' ? 'mixed' : 'python';
    out.languages.push('python');
  }
  if (has('Cargo.toml')) {
    out.hasCargoToml = true;
    out.projectKind = out.projectKind === 'unknown' ? 'rust' : 'mixed';
    out.languages.push('rust');
  }
  if (has('go.mod')) {
    out.hasGoMod = true;
    out.projectKind = out.projectKind === 'unknown' ? 'go' : 'mixed';
    out.languages.push('go');
  }
  if (out.projectKind === 'unknown' && (has('index.html') || has('docs/index.html'))) {
    out.projectKind = 'static';
  }

  // Plan-file discovery. Just surface the paths; propose prints them so the
  // user knows they can run a separate plan-import flow.
  if (has('plan')) {
    try {
      for (const f of readdirSync(join(root, 'plan'), { withFileTypes: true })) {
        if (!f.isFile()) continue;
        const kind = classifyPlanFile(f.name);
        if (kind) out.planFiles.push({ path: join('plan', f.name), kind });
      }
    } catch {
      // plan/ exists but not readable; skip.
    }
  }
  try {
    for (const f of readdirSync(root, { withFileTypes: true })) {
      if (!f.isFile()) continue;
      const kind = classifyPlanFile(f.name);
      if (kind) out.planFiles.push({ path: f.name, kind });
    }
  } catch {
    // Root not readable; unusual. Skip.
  }

  return out;
}

// Project-type-derived constraint stubs. Seeds, not commandments: the user
// edits or deletes them in scope.
export function constraintStubsFor(scan) {
  const out = [];
  if (scan.projectKind === 'node' && scan.packageJson) {
    const nodeReq = scan.packageJson.engines && scan.packageJson.engines.node
      ? scan.packageJson.engines.node
      : '20+';
    out.push(`Stay within Node ${nodeReq} compat`);
    const depCount = Object.keys(scan.packageJson.dependencies || {}).length;
    if (depCount === 0) out.push('Keep runtime dependencies at zero');
  }
  if (scan.projectKind === 'static') {
    out.push('Must work without a build step');
  }
  if (scan.projectKind === 'python' && scan.hasPyProject) {
    out.push('Stay within current pyproject.toml constraints');
  }
  if (scan.projectKind === 'rust' && scan.hasCargoToml) {
    out.push('Stay within current Cargo.toml constraints');
  }
  if (scan.projectKind === 'go' && scan.hasGoMod) {
    out.push('Stay within current go.mod constraints');
  }
  return out;
}

export function taskScaffoldFor(scan) {
  if (scan.projectKind === 'node') {
    return [
      'Scaffold the new module',
      'Wire it into the CLI / entry point',
      'Add unit tests',
      'Update README',
      'Smoke test end to end',
    ];
  }
  if (scan.projectKind === 'python') {
    return [
      'Scaffold the module',
      'Wire imports',
      'Add pytest cases',
      'Update README',
      'Smoke test',
    ];
  }
  if (scan.projectKind === 'rust') {
    return [
      'Scaffold the crate / module',
      'Wire it into the binary or lib',
      'Add cargo tests',
      'Update README',
      'Smoke test',
    ];
  }
  if (scan.projectKind === 'go') {
    return [
      'Scaffold the package',
      'Wire it into main',
      'Add go test cases',
      'Update README',
      'Smoke test',
    ];
  }
  if (scan.projectKind === 'static') {
    return [
      'Add the HTML structure',
      'Style with existing tokens',
      'Verify in two browsers',
      'Update README',
    ];
  }
  return ['Scaffold', 'Wire', 'Test', 'Document', 'Ship'];
}

export function humanizeSlug(slug) {
  if (!slug) return '';
  const words = String(slug).split('-').filter(Boolean);
  if (!words.length) return '';
  const first = words[0][0].toUpperCase() + words[0].slice(1);
  return [first, ...words.slice(1)].join(' ');
}

export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
