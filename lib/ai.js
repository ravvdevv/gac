import config from './config.js';
import chalk from 'chalk';

const BASE_SYSTEM_PROMPT = `
You are a senior developer's assistant. Your task is to generate a concise and descriptive Git commit message.
Respond ONLY with a JSON object in this format:
{
  "type": "feat",
  "scope": null,
  "message": "add login endpoint",
  "confidence": 0.95
}
Rules:
- "type" MUST be one of: feat, fix, docs, style, refactor, perf, test, chore, ci, build, revert
- "scope" is optional — a short slug like "auth", "api", "ui", "core". null if unclear.
- "message" is a short imperative description (lowercase, no period, present tense like "add", "fix", "update")
- Keep the message under 60 characters if possible
- "confidence" is 0.0-1.0
`;

const STYLES = {
  conventional: `
Follow the Conventional Commits specification.
In the JSON "message" field, provide ONLY the subject line (e.g., "add login endpoint").
The CLI will handle the <type>(<scope>): prefix.
`,
  vibe: `
Follow the Conventional Commits specification but ADD a relevant Gitmoji emoji to the BEGINNING of the message.
In the JSON "message" field, provide the emoji followed by the subject (e.g., "✨ add login endpoint").
The CLI will handle the <type>(<scope>): prefix, resulting in: <type>(<scope>): ✨ <message>
`,
  minimal: `
Keep it as short as possible.
In the JSON "message" field, provide a very brief subject (one or two words if possible).
`,
  detailed: `
Provide more context in the subject while staying concise.
In the JSON "message" field, provide a clear subject that captures the "why" not just the "what".
`,
  verbose: `
Provide a detailed commit message.
In the JSON "message" field, provide the subject.
You MUST also include a "body" field in the JSON with detailed bullet points (one change per line, prefixed with "- ").
`,
};

/**
 * Smart diff truncation that preserves whole-file diffs.
 * Instead of hard-cutting at N chars, it includes as many
 * complete file diffs as fit within the limit.
 */
export function truncateDiff(diff, maxChars = 30000) {
  if (diff.length <= maxChars) return diff;

  const blocks = diff.split(/(?=^diff --git )/m);
  let result = '';
  let included = 0;
  let skipped = 0;

  for (const block of blocks) {
    if ((result + block).length > maxChars) {
      skipped++;
      continue;
    }
    result += block;
    included++;
  }

  if (skipped > 0) {
    result += `\n... (${skipped} additional file${skipped > 1 ? 's' : ''} omitted due to size)`;
  }

  return result;
}

/**
 * Extract file-level stats from a diff for prompt enrichment.
 */
export function getDiffSummary(diff) {
  const fileHeaders = diff.match(/^diff --git .+$/gm) || [];
  const additions = (diff.match(/^\+[^+]/gm) || []).length;
  const deletions = (diff.match(/^-[^-]/gm) || []).length;

  const paths = fileHeaders
    .map(h => {
      const m = h.match(/diff --git a\/(.+) b\/(.+)/);
      return m ? m[1] : null;
    })
    .filter(Boolean);

  const uniquePaths = [...new Set(paths)];
  const displayPaths = uniquePaths.slice(0, 8);
  const remaining = uniquePaths.length - displayPaths.length;

  let pathStr = displayPaths.join(', ');
  if (remaining > 0) pathStr += ` +${remaining} more`;

  return {
    fileCount: uniquePaths.length,
    additions,
    deletions,
    files: pathStr || 'unknown',
  };
}

