import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';
import { getRepoRoot } from './git.js';

/**
 * Gate definitions — ordered by typical pipeline sequence.
 * Each gate has a name, detection logic, and command builder.
 */
const GATE_DEFINITIONS = [
  {
    id: 'lint',
    label: 'Lint',
    detect: (project) => {
      if (project.pkgScripts) {
        if (project.pkgScripts.lint) return { cmd: project.pkgRunner('lint') };
      }
      if (project.pyproject) {
        if (project.hasRuff) return { cmd: 'ruff check .' };
      }
      if (project.goMod) return { cmd: 'go vet ./...' };
      return null;
    },
  },
  {
    id: 'typecheck',
    label: 'Type Check',
    detect: (project) => {
      if (project.pkgScripts) {
        if (project.pkgScripts.typecheck) return { cmd: project.pkgRunner('typecheck') };
      }
      if (project.pyproject) {
        if (project.hasMypy) return { cmd: 'mypy .' };
      }
      return null;
    },
  },
  {
    id: 'test',
    label: 'Tests',
    detect: (project) => {
      if (project.pkgScripts) {
        if (project.pkgScripts.test) return { cmd: project.pkgRunner('test', '--passWithNoTests') };
      }
      if (project.pyproject) {
        if (project.hasPytest) return { cmd: 'pytest --tb=short -q' };
      }
      if (project.goMod) return { cmd: 'go test ./...' };
      return null;
    },
  },
];

/**
 * Detect project configuration from the repo root.
 * Returns a "project" object used by gate detectors.
 */
export async function detectProject() {
  const root = await getRepoRoot();
  const project = {
    root,
    pkgScripts: null,
    pkgRuntime: null,
    pyproject: false,
    hasRuff: false,
    hasMypy: false,
    hasPytest: false,
    goMod: false,
    makefile: false,
    pkgRunner: (script, extra = '') => {
      const base = project.pkgRuntime === 'bun' ? `bun run ${script}` : `npm run ${script}`;
      return extra ? `${base} -- ${extra}` : base;
    },
  };

  // Read package.json
  try {
    const pkgPath = path.join(root, 'package.json');
    const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
    project.pkgScripts = pkg.scripts || {};
    project.pkgRuntime = await detectPkgRuntime(root);
  } catch {
    // no package.json
  }

  // Python: pyproject.toml
  try {
    await fs.access(path.join(root, 'pyproject.toml'));
    project.pyproject = true;
    project.hasRuff = await hasPythonTool(root, 'ruff');
    project.hasMypy = await hasPythonTool(root, 'mypy');
    project.hasPytest = await hasPythonTool(root, 'pytest');
  } catch {
    // no pyproject.toml
  }

  // Go
  try {
    await fs.access(path.join(root, 'go.mod'));
    project.goMod = true;
  } catch {
    // no go.mod
  }

  // Makefile
  try {
    await fs.access(path.join(root, 'Makefile'));
    project.makefile = true;
  } catch {
    // no Makefile
  }

  return project;
}

/**
 * Detect JS package runtime — bun vs npm.
 */
async function detectPkgRuntime(root) {
  try { await fs.access(path.join(root, 'bun.lock')); return 'bun'; } catch {}
  try { await fs.access(path.join(root, 'bun.lockb')); return 'bun'; } catch {}
  return 'npm';
}

/**
 * Check if a Python tool is installed and configured.
 */
async function hasPythonTool(root, tool) {
  try {
    // Check if tool is in pyproject.toml content
    const pyproject = await fs.readFile(path.join(root, 'pyproject.toml'), 'utf8');
    if (pyproject.includes(tool)) return true;
  } catch {}
  // Fallback: check if CLI is available
  try {
    execSync(`command -v ${tool}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect available gates for the project.
 * Returns array of { id, label, cmd }
 */
export async function detectGates() {
  const project = await detectProject();
  const gates = [];

  for (const def of GATE_DEFINITIONS) {
    const detected = def.detect(project);
    if (detected) {
      gates.push({ id: def.id, label: def.label, cmd: detected.cmd, status: 'pending' });
    }
  }

  return gates;
}

/**
 * Run a single gate command and return the result.
 */
export async function runGate(gate, root) {
  const start = Date.now();
  try {
    const output = execSync(gate.cmd, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000,
    });
    const duration = Date.now() - start;
    return {
      ...gate,
      status: 'pass',
      output: output.trim(),
      duration,
      error: null,
    };
  } catch (err) {
    const duration = Date.now() - start;
    const stdout = (err.stdout || '').toString().trim();
    const stderr = (err.stderr || '').toString().trim();
    const output = [stdout, stderr].filter(Boolean).join('\n').trim();
    return {
      ...gate,
      status: 'fail',
      output: output || err.message,
      duration,
      error: err.message,
    };
  }
}

/**
 * Run all detected gates sequentially.
 * Returns { results: GateResult[], passed: boolean }
 */
export async function runAllGates(gates, root) {
  const results = [];
  let passed = true;

  for (const gate of gates) {
    const result = await runGate(gate, root);
    results.push(result);
    if (result.status === 'fail') passed = false;
  }

  return { results, passed };
}

/**
 * Print gate results to stdout in a compact format.
 */
export function printGateResults(results, options = {}) {
  const failed = results.filter(r => r.status === 'fail');
  const passed = results.filter(r => r.status === 'pass');

  console.log();
  console.log(chalk.bold('Gate Results:'));

  for (const r of results) {
    const icon = r.status === 'pass' ? chalk.green('✓') : chalk.red('✗');
    const timing = chalk.gray(`(${formatDuration(r.duration)})`);
    console.log(`  ${icon} ${chalk.white(r.label)} ${timing}`);
  }

  if (failed.length > 0) {
    console.log();
    console.log(chalk.red.bold(`  ${failed.length} gate(s) failed:`));
    for (const f of failed) {
      console.log(chalk.red(`\n  ── ${f.label} ──`));
      const lines = f.output.split('\n').slice(0, 20);
      for (const line of lines) {
        console.log(chalk.gray(`    ${line}`));
      }
      if (f.output.split('\n').length > 20) {
        console.log(chalk.gray(`    ... (truncated, ${f.output.split('\n').length} lines total)`));
      }
    }
    console.log();
    console.log(chalk.yellow('  Commit blocked. Fix issues above or use --no-gate to skip.'));
  } else if (passed.length > 0) {
    console.log();
    console.log(chalk.green(`  All ${passed.length} gate(s) passed.`));
  } else {
    console.log(chalk.gray('  No gates detected for this project.'));
  }

  console.log();
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
