import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';

const EMOJI_REGEX = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]+/gu;

export function stripEmojis(str) {
  return str.replace(EMOJI_REGEX, '').replace(/\s{2,}/g, ' ').trim();
}

export async function promptCommitAction(formattedMessage, stagedCount, stats, options = {}) {
  if (options.yes) return 'confirm';
  console.log(chalk.cyan('\nProposed Commit Message:'));
  console.log(chalk.bold.white(formattedMessage));
  console.log();

  let info = '';
  if (stagedCount) {
    info = `  (${stagedCount} file${stagedCount !== 1 ? 's' : ''} staged`;
    if (stats && (stats.additions || stats.deletions)) {
      info += `  ·  +${stats.additions}  -${stats.deletions}`;
    }
    info += ')';
  }
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?' + (info ? chalk.dim(info) : ''),
      default: 'change',
      choices: [
        { name: chalk.green('  Commit'), value: 'confirm' },
        { name: chalk.yellow('  Edit message'), value: 'edit' },
        { name: chalk.cyan('  Regenerate'), value: 'regenerate' },
        { name: chalk.blue('  Change files'), value: 'change' },
        { name: chalk.red('  Abort'), value: 'abort' },
      ],
    },
  ]);

  return action;
}

export async function promptEditMessage(currentMessage) {
  const { message } = await inquirer.prompt([
    {
      type: 'input',
      name: 'message',
      message: 'Edit commit message:',
      default: currentMessage,
    },
  ]);

  return message;
}

export async function promptApiKey() {
  const { apiKey } = await inquirer.prompt([
    {
      type: 'password',
      name: 'apiKey',
      message: 'Enter your OpenRouter API Key:',
      mask: '*',
    },
  ]);

  return apiKey;
}

export async function promptModel() {
  const { model } = await inquirer.prompt([
    {
      type: 'list',
      name: 'model',
      message: 'Select a default AI model:',
      choices: [
        { name: 'OpenRouter Free (Auto-route to free models)', value: 'openrouter/free' },
        { name: 'arcee-ai/trinity-large-preview:free', value: 'arcee-ai/trinity-large-preview:free' },
        { name: 'qwen/qwen3.6-plus:free', value: 'qwen/qwen3.6-plus:free' },
        { name: 'nvidia/nemotron-3-super-120b-a12b:free', value: 'nvidia/nemotron-3-super-120b-a12b:free' },
        { name: 'minimax/minimax-m2.5:free', value: 'minimax/minimax-m2.5:free' },
        { name: 'stepfun/step-3.5-flash:free', value: 'stepfun/step-3.5-flash:free' },
        { name: 'liquid/lfm-2.5-1.2b-instruct:free', value: 'liquid/lfm-2.5-1.2b-instruct:free' },
        { name: 'Custom (enter model ID)', value: 'custom' },
      ],
    },
  ]);

  if (model === 'custom') {
    const { customModel } = await inquirer.prompt([
      {
        type: 'input',
        name: 'customModel',
        message: 'Enter model ID (e.g., google/gemini-2.0-flash-001):',
      },
    ]);
    return customModel;
  }

  return model;
}

/**
 * Format a commit message from the AI response data.
 * @param {object} data - The parsed AI response
 * @param {object} options - Formatting options
 * @param {boolean} options.noEmoji - Strip emojis if true
 */
export function formatCommitMessage(data, options = {}) {
  const type = data.type || 'chore';
  const scope = data.scope;
  let message = (data.message || data.subject || data.description || 'unknown change').trim();
  const body = data.body;

  // Strip emojis if requested
  if (options.noEmoji) {
    message = stripEmojis(message);
  }

  // Prevent double-prefixing if the AI already included the type/scope in the message
  const prefixRegex = /^[a-z]+(\([a-z0-9-]+\))?!?:\s+/i;
  if (prefixRegex.test(message)) {
    message = message.replace(prefixRegex, '');
  }

  // Enforce subject line length limit (72 chars for subject)
  const scopeStr = scope ? `(${scope})` : '';
  let subjectLine = `${type}${scopeStr}: ${message}`;

  if (subjectLine.length > 100) {
    // Hard truncate with ellipsis
    message = message.substring(0, 100 - `${type}${scopeStr}: `.length - 3) + '...';
    subjectLine = `${type}${scopeStr}: ${message}`;
  }

  let formatted = subjectLine;

  if (body) {
    // Validate body doesn't have overly long lines
    const bodyLines = body.split('\n').map(line => {
      if (line.length > 100) {
        // Wrap long lines at word boundary
        const words = line.split(' ');
        const wrapped = [];
        let current = '';
        for (const word of words) {
          if ((current + ' ' + word).length > 100) {
            wrapped.push(current);
            current = '  ' + word; // indent continuation
          } else {
            current = current ? current + ' ' + word : word;
          }
        }
        if (current) wrapped.push(current);
        return wrapped.join('\n');
      }
      return line;
    }).join('\n');

    formatted += `\n\n${bodyLines}`;
  }

  return formatted;
}

