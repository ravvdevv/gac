import config from './config.js';
import chalk from 'chalk';

const BASE_SYSTEM_PROMPT = `
You are a senior developer's assistant. Your task is to generate a concise and descriptive Git commit message.
Respond ONLY with a JSON object in this format:
{
  "type": "feat",
  "version": "1.1.0",
  "message": "add login endpoint",
  "confidence": 0.95
}
`;

const STYLES = {
  conventional: `
Follow the Conventional Commits specification.
Format: <type>(<scope>): <message>
Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
Message: imperatives like "add feature" (not "added feature"), no trailing period.
`,
  vibe: `
Follow the Conventional Commits specification but ADD a relevant Gitmoji emoji to the BEGINNING of the message for "vibecode vibes".
Format: 🚀 <type>(<scope>): <message>
Example types: ✨ feat, 🐛 fix, 📝 docs, 💄 style, ♻️ refactor, ⚡️ perf, ✅ test, 👷 build, 💚 ci, 🔧 chore, ⏪ revert
`,
  minimal: `
Keep it as short as possible. No scope needed unless critical.
Format: <type>: <message>
`,
  detailed: `
Provide more context in the message subject while staying concise.
Format: <type>(<scope>): <message>
`,
  verbose: `
Provide a detailed commit message.
Format: 
<type>(<scope>): <message>

<body>
Message: imperatives like "add feature".
Body: Explain WHAT was changed and WHY, using bullet points if necessary.
`,
};

export async function generateMessage(diff, customOptions = {}) {
  const apiKey = config.get('apiKey');
  const model = customOptions.model || config.get('model');
  const style = customOptions.style || config.get('style') || 'conventional';
  const customSystemPrompt = customOptions.systemPrompt || config.get('systemPrompt');
  const maxRetries = 3;
  let attempt = 0;

  if (!apiKey) {
    throw new Error('API key not found. Run `gac --key <YOUR_KEY>` first.');
  }

  const selectedStylePrompt = STYLES[style] || STYLES.conventional;
  const systemPrompt = customSystemPrompt || `${BASE_SYSTEM_PROMPT}\n${selectedStylePrompt}`;

  // Basic truncation to avoid token limits
  const maxChars = 20000;
  const truncatedDiff = diff.length > maxChars ? diff.substring(0, maxChars) + '\n... (truncated)' : diff;

  while (attempt <= maxRetries) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

    try {
      if (customOptions.verbose) {
        console.log(chalk.gray(`\n--- VERBOSE: Request Body (Attempt ${attempt + 1}) ---`));
        console.log(JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Here is the git diff:\n\n${truncatedDiff}` },
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
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Here is the git diff:\n\n${truncatedDiff}` },
          ],
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const error = await response.json();
        const errorMessage = error.error?.message || response.statusText;
        
        // If it's a provider error or rate limit, retry
        if (attempt < maxRetries && (response.status === 429 || response.status >= 500 || errorMessage.includes('Provider returned error'))) {
          attempt++;
          const delay = Math.pow(2, attempt) * 1000;
          if (customOptions.onRetry) {
            customOptions.onRetry(attempt, maxRetries, delay);
          }
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
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
      
      try {
        return JSON.parse(content);
      } catch (e) {
        console.error(chalk.yellow('Warning: AI returned invalid JSON. Attempting to parse...'));
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
        throw new Error('Failed to parse AI response as JSON.');
      }
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
        throw new Error('Request timed out after multiple attempts.');
      }
      throw error;
    }
  }
}
