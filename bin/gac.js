#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import ora from 'ora';
import clipboard from 'clipboardy';

import config from '../lib/config.js';
import * as gitUtils from '../lib/git.js';
import * as aiUtils from '../lib/ai.js';
import * as uiUtils from '../lib/ui.js';

const program = new Command();

program
  .name('gac')
  .description('Git Auto Commit with AI')
  .version('1.3.0')
  .option('-k, --key <apiKey>', 'Set OpenRouter API Key')
  .option('-m, --model <model>', 'Set AI Model')
  .option('-s, --style <style>', 'Set Commit Style (conventional, vibe, minimal, detailed)')
  .option('-p, --prompt <prompt>', 'Set Custom System Prompt (text or path to file)')
  .option('-a, --amend', 'Amend last commit message with AI')
  .option('-d, --dry-run', 'Generate message without committing')
  .option('-c, --copy', 'Copy generated message to clipboard')
  .option('--no-verify', 'Skip pre-commit hook (used internally by hook)')
  .option('--no-sync', 'Skip checking for remote changes');

program
  .command('install-hook')
  .description('Install a pre-commit hook that runs gac')
  .action(async () => {
    try {
      if (!(await gitUtils.isRepo())) {
        console.error(chalk.red('Error: Not a git repository.'));
        process.exit(1);
      }

      const gitPath = path.join(process.cwd(), '.git');
      const hooksDir = path.join(gitPath, 'hooks');
      const hookPath = path.join(hooksDir, 'pre-commit');

      let existingContent = '';
      try {
        existingContent = await fs.readFile(hookPath, 'utf8');
      } catch (e) { }

      if (existingContent.includes('gac')) {
        console.log(chalk.yellow('Pre-commit hook already installed.'));
        return;
      }

      const hookContent = `#!/bin/sh\n# gac pre-commit hook\ngac --no-verify || exit 1\n`;
      await fs.writeFile(hookPath, hookContent, { mode: 0o755 });
      console.log(chalk.green('Successfully installed pre-commit hook.'));
    } catch (error) {
      console.error(chalk.red(`Failed to install hook: ${error.message}`));
    }
  });