/**
 * Validate a commit message against Conventional Commits spec.
 * Returns { valid: boolean, warnings: string[] }
 */
export function validateCommitMessage(message) {
  const warnings = [];
  const subjectLine = message.split('\n')[0];
  const conventionalCommitRegex = /^(feat|fix|docs|style|refactor|perf|test|chore|ci|build|revert)(\([a-z0-9-]+\))?!?: .+/;

  if (!conventionalCommitRegex.test(subjectLine)) {
    warnings.push('Does not match Conventional Commits format: <type>(<scope>): <description>');
  }

  if (subjectLine.length > 72) {
    warnings.push(`Subject line is ${subjectLine.length} chars (recommended ≤72)`);
  }

  if (subjectLine.endsWith('.')) {
    warnings.push('Subject should not end with a period');
  }

  const afterColon = subjectLine.match(/:\s+(.+)/);
  if (afterColon && afterColon[1] && afterColon[1][0] !== afterColon[1][0].toLowerCase()) {
    warnings.push('Subject after ": " should start with lowercase');
  }

  return { valid: warnings.length === 0, warnings };
}

/**
 * Print a nicely formatted commit message preview.
 * Shows the full git commit as it would appear, with metadata.
 */
export function printCommitPreview(formattedMessage, data) {
  const terminalWidth = process.stdout.columns || 80;
  const boxWidth = Math.min(terminalWidth - 4, 76);
  const line = '─'.repeat(boxWidth);

  const type = data.type || 'chore';
  const scope = data.scope || null;
  const confidence = ((data.confidence || 0) * 100).toFixed(0);

  // Color the type
  const typeColors = {
    feat: chalk.green,
    fix: chalk.red,
    docs: chalk.blue,
    style: chalk.magenta,
    refactor: chalk.cyan,
    perf: chalk.yellow,
    test: chalk.green,
    chore: chalk.gray,
    ci: chalk.blue,
    build: chalk.yellow,
    revert: chalk.red,
  };
  const typeColor = typeColors[type] || chalk.white;
  const prefix = scope ? `${type}(${scope}):` : `${type}:`;

  console.log();
  console.log(chalk.gray(`  ┌${line}┐`));

  // Subject line
  const subjectLine = formattedMessage.split('\n')[0];
  const padding = boxWidth - subjectLine.length;
  const paddedSubject = padding > 0 ? subjectLine + ' '.repeat(padding) : subjectLine.substring(0, boxWidth);
  console.log(chalk.gray(`  │`) + chalk.bold.white(paddedSubject) + chalk.gray(`│`));

  // Body (if verbose style)
  const lines = formattedMessage.split('\n');
  if (lines.length > 2) {
    console.log(chalk.gray(`  ├${line}┤`));
    for (let i = 2; i < lines.length; i++) {
      const l = lines[i] || '';
      const truncated = l.length > boxWidth ? l.substring(0, boxWidth - 3) + '...' : l;
      const pad = boxWidth - Math.min(l.length, boxWidth);
      const spaces = pad > 0 ? ' '.repeat(pad) : '';
      console.log(chalk.gray(`  │`) + chalk.gray(truncated) + spaces + chalk.gray(`│`));
    }
  }

  console.log(chalk.gray(`  └${line}┘`));
  console.log(chalk.dim(`    Type: ${typeColor(type)}  Scope: ${scope || chalk.gray('(none)')}  Confidence: ${confidence}%`));
  console.log();
}

function statusBadge(label) {
  switch (label) {
    case 'modified': return chalk.yellow('M');
    case 'untracked': return chalk.green('??');
    case 'added': return chalk.green('A');
    case 'deleted': return chalk.red('D');
    case 'renamed': return chalk.blue('R');
    case 'staged': return chalk.cyan(' ');
    case 'unmerged': return chalk.magenta('U');
    default: return chalk.gray(' ');
  }
}

const GROUP_ORDER = ['modified', 'changed', 'added', 'untracked', 'renamed', 'deleted', 'staged', 'unmerged'];
const GROUP_NAMES = {
  modified: 'Modified', changed: 'Modified',
  added: 'New', untracked: 'New',
  renamed: 'Renamed',
  deleted: 'Deleted',
  staged: 'Staged',
  unmerged: 'Unmerged',
};

