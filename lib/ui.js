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
      type: 'input',
      name: 'model',
      message: 'Enter OpenRouter model (e.g., google/gemini-2.0-flash-001):',
      default: 'google/gemini-2.0-flash-001',
    },
  ]);

  return model;
}

export function formatCommitMessage({ type, scope, message }) {
  const scopeStr = scope ? `(${scope})` : '';
  return `${type}${scopeStr}: ${message}`;
}
