#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import ora from 'ora';
import clipboard from 'clipboardy';
import inquirer from 'inquirer';

import config from '../lib/config.js';
import * as gitUtils from '../lib/git.js';
import * as aiUtils from '../lib/ai.js';
import * as uiUtils from '../lib/ui.js';
import { checkForUpdates } from '../lib/update.js';
import { detectGates, runAllGates, printGateResults } from '../lib/gate.js';

const pkg = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));

const program = new Command();

program
  .name('gac')
  .description('Git Auto Commit with AI')
  .version(pkg.version)
  .option('-k, --key <apiKey>', 'Set OpenRouter API Key')
  .option('-m, --model <model>', 'Set AI Model')
  .option('-s, --style <style>', 'Set Commit Style')
  .option('--scope <scope>', 'Set commit scope (e.g., "auth", "api", "ui").')
  .option('-p, --prompt <prompt>', 'Set Custom System Prompt (text or path to file)')
  .option('-v, --verbose', 'Show detailed logs and raw AI interactions')
  .option('-a, --amend', 'Amend last commit message with AI')
  .option('-d, --dry-run', 'Generate message without committing')
  .option('-c, --copy', 'Copy generated message to clipboard')
  .option('-y, --yes', 'Bypass all prompts (headless mode)')
  .option('--json', 'Output results as JSON')
  .option('--no-verify', 'Skip pre-commit hook')
  .option('--no-sync', 'Skip checking for remote changes')
  .option('--no-emoji', 'Strip emojis from generated commit messages')
  .option('--fallback-model <model>', 'Set fallback AI model')
  .option('--gate', 'Run project gates before committing', true)
  .option('--no-gate', 'Skip pre-commit gates');

