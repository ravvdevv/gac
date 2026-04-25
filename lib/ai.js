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
In the JSON "message" field, provide ONLY the subject line (e.g., "add login endpoint").
The CLI will handle the <type>(<scope>): prefix.
`,
  vibe: `
Follow the Conventional Commits specification but ADD a relevant Gitmoji emoji to the BEGINNING of the message.
In the JSON "message" field, provide the emoji followed by the subject (e.g., "✨ add login endpoint").
The CLI will handle the <type>(<scope>): prefix, resulting in: 🚀 <type>(<scope>): ✨ <message>
`,
  minimal: `
Keep it as short as possible.
In the JSON "message" field, provide a very brief subject.
`,
  detailed: `
Provide more context in the subject while staying concise.
`,
  verbose: `
Provide a detailed commit message.
In the JSON "message" field, provide the subject.
You may also include a "body" field in the JSON with detailed bullet points.
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
  const systemPrompt = `${BASE_SYSTEM_PROMPT}\n${selectedStylePrompt}${customSystemPrompt ? `\n\nCustom Instructions:\n${customSystemPrompt}` : ''}`;

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
