# gac (Git Auto Commit)

gac is a high-performance command-line interface (CLI) tool designed for generating and automating Git commit messages using Artificial Intelligence. It leverages OpenRouter-compatible APIs to provide context-aware contributions adhering to the Conventional Commits specification.

## Features

- **Automated Message Generation**: Analyzes staged changes and generates structured commit messages.
- **Diff Filtering**: Automatically excludes lock files and noise from the analysis to improve accuracy and reduce token consumption.
- **Pre-Commit Hooks**: Integration with Git hooks for automated pre-commit validation.
- **Multiple Styles**: Support for various commit styles including conventional, detailed, and minimal.
- **Custom System Prompts**: High degree of configurability via system prompt overrides.
- **Dry Run & Clipboard**: Support for generating messages without committing and clipboard synchronization.
- **Secure Configuration**: Local management of API keys and model preferences.

## Installation

Recommended installation via npm:
                           
```bash
npm install -g gac-cli
```

Alternatively, to install from source:

```bash
git clone https://github.com/ravvdevv/gac.git
cd gac
bun install
bun link
```

## Setup

Set the OpenRouter API key:
```bash
gac --key <YOUR_API_KEY>
```

Set the preferred AI model (Default: arcee-ai/trinity-large-preview:free):
```bash
gac --model <MODEL_ID>
```

## Usage

### Basic Commit
Stage changes and execute gac:
```bash
git add .
gac
```

### Amending
To regenerate and amend the last commit message:
```bash
gac --amend
```

### Dry Run
To generate a message without initiating a commit:
```bash
gac --dry-run
```

### Clipboard Integration
To copy the generated message to the system clipboard:
```bash
gac --copy
```

### Git Hook Integration
Install the gac pre-commit hook:
```bash
gac install-hook
```

## Configuration

gac supports project-specific ignore rules via a `.gacignore` file in the repository root. This file follows standard ignore pattern syntax.

System prompts can be globally configured:
```bash
gac --prompt "Your custom instruction string"
```
Or via a local file:
```bash
gac --prompt path/to/prompt.txt
```

## License

This project is licensed under the Raven License. See the [LICENSE](./LICENSE) file for the full terms.

---
Maintained by Raven
