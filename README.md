# gac (Git Auto Commit)

gac is a CLI tool that uses AI to automatically generate Git commit messages from your changes and help manage basic Git workflows like staging, syncing, and pushing.

[![npm version](https://img.shields.io/npm/v/gac-cli)](https://www.npmjs.com/package/gac-cli)
[![npm downloads](https://img.shields.io/npm/dm/gac-cli)](https://www.npmjs.com/package/gac-cli)
[![license](https://img.shields.io/badge/license-Raven-blue)](LICENSE)

## What it does

- Generates commit messages from your staged changes using AI
- Follows Conventional Commits style (or other formats you choose)
- Helps manage Git workflow (stage, pull, push, PR prompts)
- Filters noise like lock files automatically
- Supports custom styles like `minimal`, `detailed`, `vibe`, and `verbose`
- Smart diff truncation that preserves file boundaries
- Validates commit messages against Conventional Commits spec

## Installation

### npm
```sh
npm install -g gac-cli
```

### bun
```sh
bun install -g gac-cli
```

### From source
```sh
git clone https://github.com/ravvdevv/gac.git
cd gac
bun install
bun link
```

## Setup

Set your API key:
```sh
gac --key <YOUR_API_KEY>
```

(Optional) Set model:
```sh
gac --model <MODEL_ID>
```

Check config:
```sh
gac config
```

## Usage

Run inside a Git repo:
```sh
gac
```

### Useful commands

| Command | Description |
|---------|-------------|
| `gac --dry-run` | Generate message without committing |
| `gac --dry-run --json` | Generate message, output as JSON |
| `gac --copy` | Copy generated message to clipboard |
| `gac --amend` | Amend last commit message with AI |
| `gac --yes` | Bypass all prompts (headless mode for CI/agents) |
| `gac --scope auth` | Override commit scope (e.g., `auth`, `api`, `ui`) |
| `gac --no-emoji` | Strip emojis from generated messages |
| `gac --no-sync` | Skip remote update checks (offline mode) |
| `gac --no-verify` | Skip Git pre-commit hooks |
| `gac config` | Show current configuration |
| `gac install-hook` | Install pre-commit hook |
| `gac validate "feat: test"` | Validate a commit message |

### Examples

**Dry run with scope override:**
```sh
gac --dry-run --scope auth
```

**Headless mode for CI:**
```sh
gac --yes --no-sync
```

**Validate a message:**
```sh
gac validate "feat(auth): add login endpoint"
```

## Options

| Option | Description |
|--------|-------------|
| `--key <apiKey>` | Set OpenRouter API Key |
| `--model <model>` | Set AI Model |
| `--style <style>` | Set Commit Style (`conventional`, `vibe`, `minimal`, `detailed`, `verbose`) |
| `--scope <scope>` | Override commit scope (e.g., `auth`, `api`, `ui`) |
| `--prompt <prompt>` | Set Custom System Prompt (text or path to file) |
| `--verbose`, `-v` | Show detailed logs and raw AI interactions |
| `--amend` | Amend last commit message with AI |
| `--dry-run` | Generate message without committing |
| `--copy` | Copy generated message to clipboard |
| `--yes`, `-y` | Bypass all prompts (headless mode) |
| `--json` | Output results as machine-readable JSON |
| `--no-sync` | Disable remote update checks (offline mode) |
| `--no-verify` | Skip Git pre-commit hooks |
| `--no-emoji` | Strip emojis from generated messages |
| `--fallback-model <model>` | Set fallback AI model (used when primary model fails) |

## Commit Styles

| Style | Description |
|-------|-------------|
| `conventional` | Standard Conventional Commits format |
| `vibe` | Adds Gitmoji emoji to messages |
| `minimal` | As short as possible |
| `detailed` | More context in subject |
| `verbose` | Includes detailed body with bullet points |

## Ignore files

Use `.gacignore` to exclude files from AI analysis. Supports glob patterns:

```
# Lock files
*.lock
package-lock.json

# Build output
dist/
build/

# Generated files
*.generated.js
src/generated/

# Specific files
README.md
```

## AI Discovery

On first run, gac can create AI discovery files (`.agent`, `.cursorrules`, `.windsurfrules`, `.aiannotations`) that tell AI coding agents to use `gac` instead of raw `git commit`.

## License

Raven License. See LICENSE file.

---

Maintained by [Raven](https://github.com/ravvdevv)