export async function generateMessage(diff, customOptions = {}) {
  const apiKey = config.get('apiKey');
  const model = customOptions.model || config.get('model');
  const fallbackModel = config.get('fallbackModel');
  const style = customOptions.style || config.get('style') || 'conventional';
  const customSystemPrompt = customOptions.systemPrompt || config.get('systemPrompt');
  const customScope = customOptions.scope || null;
  const maxRetries = 3;

  if (!apiKey) {
    throw new Error('API key not found. Run `gac --key <YOUR_KEY>` first.');
  }

  const selectedStylePrompt = STYLES[style] || STYLES.conventional;
  const systemPrompt = `${BASE_SYSTEM_PROMPT}\n${selectedStylePrompt}${customSystemPrompt ? `\n\nCustom Instructions:\n${customSystemPrompt}` : ''}`;

  const truncatedDiff = truncateDiff(diff);
  const summary = getDiffSummary(truncatedDiff);
  const userContent = `Changes: ${summary.fileCount} file${summary.fileCount !== 1 ? 's' : ''} modified, +${summary.additions} -${summary.deletions}
Files: ${summary.files}

${customScope ? `Use scope: "${customScope}"\n` : ''}
Git diff:
${truncatedDiff}`;

  /**
   * Try a single model with retries.
   * Returns the parsed response or throws.
   * Falls through to fallback model on rate limits/server errors.
   */
  async function tryModel(modelName, isFallback) {
    let attempt = 0;
    while (attempt < maxRetries) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      try {
        if (customOptions.verbose) {
          console.log(chalk.gray(`\n--- VERBOSE: Request Body (Attempt ${attempt + 1}, model: ${modelName}${isFallback ? ' [FALLBACK]' : ''}) ---`));
          console.log(JSON.stringify({
            model: modelName,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userContent },
            ],
          }, null, 2));
          console.log(chalk.gray('-----------------------------\n'));
        }

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://github.com/ravvdevv/gac',
            'X-Title': 'gac-cli',
          },
          body: JSON.stringify({
            model: modelName,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userContent },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.3,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          const errorMessage = error.error?.message || response.statusText;

          // Non-retryable errors — throw immediately
          if (errorMessage.includes('free-models-per-day')) {
            const friendlyError = new Error(
              `\n${chalk.yellow('! ')}${chalk.bold('Rate Limit Reached (OpenRouter Free Tier)')}\n` +
              `${chalk.gray('  You have exhausted your daily allowance of free AI requests.')}\n\n` +
              `${chalk.white('  To continue, you can add credits at: ')}${chalk.cyan('https://openrouter.ai/credits')}\n` +
              `${chalk.gray('  (Adding credits unlocks 1,000+ free model requests per day)')}`
            );
            friendlyError.isFriendly = true;
            throw friendlyError;
          }

          if (errorMessage.includes('Missing Authentication header') || errorMessage.includes('Invalid API Key') || response.status === 401) {
            const friendlyError = new Error(
              `\n${chalk.red('! ')}${chalk.bold('Authentication Failed')}\n` +
              `${chalk.gray(`  ${errorMessage}`)}\n\n` +
              `${chalk.white('  Please check your API key by running: ')}${chalk.cyan('gac --key <YOUR_KEY>')}\n` +
              `${chalk.gray('  (Get a new key at https://openrouter.ai/keys)')}`
            );
            friendlyError.isFriendly = true;
            throw friendlyError;
          }

          // Retryable errors — retry or fall through to fallback
          const isRetryable = response.status === 429 || response.status >= 500 || errorMessage.includes('Provider returned error');
          if (isRetryable) {
            if (attempt < maxRetries) {
              attempt++;
              const delay = Math.pow(2, attempt) * 1000;
              if (customOptions.onRetry) {
                customOptions.onRetry(attempt, maxRetries, delay);
              }
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            }
            // Exhausted retries — signal to try fallback
            return { exhausted: true, error: errorMessage };
          }

          throw new Error(`OpenRouter API error: ${errorMessage}`);
        }

        const data = await response.json();

        if (customOptions.verbose) {
          console.log(chalk.gray('\n--- VERBOSE: Raw Response ---'));
          console.log(JSON.stringify(data, null, 2));
          console.log(chalk.gray('-----------------------------\n'));
        }

        const content = data.choices[0].message.content;

        let parsed;
        try {
          parsed = JSON.parse(content);
        } catch (e) {
          console.error(chalk.yellow('Warning: AI returned invalid JSON. Attempting to parse...'));
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('Failed to parse AI response as JSON.');
          }
        }

        return { success: true, data: parsed };
      } catch (error) {
        clearTimeout(timeout);

        if (error.name === 'AbortError' || error.message.includes('timeout')) {
          if (attempt < maxRetries) {
            attempt++;
            const delay = Math.pow(2, attempt) * 1000;
            if (customOptions.onRetry) {
              customOptions.onRetry(attempt, maxRetries, delay);
            }
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          return { exhausted: true, error: 'timeout' };
        }
        // Non-retryable errors bubble up
        throw error;
      }
    }
    return { exhausted: true, error: 'max attempts exceeded' };
  }

  // Try primary model
  let result = await tryModel(model, false);

  // If primary exhausted retries and we have a fallback, try it
  if (result.exhausted && fallbackModel && fallbackModel !== model) {
    console.log(chalk.yellow(`  Primary model failed (${result.error}). Trying fallback: ${fallbackModel}...`));
    result = await tryModel(fallbackModel, true);
  }

  // If still exhausted after fallback, give up
  if (result.exhausted) {
    throw new Error(`All models failed. Last error: ${result.error}`);
  }

  // Sanitize the response
  const parsed = result.data;
  const validTypes = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'chore', 'ci', 'build', 'revert'];
  if (!parsed.type || !validTypes.includes(parsed.type)) {
    parsed.type = 'chore';
  }

  if (customScope) {
    parsed.scope = customScope;
  }

  if (!parsed.message) {
    parsed.message = 'update code';
  }

  parsed.message = parsed.message.trim();

  if (parsed.message.length > 72) {
    console.log(chalk.yellow(`  ⚠ Commit subject is ${parsed.message.length} chars (recommended: ≤72)`));
  }

  return parsed;
}
