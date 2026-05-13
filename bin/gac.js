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
import { checkForUpdates } from '../lib/update.js';

const pkg = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));

const program = new Command();

program
  .name('gac')
  .description('Git Auto Commit with AI')
  .version(pkg.version)
  .option('-k, --key <apiKey>', 'Set OpenRouter API Key')
  .option('-m, --model <model>', 'Set AI Model')
  .option('-s, --style <style>', 'Set Commit Style (conventional, vibe, minimal, detailed, verbose)')
  .option('-p, --prompt <prompt>', 'Set Custom System Prompt (text or path to file)')
  .option('-v, --verbose', 'Show detailed logs and raw AI interactions')
  .option('-a, --amend', 'Amend last commit message with AI')
  .option('-d, --dry-run', 'Generate message without committing')
  .option('-c, --copy', 'Copy generated message to clipboard')
  .option('-y, --yes', 'Bypass all prompts (headless mode)')
  .option('--json', 'Output results as JSON')
  .option('--no-verify', 'Skip pre-commit hook (used internally by hook)')
  .option('--no-sync', 'Skip checking for remote changes');

program
  .command('config')
  .description('Show current configuration')
  .action(() => {
    const all = config.store;
    console.log(chalk.cyan('\nCurrent Configuration:'));
    for (const [key, value] of Object.entries(all)) {
      if (key === 'apiKey') {
        const masked = value ? `${value.substring(0, 8)}...${value.substring(value.length - 4)}` : '(not set)';
        console.log(`${chalk.bold(key)}: ${chalk.yellow(masked)}`);
      } else {
        console.log(`${chalk.bold(key)}: ${chalk.white(value || '(default)')}`);
      }
    }
    console.log();
  });

