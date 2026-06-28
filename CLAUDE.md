# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is gac?

Git Auto Commit — CLI that generates conventional commit messages from staged diffs via OpenRouter AI (free tier by default). Handles the full git workflow: stage, pull, commit, push, PR prompt.

## Key Commands

```sh
bun test              # run all tests (node:test, no framework)
bun run bin/gac.js    # run the CLI locally
node --test tests/*.test.js  # same as npm test
```

Test with node:test — no framework needed. Single file: `node --test tests/unit.test.js`.

## Architecture

- **`bin/gac.js`** — CLI entrypoint. Uses `commander` for CLI parsing. Defines commands (`config`, `install-hook`, `validate`, `undo`, `gates`) and the default action (commit flow).
- **`lib/config.js`** — Config store via `conf`, proxied with env var overrides (`GAC_API_KEY`, `GAC_MODEL`, `GAC_FALLBACK_MODEL`).
- **`lib/ai.js`** — AI integration. Calls OpenRouter API (`openrouter.ai/api/v1/chat/completions`). Contains system prompts per style, smart diff truncation (file-boundary-aware), retry logic, fallback model support.
- **`lib/git.js`** — Git operations via `simple-git`. Staged diff, commit, amend, undo, pull, push, branch info, `.gacignore` filtering (glob patterns via minimatch).
- **`lib/ui.js`** — Interactive prompts via `inquirer`, commit message formatting, validation (Conventional Commits regex), emoji stripping, AI discovery file generation.
- **`lib/update.js`** — npm registry version check for self-update.
- **`lib/gate.js`** — Pre-commit gate system. Auto-detects project type (JS/Go/Python), runs lint/typecheck/test before committing.
- **`tests/unit.test.js`** — Tests for `truncateDiff`, `getDiffSummary`, `formatCommitMessage`, `validateCommitMessage`, `stripEmojis`.

## Data Flow (default commit)

1. Parse CLI args via `commander` (including subcommands)
2. Check git repo + staged changes exist
3. Pull if behind remote (prompted)
4. Detect & run gates (lint/test/typecheck) — `--no-gate` to skip
5. Fetch staged diff → truncate if large → send to OpenRouter API
6. Parse JSON response → format message → prompt user (confirm/edit/regenerate)
7. Commit → optional push → optional PR creation prompt

## Key Details

- Config stored via `conf` (OS config dir) — not in-repo. Env vars override: `GAC_API_KEY`, `GAC_MODEL`, `GAC_FALLBACK_MODEL`.
- OpenRouter is the only AI provider. API key set via `gac --key` or `GAC_API_KEY` env.
- `.gacignore` at repo root filters files from AI analysis (glob patterns, same syntax as `.gitignore`).
- Emoji stripping works via Unicode range regex — no deps needed.
- Commit message validation: checks Conventional Commits format, length ≤72, no trailing period, lowercase after colon.
- `--yes` / `-y` flag enables headless mode (no prompts, for CI/agents).
- Style options: `conventional`, `vibe` (gitmoji), `minimal`, `detailed`, `verbose`.
