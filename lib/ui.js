import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';

export async function promptCommitAction(formattedMessage, options = {}) {
  if (options.yes) return 'confirm';
  console.log(chalk.cyan('\nProposed Commit Message:'));
  console.log(chalk.bold.white(formattedMessage));
  console.log();

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: 'Confirm and commit', value: 'confirm' },
        { name: 'Edit message', value: 'edit' },
        { name: 'Regenerate message', value: 'regenerate' },
        { name: 'Abort', value: 'abort' },
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

export function formatCommitMessage(data) {
  const type = data.type || 'feat';
  const scope = data.scope;
  let message = data.message || data.subject || data.description || 'unknown change';
  const body = data.body;
  
  // Prevent double-prefixing if the AI already included the type/scope in the message
  const prefixRegex = /^[a-z]+(\([a-z0-9-]+\))?:\s+/i;
  if (prefixRegex.test(message)) {
    message = message.replace(prefixRegex, '');
  }

  const scopeStr = scope ? `(${scope})` : '';
  let formatted = `${type}${scopeStr}: ${message}`;

  if (body) {
    formatted += `\n\n${body}`;
  }

  return formatted;
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
  if (options.yes) return false; // Default to not creating PR in headless to avoid browser opening
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