program
  .command('install-hook')
  .description('Install a pre-commit hook that runs gac')
  .action(async () => {
    try {
      if (!(await gitUtils.isRepo())) {
        console.error(chalk.red('Error: Not a git repository.'));
        process.exit(1);
      }

      const gitPath = await gitUtils.getGitDir();
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
    // Check for updates on every run
    // Check for updates
    const latestVersion = await checkForUpdates();
    if (latestVersion) {
      const shouldUpdate = await uiUtils.promptUpdate(latestVersion);
      if (shouldUpdate) {
        const updateSpinner = ora(`Updating to ${latestVersion}...`).start();
        try {
          const { execSync } = await import('child_process');
          execSync('bun install -g gac-cli', { stdio: 'ignore' });
          updateSpinner.succeed(`Successfully updated to ${latestVersion}! Please restart gac.`);
          process.exit(0);
        } catch (err) {
          updateSpinner.fail('Update failed.');
          console.log(chalk.gray(`  Please run ${chalk.cyan('bun install -g gac-cli')} manually.\n`));
        }
      }
    }

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
      const validStyles = ['conventional', 'vibe', 'minimal', 'detailed', 'verbose'];
      if (!validStyles.includes(options.style)) {
        console.error(chalk.red(`Error: Invalid style '${options.style}'`));
        console.log(chalk.gray(`Available styles: ${validStyles.join(', ')}`));
        process.exit(1);
      }
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
      if (!config.get('apiKey') && !options.yes) {
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

        // Optional AI Discovery Onboarding
        const shouldInitAI = await uiUtils.promptAIDiscovery();
        if (shouldInitAI) {
          const repoRoot = await gitUtils.getRepoRoot();
          await uiUtils.createAIDiscoveryFiles(repoRoot);
          console.log(chalk.green('  AI Discovery files created.\n'));
        }

        console.log(chalk.cyan('  Setup complete. You\'re ready to go!\n'));
      }

      if (!(await gitUtils.isRepo())) {
        console.error(chalk.red('Error: Not a git repository.'));
        process.exit(1);
      }

      // Check for remote changes
      if (!options.noSync && !options.amend) {
        const fetchSpinner = options.json ? null : ora('Checking for remote updates...').start();
        try {
          await gitUtils.fetch();
          const status = await gitUtils.getStatus();
          if (fetchSpinner) fetchSpinner.stop();

          if (status.behind > 0) {
            const syncAction = await uiUtils.promptPull(status.behind, options);
            if (syncAction === 'pull') {
              const pullSpinner = options.json ? null : ora('Pulling changes...').start();
              try {
                await gitUtils.pull();
                if (pullSpinner) pullSpinner.succeed('Changes pulled successfully.');
              } catch (err) {
                if (pullSpinner) pullSpinner.fail('Pull failed. You might have merge conflicts.');
                throw err;
              }
            } else if (syncAction === 'abort') {
              if (!options.json) console.log(chalk.yellow('Aborted.'));
              process.exit(0);
            }
          }
        } catch (err) {
          if (fetchSpinner) fetchSpinner.warn('Could not fetch from remote. Continuing...');
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
        const stageAll = await uiUtils.promptStageAll(options);

        if (stageAll) {
          const stageSpinner = options.json ? null : ora('Staging all changes...').start();
          await gitUtils.addAll();
          if (stageSpinner) stageSpinner.succeed('All changes staged.');
          diff = await gitUtils.getStagedDiff();
        } else {
          if (!options.json) console.log(chalk.yellow('Aborting: No changes staged.'));
          return;
        }
      }

      if (!diff || diff.trim() === '') {
        if (!options.json) console.log(chalk.yellow('No changes found to commit.'));
        if (options.json) console.log(JSON.stringify({ status: 'success', message: 'No changes found' }));
        return;
      }

      const spinner = options.json ? null : ora('Analyzing changes and generating message...').start();

      let messageData;
      try {
        messageData = await aiUtils.generateMessage(diff, {
          model: options.model,
          style: options.style,
          verbose: options.verbose,
          onRetry: (attempt, max, delay) => {
            if (spinner) spinner.text = chalk.yellow(`Attempt ${attempt}/${max} failed. Retrying in ${delay / 1000}s...`);
          }
        });
        if (spinner) spinner.succeed('Message generated!');
      } catch (err) {
        if (spinner) spinner.fail('Generation failed');
        throw err;
      }

      let formattedMessage = uiUtils.formatCommitMessage(messageData);

      if (options.copy) {
        await clipboard.write(formattedMessage);
        if (!options.json) console.log(chalk.gray('(Copied to clipboard)'));
      }

      if (options.dryRun) {
        if (options.json) {
          console.log(JSON.stringify({ status: 'success', message: formattedMessage, data: messageData }));
        } else {
          console.log(chalk.cyan('\nGenerated Commit Message:'));
          console.log(chalk.bold.white(formattedMessage));
        }
        return;
      }

      let action = 'regenerate';
      while (action === 'regenerate') {
        action = await uiUtils.promptCommitAction(formattedMessage, options);

        if (action === 'regenerate') {
          const regenSpinner = options.json ? null : ora('Regenerating message...').start();
          try {
            messageData = await aiUtils.generateMessage(diff, {
              model: options.model,
              style: options.style,
              verbose: options.verbose,
              onRetry: (attempt, max, delay) => {
                if (regenSpinner) regenSpinner.text = chalk.yellow(`Attempt ${attempt}/${max} failed. Retrying in ${delay / 1000}s...`);
              }
            });
            if (regenSpinner) regenSpinner.succeed('Message regenerated!');
            formattedMessage = uiUtils.formatCommitMessage(messageData);
          } catch (err) {
            if (regenSpinner) regenSpinner.fail('Regeneration failed');
            throw err;
          }
        } else if (action === 'edit') {
          formattedMessage = await uiUtils.promptEditMessage(formattedMessage);
          action = 'confirm';
        }
      }

      if (action === 'confirm') {
        if (options.amend) {
          await gitUtils.amendCommit(formattedMessage);
          if (!options.json) console.log(chalk.green('Successfully amended commit.'));
        } else {
          await gitUtils.commit(formattedMessage);
          if (!options.json) console.log(chalk.green('Successfully committed.'));
        }

        // Post-commit: push prompt
        const branch = await gitUtils.getCurrentBranch();
        const pushAction = await uiUtils.promptPush(branch, options);
        if (pushAction === 'push') {
          const pushSpinner = options.json ? null : ora('Pushing to remote...').start();
          try {
            await gitUtils.push();
            if (pushSpinner) pushSpinner.succeed('Pushed to remote.');
          } catch (err) {
            if (pushSpinner) pushSpinner.fail('Push failed');
            throw err;
          }

          // Post-push: PR prompt (only on feature branches)
          const remoteUrl = await gitUtils.getRemoteUrl();
          if (remoteUrl && branch !== 'main' && branch !== 'master') {
            const shouldPR = await uiUtils.promptCreatePR(remoteUrl, branch, options);
            if (shouldPR) {
              const prUrl = `${remoteUrl}/compare/${branch}?expand=1`;
              const open = (await import('open')).default;
              await open(prUrl);
              if (!options.json) console.log(chalk.green(`Opened PR page: ${prUrl}`));
            }
          }
        }
        if (options.json) console.log(JSON.stringify({ status: 'success', message: 'Committed successfully', commitMessage: formattedMessage }));
      } else {
        if (!options.json) console.log(chalk.yellow('Commit aborted.'));
        if (options.json) console.log(JSON.stringify({ status: 'aborted' }));
      }

    } catch (error) {
      if (options.json) {
        console.error(JSON.stringify({
          status: 'error',
          message: error.message,
          isFriendly: error.isFriendly || false
        }));
      } else {
        if (error.isFriendly) {
          console.log(error.message);
        } else {
          console.error(chalk.red(`Error: ${error.message}`));
        }
        if (error.message.includes('API key not found')) {
          console.log(chalk.cyan('Run `gac --key <OPENROUTER_KEY>` to set it up.'));
        }
      }
      process.exit(1);
    }
  });

program.parse(process.argv);
