# gac (Git Auto Commit)

gac is an AI-powered CLI that automates Git commits by generating structured commit messages from repository changes and handling sync workflows.

[![npm version](https://img.shields.io/npm/v/gac-cli.svg)](https://www.npmjs.com/package/gac-cli)
[![npm downloads](https://img.shields.io/npm/dm/gac-cli.svg)](https://www.npmjs.com/package/gac-cli)
[![license](https://img.shields.io/npm/l/gac-cli.svg)](./LICENSE)

## Features

- **AI-Driven Message Generation**: Analyzes staged changes (diffs) to generate structured messages adhering to the Conventional Commits specification.
- **Remote Synchronization**: Automatically executes `git fetch` to detect remote updates and prompts for a `pull` operation when the local branch is behind, preventing merge conflicts.
- **Interactive Staging**: Automatically detects unstaged changes and prompts to stage all files when no changes are currently indexed.
- **Post-Commit Workflows**: Optional prompts for immediate `push` operations and Pull Request (PR) creation on GitHub for non-main branches.
- **Advanced Diff Filtering**: Automatically excludes lock files (e.g., `bun.lock`, `package-lock.json`) and system noise to optimize AI context and token efficiency.
- **Configurable Styles**: Supports multiple commit styles: `conventional`, `detailed`, `minimal`, `vibe`, and `verbose`.
- **Auto-Update**: Automatically checks for new versions and prompts to update via `bun`.
- **Extensibility**: Support for custom system prompts and repository-specific ignore rules via `.gacignore`.

## Installation

### Via npm

```bash
npm install -g gac-cli
```

### From Source

```bash
git clone https://github.com/ravvdevv/gac.git
cd gac
bun install
bun link
```

## Configuration

Initial setup requires an OpenRouter API key:

```bash
gac --key <YOUR_API_KEY>
```

To set the preferred AI model (Default: `openrouter/free`):

```bash
gac --model <MODEL_ID>
```

To view current configuration:

```bash
gac config
```

## Usage

### Basic Execution

Run `gac` in any Git repository to initiate the automated commit workflow:

```bash
gac
```

### Amending Commits

To regenerate the commit message for the most recent commit:

```bash
gac --amend
```

### Dry Run and Clipboard Integration

To generate a message without executing a commit:

```bash
gac --dry-run
```

To copy the generated message directly to the system clipboard:

```bash
gac --copy
```

### Command Options

| Option | Description |
| :--- | :--- |
| `--no-sync` | Disable remote update checks (offline mode). |
| `--no-verify` | Skip Git pre-commit hooks. |
| `--style <style>` | Override the default commit style (`conventional`, `vibe`, `minimal`, `detailed`, `verbose`). |
| `--verbose`, `-v` | Show detailed logs and raw AI interactions. |
| `--prompt <text\|path>` | Specify a custom system prompt or prompt file. |

### Hook Installation

To install a pre-commit hook that invokes `gac` automatically:

```bash
gac install-hook
```

## Project Configuration

### .gacignore

The `.gacignore` file in the repository root allows for excluding specific files from AI analysis using standard glob patterns.

### Model Selection

`gac` supports all OpenRouter-compatible models. Use `gac --model custom` to specify a custom model ID.

## License

This project is licensed under the Raven License. Refer to the [LICENSE](./LICENSE) file for complete terms.

---
Maintained by Raven
