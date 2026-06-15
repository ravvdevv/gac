import { describe, it } from 'node:test';
import assert from 'node:assert';

import { truncateDiff, getDiffSummary } from '../lib/ai.js';
import { formatCommitMessage, validateCommitMessage, stripEmojis } from '../lib/ui.js';

// ─── truncateDiff ────────────────────────────────────────────────────────────

describe('truncateDiff', () => {
  it('returns short diffs unchanged', () => {
    const diff = 'diff --git a/file.js b/file.js\n+hello\n-world';
    assert.strictEqual(truncateDiff(diff), diff);
  });

  it('truncates at file boundaries, not mid-file', () => {
    const file1 = 'diff --git a/file1.js b/file1.js\n+' + 'x'.repeat(100) + '\n';
    const file2 = 'diff --git a/file2.js b/file2.js\n+' + 'y'.repeat(100) + '\n';
    const file3 = 'diff --git a/file3.js b/file3.js\n+' + 'z'.repeat(100) + '\n';
    const diff = file1 + file2 + file3;

    // With 300 char limit, should include file1+file2 but not file3
    const result = truncateDiff(diff, 350);
    assert.ok(result.includes('file1.js'));
    assert.ok(result.includes('file2.js'));
    assert.ok(!result.includes('file3.js'));
    assert.ok(result.includes('omitted'));
  });

  it('includes all files when under limit', () => {
    const diff = 'diff --git a/a.js b/a.js\n+xx\n-yy\ndiff --git a/b.js b/b.js\n+aa\n-bb\n';
    const result = truncateDiff(diff, 50000);
    assert.ok(result.includes('a.js'));
    assert.ok(result.includes('b.js'));
    assert.ok(!result.includes('omitted'));
  });
});

// ─── getDiffSummary ──────────────────────────────────────────────────────────

describe('getDiffSummary', () => {
  it('extracts file count, additions, deletions, and paths', () => {
    const diff = `diff --git a/src/auth/login.js b/src/auth/login.js
+const x = 1;
+const y = 2;
-const z = 3;
diff --git a/src/api/routes.js b/src/api/routes.js
+router.get('/test');
-router.get('/old');
`;
    const summary = getDiffSummary(diff);
    assert.strictEqual(summary.fileCount, 2);
    assert.strictEqual(summary.additions, 3);
    assert.strictEqual(summary.deletions, 2);
    assert.ok(summary.files.includes('src/auth/login.js'));
    assert.ok(summary.files.includes('src/api/routes.js'));
  });

  it('handles empty diff', () => {
    const summary = getDiffSummary('');
    assert.strictEqual(summary.fileCount, 0);
    assert.strictEqual(summary.additions, 0);
    assert.strictEqual(summary.deletions, 0);
  });

  it('limits displayed file paths to 8', () => {
    let diff = '';
    for (let i = 0; i < 12; i++) {
      diff += `diff --git a/src/file${i}.js b/src/file${i}.js\n+line\n`;
    }
    const summary = getDiffSummary(diff);
    assert.strictEqual(summary.fileCount, 12);
    assert.ok(summary.files.includes('+4 more'));
  });
});

// ─── formatCommitMessage ─────────────────────────────────────────────────────

describe('formatCommitMessage', () => {
  it('formats a basic feat commit', () => {
    const data = { type: 'feat', message: 'add login endpoint' };
    assert.strictEqual(formatCommitMessage(data), 'feat: add login endpoint');
  });

  it('formats with scope', () => {
    const data = { type: 'fix', scope: 'auth', message: 'resolve token expiry' };
    assert.strictEqual(formatCommitMessage(data), 'fix(auth): resolve token expiry');
  });

  it('strips double-prefixing from AI response', () => {
    const data = { type: 'feat', message: 'feat: add login endpoint' };
    assert.strictEqual(formatCommitMessage(data), 'feat: add login endpoint');
  });

  it('includes body for verbose style', () => {
    const data = { type: 'feat', message: 'add auth', body: '- Add login\n- Add logout' };
    const result = formatCommitMessage(data);
    assert.ok(result.includes('feat: add auth'));
    assert.ok(result.includes('Add login'));
    assert.ok(result.includes('Add logout'));
  });

  it('strips emojis when noEmoji is true', () => {
    const data = { type: 'feat', message: '✨ add login endpoint' };
    const result = formatCommitMessage(data, { noEmoji: true });
    assert.ok(!result.includes('✨'));
    assert.strictEqual(result, 'feat: add login endpoint');
  });

  it('defaults type to chore when missing', () => {
    const data = { message: 'update deps' };
    assert.strictEqual(formatCommitMessage(data), 'chore: update deps');
  });

  it('defaults message to "unknown change" when missing', () => {
    const data = { type: 'fix' };
    assert.strictEqual(formatCommitMessage(data), 'fix: unknown change');
  });

  it('trims whitespace from message', () => {
    const data = { type: 'feat', message: '  add login  ' };
    assert.strictEqual(formatCommitMessage(data), 'feat: add login');
  });
});

// ─── validateCommitMessage ───────────────────────────────────────────────────

describe('validateCommitMessage', () => {
  it('validates a correct conventional commit', () => {
    const result = validateCommitMessage('feat(auth): add login');
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.warnings.length, 0);
  });

  it('rejects non-conventional format', () => {
    const result = validateCommitMessage('added login stuff');
    assert.strictEqual(result.valid, false);
    assert.ok(result.warnings.length > 0);
  });

  it('warns on long subject line', () => {
    const result = validateCommitMessage('feat: ' + 'a'.repeat(80));
    assert.ok(result.warnings.some(w => w.includes('72')));
  });

  it('warns on trailing period', () => {
    const result = validateCommitMessage('feat: add login.');
    assert.ok(result.warnings.some(w => w.includes('period')));
  });

  it('warns on uppercase after colon', () => {
    const result = validateCommitMessage('feat: Add login');
    assert.ok(result.warnings.some(w => w.includes('lowercase')));
  });
});

// ─── stripEmojis ─────────────────────────────────────────────────────────────

describe('stripEmojis', () => {
  it('removes emoji characters', () => {
    assert.strictEqual(stripEmojis('✨ add login'), 'add login');
    assert.strictEqual(stripEmojis('🐛 fix bug'), 'fix bug');
    assert.strictEqual(stripEmojis('📚 update docs'), 'update docs');
  });

  it('keeps non-emoji text unchanged', () => {
    assert.strictEqual(stripEmojis('feat: add login'), 'feat: add login');
  });

  it('handles empty string', () => {
    assert.strictEqual(stripEmojis(''), '');
  });
});
