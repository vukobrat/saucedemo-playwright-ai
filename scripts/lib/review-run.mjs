// The locator review of a pull request as one prompt and one command line. scripts/agent-review.mjs
// runs it in the AI review workflow, and the review eval (scripts/eval/run-review-eval.mjs) runs it
// too, so the eval measures exactly what CI runs.
import { agentInstructions } from './claude-headless.mjs';

// The agent's own model: a mechanical rule check does not need a larger one.
export const REVIEW_MODEL = 'claude-haiku-5-5';
export const REVIEW_SCHEMA = 'scripts/schemas/locator-review.schema.json';

/**
 * @param {string} pr The pull request number.
 * @param {string[]} files The page objects and components the pull request changes.
 */
export function reviewPrompt(pr, files) {
  return [
    `Review these files, changed in pull request #${pr}, against .claude/rules/pages.md:`,
    `${files.join(', ')}.`,
    'Report only problems in these files, each with its line, and return the review in the',
    'required shape.',
  ].join(' ');
}

/**
 * CLI flags for a review: the locator-reviewer agent's instructions and read-only tools, with no
 * project settings and no MCP servers.
 * @param {object} [options]
 * @param {string} [options.model]
 */
export function reviewArgs({ model = REVIEW_MODEL } = {}) {
  return [
    ['--append-system-prompt', agentInstructions('locator-reviewer')],
    ['--model', model],
    // Ignore the checkout's own .claude/settings.json: a pull request must not be able to add a
    // hook that runs on this runner.
    ['--setting-sources', 'user'],
    ['--tools', 'Read,Grep,Glob'],
    ['--strict-mcp-config'],
    ['--permission-mode', 'dontAsk'],
    ['--max-turns', '15'],
    ['--max-budget-usd', '1'],
  ].flat();
}