program
  .action(async (options) => {
    // Handle configuration options
    if (options.key) {
      config.set('apiKey', options.key);
      console.log(chalk.green('API Key updated successfully.'));
      return;
    }

    if (options.model) {
      config.set('model', options.model);
      console.log(chalk.green(`Model updated to: ${options.model}`));
      return;
    }

    if (options.style) {
      config.set('style', options.style);
      console.log(chalk.green(`Default style updated to: ${options.style}`));
      return;
    }

    if (options.prompt) {
      let promptContent = options.prompt;
      // Check if it's a file path
      try {
        const stats = await fs.stat(options.prompt);
        if (stats.isFile()) {
          promptContent = await fs.readFile(options.prompt, 'utf8');
        }
      } catch (e) { }

      config.set('systemPrompt', promptContent);
      console.log(chalk.green('System Prompt updated successfully.'));
      return;
    }

    try {
      // Onboarding: first-run setup if no API key is configured
      if (!config.get('apiKey')) {
        console.log(chalk.cyan('\n  Welcome to gac - Git Auto Commit with AI\n'));
        console.log(chalk.gray('  Looks like this is your first time. Let\'s get you set up.\n'));
        console.log(chalk.gray('  You need an OpenRouter API key. Get one at:'));
        console.log(chalk.underline('  https://openrouter.ai/keys\n'));

        const apiKey = await uiUtils.promptApiKey();
        config.set('apiKey', apiKey);
        console.log(chalk.green('  API Key saved.\n'));

        const model = await uiUtils.promptModel();
        config.set('model', model);
        console.log(chalk.green(`  Model set to: ${model}\n`));

        console.log(chalk.cyan('  Setup complete. You\'re ready to go!\n'));
      }

      if (!(await gitUtils.isRepo())) {
        console.error(chalk.red('Error: Not a git repository.'));
        process.exit(1);
      }

      // Check for remote changes
      if (!options.noSync && !options.amend) {
        const fetchSpinner = ora('Checking for remote updates...').start();
        try {
          await gitUtils.fetch();
          const status = await gitUtils.getStatus();
          fetchSpinner.stop();

          if (status.behind > 0) {
            const syncAction = await uiUtils.promptPull(status.behind);
            if (syncAction === 'pull') {
              const pullSpinner = ora('Pulling changes...').start();
              try {
                await gitUtils.pull();
                pullSpinner.succeed('Changes pulled successfully.');
              } catch (err) {
                pullSpinner.fail('Pull failed. You might have merge conflicts.');
                console.error(chalk.red(`Error: ${err.message}`));
                process.exit(1);
              }
            } else if (syncAction === 'abort') {
              console.log(chalk.yellow('Aborted.'));
              process.exit(0);
            }
          }
        } catch (err) {
          fetchSpinner.warn('Could not fetch from remote. Continuing...');
        }
      }

      let diff;
      let lastCommitInfo;

      if (options.amend) {
        lastCommitInfo = await gitUtils.getLastCommitInfo();
        diff = lastCommitInfo.diff;
        console.log(chalk.blue('Regenerating for last commit...'));
      } else {
        diff = await gitUtils.getStagedDiff();
      }

      if (!diff || diff.trim() === '') {
        const stageAll = await uiUtils.promptStageAll();

        if (stageAll) {
          const stageSpinner = ora('Staging all changes...').start();
          await gitUtils.addAll();
          stageSpinner.succeed('All changes staged.');
          diff = await gitUtils.getStagedDiff();
        } else {
          console.log(chalk.yellow('Aborting: No changes staged.'));
          return;
        }
      }

      if (!diff || diff.trim() === '') {
        console.log(chalk.yellow('No changes found to commit.'));
        return;
      }

      const spinner = ora('Analyzing changes and generating message...').start();

      let messageData;
      try {
        messageData = await aiUtils.generateMessage(diff, {
          model: options.model,
          style: options.style,
        });
        spinner.succeed('Message generated!');
      } catch (err) {
        spinner.fail('Generation failed');
        console.error(chalk.red(`Error: ${err.message}`));
        process.exit(1);
      }

      let formattedMessage = uiUtils.formatCommitMessage(messageData);

      if (options.copy) {
        await clipboard.write(formattedMessage);
        console.log(chalk.gray('(Copied to clipboard)'));
      }

      if (options.dryRun) {
        console.log(chalk.cyan('\nGenerated Commit Message:'));
        console.log(chalk.bold.white(formattedMessage));
        return;
      }

      let action = 'regenerate';
      while (action === 'regenerate') {
        action = await uiUtils.promptCommitAction(formattedMessage);

        if (action === 'regenerate') {
          const regenSpinner = ora('Regenerating message...').start();
          try {
            messageData = await aiUtils.generateMessage(diff, {
              model: options.model,
              style: options.style,
            });
            regenSpinner.succeed('Message regenerated!');
            formattedMessage = uiUtils.formatCommitMessage(messageData);
          } catch (err) {
            regenSpinner.fail('Regeneration failed');
            console.error(chalk.red(`Error: ${err.message}`));
            process.exit(1);
          }
        } else if (action === 'edit') {
          formattedMessage = await uiUtils.promptEditMessage(formattedMessage);
          action = 'confirm';
        }
      }

      if (action === 'confirm') {
        if (options.amend) {
          await gitUtils.amendCommit(formattedMessage);
          console.log(chalk.green('Successfully amended commit.'));
        } else {
          await gitUtils.commit(formattedMessage);
          console.log(chalk.green('Successfully committed.'));
        }

        // Post-commit: push prompt
        const branch = await gitUtils.getCurrentBranch();
        const pushAction = await uiUtils.promptPush(branch);
        if (pushAction === 'push') {
          const pushSpinner = ora('Pushing to remote...').start();
          try {
            await gitUtils.push();
            pushSpinner.succeed('Pushed to remote.');
          } catch (err) {
            pushSpinner.fail('Push failed');
            console.error(chalk.red(`Error: ${err.message}`));
            return;
          }

          // Post-push: PR prompt (only on feature branches)
          const remoteUrl = await gitUtils.getRemoteUrl();
          if (remoteUrl && branch !== 'main' && branch !== 'master') {
            const shouldPR = await uiUtils.promptCreatePR(remoteUrl, branch);
            if (shouldPR) {
              const prUrl = `${remoteUrl}/compare/${branch}?expand=1`;
              const open = (await import('open')).default;
              await open(prUrl);
              console.log(chalk.green(`Opened PR page: ${prUrl}`));
            }
          }
        }
      } else {
        console.log(chalk.yellow('Commit aborted.'));
      }

    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      if (error.message.includes('API key not found')) {
        console.log(chalk.cyan('Run `gac --key <OPENROUTER_KEY>` to set it up.'));
      }
    }
  });

program.parse(process.argv);
