import inquirer from 'inquirer';
import chalk from 'chalk';

export async function promptCommitAction(formattedMessage) {
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

export function formatCommitMessage({ type, scope, message }) {
  const scopeStr = scope ? `(${scope})` : '';
  return `${type}${scopeStr}: ${message}`;
}

export async function promptStageAll() {
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

export async function promptPush(branch) {
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

export async function promptCreatePR(remoteUrl, branch) {
  if (!remoteUrl) return;
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