program
  .command('config')
  .description('Show current configuration')
  .action(() => {
    const all = config.store;
    console.log(chalk.cyan('\nCurrent Configuration:'));
    for (const [key, value] of Object.entries(all)) {
      if (key === 'apiKey') {
        const masked = value ? value.substring(0,8) + '....' + value.substring(value.length - 4) : '(not set)';
        console.log(chalk.bold(key) + ': ' + chalk.yellow(masked));
      } else {
        console.log(chalk.bold(key) + ': ' + chalk.white(value || '(default)'));
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
      const hookPath = path.join(gitPath, 'hooks', 'pre-commit');
      let existingContent = '';
      try { existingContent = await fs.readFile(hookPath, 'utf8'); } catch (e) { }
      if (existingContent.includes('gac')) {
        console.log(chalk.yellow('Pre-commit hook already installed.'));
        return;
      }
      const hookContent = '#!/bin/sh\n# gac pre-commit hook\ngac --no-verify || exit 1\n';
      await fs.writeFile(hookPath, hookContent, { mode: 0o755 });
      console.log(chalk.green('Successfully installed pre-commit hook.'));
    } catch (error) {
      console.error(chalk.red('Failed to install hook: ' + error.message));
    }
  });

program
  .command('validate')
  .description('Validate a commit message against Conventional Commits spec')
  .argument('<message>', 'Commit message to validate')
  .action((message) => {
    const result = uiUtils.validateCommitMessage(message);
    if (result.valid) {
      console.log(chalk.green('Valid Conventional Commit message'));
    } else {
      console.log(chalk.red('Does not follow Conventional Commits format'));
    }
    for (const w of result.warnings) {
      console.log(chalk.yellow('  ' + w));
    }
    process.exit(result.valid ? 0 : 1);
  });

program
  .command('undo')
  .description('Undo the last commit, restoring changes to staging')
  .action(async () => {
    try {
      if (!(await gitUtils.isRepo())) {
        console.error(chalk.red('Error: Not a git repository.'));
        process.exit(1);
      }
      const log = await gitUtils.getLastCommitInfo();
      if (!log || !log.message) {
        console.log(chalk.yellow('No commits to undo.'));
        process.exit(0);
      }
      console.log(chalk.gray('  Last commit: ' + log.message.split('\n')[0]));
      const { confirm } = await inquirer.prompt([
        { type: 'confirm', name: 'confirm', message: 'Undo this commit? Changes will be restored to staging.', default: true }
      ]);
      if (confirm) {
        await gitUtils.undoLastCommit();
        console.log(chalk.green('Commit undone. Changes restored to staging.'));
      } else {
        console.log(chalk.yellow('Aborted.'));
      }
    } catch (error) {
      console.error(chalk.red('Error: ' + error.message));
      process.exit(1);
    }
  });

program
  .command('gates')
  .description('Detect and run project gates (lint, test, typecheck)')
  .action(async () => {
    try {
      if (!(await gitUtils.isRepo())) {
        console.error(chalk.red('Error: Not a git repository.'));
        process.exit(1);
      }
      const gates = await detectGates();
      if (gates.length === 0) {
        console.log(chalk.yellow('No gates detected for this project.'));
        return;
      }
      console.log(chalk.cyan('\nDetected ' + gates.length + ' gate(s):\n'));
      for (const g of gates) {
        console.log('  ' + chalk.white(g.label) + ' -> ' + chalk.gray(g.cmd));
      }
      console.log('\n' + chalk.bold('Running gates...\n'));
      const repos = await gitUtils.getRepoRoot();
      const { results, passed } = await runAllGates(gates, repos);
      printGateResults(results);
      process.exit(passed ? 0 : 1);
    } catch (error) {
      console.error(chalk.red('Error: ' + error.message));
      process.exit(1);
    }
  });

// ─── Main action: the commit flow ─────────────────────────────────────────────

program.action(async (options) => {
  // Handle --key (set API key and exit)
  if (options.key) {
    config.set('apiKey', options.key);
    console.log(chalk.green('API key saved.'));
    return;
  }

  // Handle --model (set model and exit)
  if (options.model) {
    config.set('model', options.model);
    console.log(chalk.green('Model set to: ' + options.model));
    return;
  }

  // Handle --fallback-model (set fallback and exit)
  if (options.fallbackModel) {
    config.set('fallbackModel', options.fallbackModel);
    console.log(chalk.green('Fallback model set to: ' + options.fallbackModel));
    return;
  }

  // Handle --style (set style and exit)
  if (options.style) {
    config.set('style', options.style);
    console.log(chalk.green('Commit style set to: ' + options.style));
    return;
  }

  // Handle --prompt (set custom system prompt and exit)
  if (options.prompt) {
    const promptPath = path.resolve(options.prompt);
    try {
      const content = await fs.readFile(promptPath, 'utf8');
      config.set('systemPrompt', content);
      console.log(chalk.green('Custom prompt loaded from: ' + options.prompt));
    } catch {
      config.set('systemPrompt', options.prompt);
      console.log(chalk.green('Custom prompt saved.'));
    }
    return;
  }

  // ─── Check for updates (unless --no-sync) ─────────────────────────────
  if (options.sync !== false && !options.yes) {
    const latestVersion = await checkForUpdates();
    if (latestVersion) {
      const shouldUpdate = await uiUtils.promptUpdate(latestVersion);
      if (shouldUpdate) {
        const spinner = ora('Updating to ' + latestVersion + '...').start();
        try {
          const { execSync } = await import('child_process');
          execSync('npm install -g gac-cli', { stdio: 'ignore' });
          spinner.succeed('Updated to ' + latestVersion + '! Please restart gac.');
          process.exit(0);
        } catch (err) {
          spinner.fail('Update failed. Run: npm install -g gac-cli');
        }
      }
    }
  }

  // ─── Check API key ────────────────────────────────────────────────────
  let apiKey = config.get('apiKey');
  if (!apiKey) {
    if (options.yes) {
      console.error(chalk.red('No API key. Run gac --key <key> or set GAC_API_KEY'));
      process.exit(1);
    }
    apiKey = await uiUtils.promptApiKey();
    config.set('apiKey', apiKey);
  }

  // ─── Check git repo ───────────────────────────────────────────────────
  if (!(await gitUtils.isRepo())) {
    console.error(chalk.red('Not a git repository.'));
    process.exit(1);
  }

  // ─── Handle stage ────────────────────────────────────────────────────
  let status = await gitUtils.getStatus();
  if (status.staged.length === 0) {
    const stageAll = await uiUtils.promptStageAll(options);
    if (stageAll) {
      const spinner = ora('Staging all changes...').start();
      await gitUtils.addAll();
      status = await gitUtils.getStatus();
      if (status.staged.length === 0) {
        spinner.fail('Nothing to commit after staging.');
        process.exit(0);
      }
      spinner.succeed('All changes staged.');
    } else {
      console.log(chalk.yellow('No changes to commit.'));
      process.exit(0);
    }
  }

  // ─── Sync: fetch and pull if behind (unless --no-sync) ───────────────
  if (options.sync !== false) {
    try {
      await gitUtils.fetch();
      status = await gitUtils.getStatus();
      if (status.behind > 0) {
        const action = await uiUtils.promptPull(status.behind, options);
        if (action === 'abort') process.exit(0);
        if (action === 'pull') {
          const spinner = ora('Pulling remote changes...').start();
          await gitUtils.pull();
          spinner.succeed('Pulled latest changes.');
        }
      }
    } catch (e) {
      if (options.verbose) console.log(chalk.gray('Sync skipped: ' + e.message));
    }
  }

  // ─── Pre-commit gates (unless --no-gate) ─────────────────────────────
  if (options.gate !== false) {
    const gates = await detectGates();
    if (gates.length > 0) {
      const repos = await gitUtils.getRepoRoot();
      const { results, passed } = await runAllGates(gates, repos);
      printGateResults(results);
      if (!passed && !options.yes) {
        const { force } = await inquirer.prompt([
          { type: 'confirm', name: 'force', message: 'Commit anyway?', default: false }
        ]);
        if (!force) {
          console.log(chalk.yellow('Commit aborted by gates.'));
          process.exit(1);
        }
      }
    }
  }

  // ─── Amend mode ──────────────────────────────────────────────────────
  if (options.amend) {
    const spinner = ora('Analyzing last commit...').start();
    const info = await gitUtils.getLastCommitInfo();
    spinner.text = 'Generating amended message...';
    try {
      const data = await aiUtils.generateMessage(info.diff, {
        model: options.model || config.get('model'),
        style: options.style || config.get('style'),
        verbose: options.verbose,
      });
      const formatted = uiUtils.formatCommitMessage(data, { noEmoji: options.emoji === false });
      spinner.stop();
      console.log(chalk.bold('\nAmended Message:\n') + formatted + '\n');
      await gitUtils.amendCommit(formatted);
      console.log(chalk.green('Last commit amended.'));
    } catch (err) {
      spinner.fail(err.message);
      process.exit(1);
    }
    return;
  }

  // ─── Generate commit message from staged diff ────────────────────────
  const spinner = ora('Analyzing staged changes...').start();
  let diff;
  try {
    diff = await gitUtils.getStagedDiff();
    if (!diff) {
      spinner.fail('No staged diff could be read.');
      process.exit(1);
    }
    spinner.text = 'Generating commit message with AI...';
    const data = await aiUtils.generateMessage(diff, {
      model: options.model || config.get('model'),
      style: options.style || config.get('style'),
      scope: options.scope || undefined,
      verbose: options.verbose,
    });
    spinner.stop();

    const formatted = uiUtils.formatCommitMessage(data, { noEmoji: options.emoji === false });

    // ─── Output handling ────────────────────────────────────────────────
    if (options.json) {
      console.log(JSON.stringify({ commitMessage: formatted, data }, null, 2));
      return;
    }

    // Print preview
    uiUtils.printCommitPreview(formatted, data);

    if (options.copy) {
      await clipboard.write(formatted);
      console.log(chalk.green('  ✓ Copied to clipboard'));
    }

    if (options.dryRun) {
      console.log(chalk.gray('  (dry-run — not committed)'));
      return;
    }

    // ─── Prompt loop: confirm/edit/regenerate/abort ─────────────────────
    let finalMessage = formatted;
    let action = options.yes ? 'confirm' : '';

    while (action !== 'confirm' && action !== 'abort') {
      if (!action) action = await uiUtils.promptCommitAction(finalMessage, options);
      if (action === 'edit') {
        finalMessage = await uiUtils.promptEditMessage(finalMessage);
        action = 'confirm';
      } else if (action === 'regenerate') {
        const spinner2 = ora('Regenerating message...').start();
        try {
          diff = await gitUtils.getStagedDiff();
          const data2 = await aiUtils.generateMessage(diff, {
            model: options.model || config.get('model'),
            style: options.style || config.get('style'),
            scope: options.scope || undefined,
            verbose: options.verbose,
          });
          finalMessage = uiUtils.formatCommitMessage(data2, { noEmoji: options.emoji === false });
          spinner2.stop();
          uiUtils.printCommitPreview(finalMessage, data2);
        } catch (err) {
          spinner2.fail(err.message);
        }
        action = '';
      } else if (action === 'abort') {
        console.log(chalk.yellow('Commit aborted.'));
        process.exit(0);
      }
    }

    // ─── Commit ─────────────────────────────────────────────────────────
    const commitSpinner = ora('Committing...').start();
    try {
      const output = await gitUtils.commit(finalMessage);
      commitSpinner.succeed('Committed');
      if (options.verbose) console.log(chalk.gray(output));

      // ─── Push prompt ──────────────────────────────────────────────────
      const branch = await gitUtils.getCurrentBranch();
      const pushAction = await uiUtils.promptPush(branch, options);
      if (pushAction === 'push') {
        const pushSpinner = ora('Pushing...').start();
        await gitUtils.push();
        pushSpinner.succeed('Pushed to origin/' + branch);
      }

      // ─── PR prompt ────────────────────────────────────────────────────
      const remoteUrl = await gitUtils.getRemoteUrl();
      const shouldPR = await uiUtils.promptCreatePR(remoteUrl, branch, options);
      if (shouldPR) {
        const { execSync } = await import('child_process');
        execSync('gh pr create --web', { stdio: 'inherit' });
      }
    } catch (err) {
      commitSpinner.fail('Commit failed: ' + err.message);
      process.exit(1);
    }
  } catch (err) {
    spinner.fail(err.message);
    process.exit(1);
  }
});

program.parse(process.argv);
