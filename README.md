# gac (Git Auto Commit)

gac is a CLI tool that uses AI to automatically generate Git commit messages from your changes and help manage basic Git workflows like staging, syncing, and pushing.

[![npm version](https://img.shields.io/npm/v/gac-cli.svg)](https://www.npmjs.com/package/gac-cli)
[![npm downloads](https://img.shields.io/npm/dm/gac-cli.svg)](https://www.npmjs.com/package/gac-cli)
[![license](https://img.shields.io/npm/l/gac-cli.svg)](./LICENSE)

## What it does

- Generates commit messages from your staged changes using AI
- Follows Conventional Commits style (or other formats you choose)
- Helps manage Git workflow (stage, pull, push prompts)
- Filters noise like lock files automatically
- Supports custom styles like `minimal`, `detailed`, `vibe`, and `verbose`

## Installation

### npm
```bash
npm install -g gac-cli
```

### bun
```bash
bun install -g gac-cli
```

### From source
```bash
git clone https://github.com/ravvdevv/gac.git
cd gac
bun install
bun link
```

## Setup

Set your API key:
```bash
gac --key <YOUR_API_KEY>
```

(Optional) Set model:
```bash
gac --model <MODEL_ID>
```

Check config:
```bash
gac config
```

## Usage

Run inside a Git repo:
```bash
gac
```

### Useful commands

- Generate commit only:
```bash
gac --dry-run
```

- Copy commit message:
```bash
gac --copy
```

- Amend last commit:
```bash
gac --amend
```

- Install Git hook:
```bash
gac install-hook
```

## Options

- `--key <apiKey>` → Set OpenRouter API Key
- `--model <model>` → Set AI Model
- `--style <style>` → Set Commit Style (conventional, vibe, minim   al, detailed, verbose)
- `--prompt <prompt>` → Set Custom System Prompt (text or path to file)
- `--verbose`, `-v` → Show detailed logs and raw AI interactions
- `--amend` → Amend last commit message with AI
- `--dry-run` → Generate message without committing
- `--copy` → Copy generated message to clipboard
- `--yes`, `-y` → Bypass all prompts (Headless mode for AI agents). 
- `--json` → Output results as machine-readable JSON. 
- `--no-sync` → Disable remote update checks (offline mode). 
- `--no-verify` → Skip Git pre-commit hooks. 
- `--style <style>` → Override the default commit style (`conventional`, `vibe`, `minimal`, `detailed`, `verbose`). 
- `--verbose`, `-v` → Show detailed logs and raw AI interactions. 
- `--prompt <text\|path>` → Specify a custom system prompt or prompt file. 

## Ignore files

Use `.gacignore` to exclude files from AI analysis.

## License

Raven License. See LICENSE file.

---

Maintained by Raven
