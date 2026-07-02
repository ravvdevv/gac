# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is gac?

Git Auto Commit — CLI that generates conventional commit messages from staged diffs via OpenRouter AI (free tier by default). Handles full git workflow: interactive file selection, stage, pull, commit, push, PR prompt.

## Key Commands

```sh
node --test tests/*.test.js    # run all tests (node:test, no framework)
node --test tests/unit.test.js # single test file
node --test --test-name-pattern "truncateDiff" tests/unit.test.js  # single test
bun run bin/gac.js             # run CLI locally
```

## Architecture

### File layout

- **`bin/gac.js`** — CLI entrypoint. `commander` for CLI parsing. Subcommands: `config`, `install-hook`, `validate`, `undo`, `gates`. Default action: the commit flow (interactive file selection → AI message → confirm/edit/regenerate/change/abort → commit → push → PR prompt).
- **`lib/config.js`** — Config via `conf` (OS config dir). Proxied with env var overrides: `GAC_API_KEY`, `GAC_MODEL`, `GAC_FALLBACK_MODEL`.
- **`lib/ai.js`** — OpenRouter API integration (`openrouter.ai/api/v1/chat/completions`). System prompts per style, file-boundary-aware diff truncation, retry logic (3 attempts), fallback model support, friendly error messages for rate limits and auth failures.
- **`lib/git.js`** — Git operations via `simple-git`. Staged diff, commit (via temp file to avoid shell escaping), amend, undo, pull, push, branch info, `.gacignore` filtering (glob patterns via minimatch).
- **`lib/ui.js`** — Interactive prompts via `inquirer`. File selection checkbox with git-porcelain status badges (`M`, `A`, `D`, `??`, `R`), grouped by status. Commit message formatting, validation (Conventional Commits regex), emoji stripping (Unicode range regex), AI discovery file generation.
- **`lib/update.js`** — npm registry version check (`registry.npmjs.org/gac-cli/latest`) for self-update.
- **`lib/gate.js`** — Pre-commit gate system. Auto-detects project type (JS/Go/Python by checking `package.json`, `pyproject.toml`, `go.mod`). Runs lint/typecheck/test sequentially. JS uses `bun run` or `npm run` depending on lockfile presence.
- **`tests/unit.test.js`** — Tests for `truncateDiff`, `getDiffSummary`, `formatCommitMessage`, `validateCommitMessage`, `stripEmojis`.

### Data Flow (interactive commit)

1. Parse CLI args via `commander`
2. Check API key in config or env
3. Check git repo
4. Sync: fetch + pull if behind remote (prompted)
5. Detect & run gates (lint/typecheck/test) — `--no-gate` to skip
6. **Interactive file selection**: shows checkbox prompt with status badges, groups by Modified/New/Renamed/Deleted
7. Unstage all → stage selected files only (saves original staged state for restore)
8. Fetch staged diff → truncate at file boundaries → send to OpenRouter API
9. Parse JSON response → format message → prompt user (confirm/edit/regenerate/change files/abort)
10. **Abort/Change restores** original staged state (previously broken — files stayed staged)
11. Commit → optional push → optional PR creation prompt

### Key Technical Details

- **Config**: `conf` package stores in OS config dir (not in-repo). Env vars override: `GAC_API_KEY`, `GAC_MODEL`, `GAC_FALLBACK_MODEL`.
- **OpenRouter** is the only AI provider. API key set via `gac --key` or `GAC_API_KEY` env.
- **`.gacignore`** at repo root filters files from AI analysis (glob patterns via minimatch, same syntax as `.gitignore`). Default ignores include `package-lock.json`, `yarn.lock`, `bun.lock`, etc.
- **Commit message validation**: checks Conventional Commits format (`/^(feat|fix|docs|style|refactor|perf|test|chore|ci|build|revert)(\([a-z0-9-]+\))?!?: .+/`), subject ≤72 chars, no trailing period, lowercase after colon.
- **Style options**: `conventional`, `vibe` (gitmoji), `minimal`, `detailed`, `verbose`.
- **Diff truncation**: splits on `diff --git` headers, includes full files. Never cuts mid-file. Adds `... (N files omitted)` note if truncated.
- **Abort restore**: saves `originalStaged` from `git.status().staged` before `unstageAll()`, restores on abort or file re-selection.
- **`open` package** (v11) in dependencies is unused — dead weight. Remove if cleaning up.
- **Emoji stripping regex**: `/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]+/gu`
- **Self-update**: checks `registry.npmjs.org/gac-cli/latest`. On Windows, `npm install -g gac-cli@<version>` installs to a different location than `import.meta.url` resolves, so post-update version verification can fail even though update succeeded.
- **Package manager**: `bun` preferred (lockfile: `bun.lock`). Falls back to `npm` (`package-lock.json`). Pure JS — no build step needed.

### Commit message formatting

```js
{ type: 'feat', scope: 'auth', message: 'add login', body: '- Adds OAuth2 flow' }
→ "feat(auth): add login\n\n- Adds OAuth2 flow"
```

- Strips double-prefixing if AI already includes `type(scope):` in message
- Hard truncates subject at 100 chars with `...`
- Wraps body lines >100 chars at word boundaries
- Emoji stripping applied before formatting if `--no-emoji`
