import { simpleGit } from 'simple-git';
import fs from 'fs/promises';
import path from 'path';

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

async function getProjectIgnores() {
  try {
    const gacIgnorePath = path.join(process.cwd(), '.gacignore');
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
  
  // Use magic pathspec to exclude files
  // git diff --cached -- . ':!file1' ':!file2'
  const excludeParams = allIgnores.map(pattern => `:(exclude)${pattern}`);
  
  const diff = await git.diff(['--cached', '--', '.', ...excludeParams]);
  return diff;
}

export async function commit(message) {
  const tmpFile = path.join(process.cwd(), '.git', 'GAC_COMMIT_MSG');
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
  const tmpFile = path.join(process.cwd(), '.git', 'GAC_COMMIT_MSG');
  try {
    await fs.writeFile(tmpFile, message);
    return await git.raw(['commit', '--amend', '-F', tmpFile]);
  } finally {
    await fs.unlink(tmpFile).catch(() => {});
  }
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
    // Convert git@github.com:user/repo.git or https://github.com/user/repo.git to https://github.com/user/repo
    let url = origin.refs.push || origin.refs.fetch;
    url = url.replace(/\.git$/, '');
    url = url.replace(/^git@github\.com:/, 'https://github.com/');
    return url;
  } catch (e) {
    return null;
  }
}
