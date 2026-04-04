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
  return await git.commit(message);
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
  return await git.commit(message, { '--amend': null });
}

export async function isRepo() {
  try {
    return await git.checkIsRepo();
  } catch (e) {
    return false;
  }
}
