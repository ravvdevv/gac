import { simpleGit } from 'simple-git';
import fs from 'fs/promises';
import path from 'path';
import { minimatch } from 'minimatch';

const git = simpleGit();

const DEFAULT_IGNORES = [
  'bun.lock',
  'bun.lockb',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'composer.lock',
  'Cargo.lock',
  'Gemfile.lock',
];

/**
 * Check if a filename matches a .gacignore pattern.
 * Supports:
 *   - Exact filenames: "package-lock.json"
 *   - Glob patterns: "*.lock", "dist/**", "src/*.test.js"
 *   - Directory patterns: "node_modules/" (matches anything inside)
 */
function matchesIgnorePattern(filename, pattern) {
  // Directory pattern: "node_modules/" matches "node_modules/anything"
  if (pattern.endsWith('/')) {
    const dir = pattern.slice(0, -1);
    return filename === dir || filename.startsWith(dir + '/');
  }

  // Use minimatch for glob support
  try {
    return minimatch(filename, pattern, { dot: true, matchBase: true });
  } catch {
    // Fallback to exact match if pattern is invalid glob
    return filename === pattern;
  }
}

export async function getGitDir() {
  const dir = await git.revparse(['--git-dir']);
  return path.resolve(process.cwd(), dir.trim());
}

export async function getRepoRoot() {
  const root = await git.revparse(['--show-toplevel']);
  return path.resolve(process.cwd(), root.trim());
}

async function getProjectIgnores() {
  try {
    const root = await getRepoRoot();
    const gacIgnorePath = path.join(root, '.gacignore');
    const content = await fs.readFile(gacIgnorePath, 'utf8');
    return content.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  } catch (e) {
    return [];
  }
}

export async function addAll() {
  return await git.add('.');
}

export async function getStagedDiff() {
  const projectIgnores = await getProjectIgnores();
  const allIgnores = [...new Set([...DEFAULT_IGNORES, ...projectIgnores])];

  // First get the raw staged diff
  const rawDiff = await git.diff(['--cached', '--', '.']);

  if (!rawDiff || allIgnores.length === 0) return rawDiff;

  // Filter out ignored files from the diff
  // Split into per-file blocks and filter
  const blocks = rawDiff.split(/(?=^diff --git )/m);
  const filtered = blocks.filter(block => {
    if (!block.startsWith('diff --git')) return true; // keep any preamble

    // Extract the file path from the diff header
    const match = block.match(/^diff --git a\/(.+) b\/(.+)/m);
    if (!match) return true;

    const filePath = match[1];
    // Check if this file matches any ignore pattern
    return !allIgnores.some(pattern => matchesIgnorePattern(filePath, pattern));
  });

  return filtered.join('');
}

/**
 * Get list of changed file paths from staged diff.
 * Useful for AI context enrichment.
 */
export async function getStagedFiles() {
  const status = await git.status();
  // status.staged already contains all staged files (created, modified, renamed, deleted)
  // No need to cross-reference with status.modified — that misses created/renamed/deleted
  return status.staged;
}

export async function commit(message) {
  const gitDir = await getGitDir();
  const tmpFile = path.join(gitDir, 'GAC_COMMIT_MSG');
  try {
    await fs.writeFile(tmpFile, message);
    return await git.raw(['commit', '-F', tmpFile]);
  } finally {
    await fs.unlink(tmpFile).catch(() => {});
  }
}

export async function getLastCommitInfo() {
  const log = await git.log({ n: 1 });
  const diff = await git.show(['HEAD']);
  return {
    message: log.latest.message,
    diff,
  };
}

export async function amendCommit(message) {
  const gitDir = await getGitDir();
  const tmpFile = path.join(gitDir, 'GAC_COMMIT_MSG');
  try {
    await fs.writeFile(tmpFile, message);
    return await git.raw(['commit', '--amend', '-F', tmpFile]);
  } finally {
    await fs.unlink(tmpFile).catch(() => {});
  }
}

export async function undoLastCommit() {
  // Soft reset — keeps changes staged
  return await git.reset(['--soft', 'HEAD~1']);
}

export async function isRepo() {
  try {
    return await git.checkIsRepo();
  } catch (e) {
    return false;
  }
}

export async function fetch() {
  return await git.fetch();
}

export async function getStatus() {
  return await git.status();
}

export async function pull() {
  return await git.pull();
}

export async function push() {
  return await git.push();
}

export async function getCurrentBranch() {
  const branch = await git.revparse(['--abbrev-ref', 'HEAD']);
  return branch.trim();
}

export async function getRemoteUrl() {
  try {
    const remotes = await git.getRemotes(true);
    const origin = remotes.find(r => r.name === 'origin');
    if (!origin) return null;
    let url = origin.refs.push || origin.refs.fetch;
    url = url.replace(/\.git$/, '');
    url = url.replace(/^git@github\.com:/, 'https://github.com/');
    return url;
  } catch (e) {
    return null;
  }
}