function groupFileChoices(files, hasStaged) {
  const groups = {};
  for (const f of files) {
    const g = GROUP_NAMES[f.label] || 'Other';
    if (!groups[g]) groups[g] = [];
    groups[g].push(f);
  }

  const seen = new Set();
  const choices = [];
  for (const g of ['Modified', 'New', 'Renamed', 'Deleted', 'Staged', 'Unmerged', 'Other']) {
    if (!groups[g]) continue;
    choices.push(new inquirer.Separator(chalk.gray(` ${g} `)));
    for (const f of groups[g]) {
      seen.add(f.path);
      choices.push({
        name: `${statusBadge(f.label)}  ${f.path}`,
        value: f.path,
        checked: hasStaged ? f.staged : true,
      });
    }
  }
  // Fallback for files that matched no group
  for (const f of files) {
    if (!seen.has(f.path)) {
      choices.push({
        name: `${statusBadge(f.label)}  ${f.path}`,
        value: f.path,
        checked: hasStaged ? f.staged : true,
      });
    }
  }
  return choices;
}

export async function promptFileSelection(changedFiles, options = {}) {
  if (options.yes) return changedFiles.map(f => f.path);

  const hasStaged = changedFiles.some(f => f.staged);
  const choices = groupFileChoices(changedFiles, hasStaged);

  const { files } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'files',
      message: `Select files to commit (${changedFiles.length} changed):`,
      choices,
      pageSize: Math.min(changedFiles.length + 6, 22),
      loop: false,
      theme: {
        icon: {
          checked: chalk.green('[x]'),
          unchecked: chalk.gray('[ ]'),
        },
      },
    },
  ]);

  return files;
}

export async function promptStageAll(options = {}) {
  if (options.yes) return true;
  const { stageAll } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'stageAll',
      message: 'No staged changes found. Stage all changes and continue?',
      default: true,
    },
  ]);
  return stageAll;
}

export async function promptPush(branch, options = {}) {
  if (options.yes) return 'push';
  const { pushAction } = await inquirer.prompt([
    {
      type: 'list',
      name: 'pushAction',
      message: 'Push changes?',
      choices: [
        { name: `Push to origin/${branch}`, value: 'push' },
        { name: 'Skip push', value: 'skip' },
      ],
    },
  ]);
  return pushAction;
}

export async function promptPull(behindCount, options = {}) {
  if (options.yes) return 'pull';
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: `Your branch is behind by ${behindCount} commit(s). What would you like to do?`,
      choices: [
        { name: 'Pull changes now', value: 'pull' },
        { name: 'Continue without pulling', value: 'skip' },
        { name: 'Abort', value: 'abort' },
      ],
    },
  ]);
  return action;
}

export async function promptAIDiscovery() {
  const { setup } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'setup',
      message: 'Would you like to initialize AI discovery for this repository? (Creates .cursorrules/ai-instructions.md)',
      default: false,
    },
  ]);
  return setup;
}

export async function createAIDiscoveryFiles(repoRoot) {
  const instructions = `# GAC Agent Interface Specification

This project uses **gac** (Git Auto Commit) to maintain high-quality, conventional commit history.

## Capabilities
- **Commit**: Generate and execute conventional commits.
- **Diff Analysis**: Optimized filtering of lock files and noise.
- **Workflow**: Automated pull/push/PR management.

## Usage for Agents
When committing changes, **do not** use standard \`git commit\`. Use the \`gac\` CLI:

### Execute Commit
\`\`\`bash
gac --yes
\`\`\`

### Dry Run (JSON Output)
\`\`\`bash
gac --dry-run --json
\`\`\`

### With Scope Override
\`\`\`bash
gac --yes --scope auth
\`\`\`

## Conventions
- **Style**: Conventional Commits (feat, fix, chore, etc.)
- **Binary**: \`gac\` is the authoritative tool for git operations in this repo.
`;

  const files = [
    { name: '.agent', content: instructions },
    { name: '.cursorrules', content: 'Please follow the instructions in .agent for git commits.' },
    { name: '.windsurfrules', content: 'Please follow the instructions in .agent for git commits.' },
    { name: '.aiannotations', content: 'Please follow the instructions in .agent for git commits.' },
  ];

  for (const file of files) {
    await fs.writeFile(path.join(repoRoot, file.name), file.content);
  }
}

export async function promptUpdate(latestVersion) {
  const { shouldUpdate } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'shouldUpdate',
      message: `A new version (${latestVersion}) is available. Update now?`,
      default: true,
    },
  ]);
  return shouldUpdate;
}

export async function promptCreatePR(remoteUrl, branch, options = {}) {
  if (!remoteUrl) return;
  if (options.yes) return false;
  const { shouldPR } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'shouldPR',
      message: 'Create a Pull Request on GitHub?',
      default: false,
    },
  ]);
  return shouldPR;
}
