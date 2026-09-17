/**
 * AETHER AI — Agent Prompts
 * Prompt templates for agentic reasoning (multi-step planning).
 * Full agent implementation is Part 2.
 * These prompts are defined here for use by the prompt engine.
 */

// ─── Agent System Prompt ──────────────────────────────────────────────────────

export const AGENT_BASE_SYSTEM_PROMPT =
  `You are an autonomous AI agent. Your task is to complete the user's request step by step.

Guidelines:
- Break the task into clear, executable steps.
- Execute steps in sequence.
- Report your progress at each step.
- If a step fails, explain why and adapt your plan.
- Do not make assumptions about capabilities — only use available tools.
- When the task is complete, provide a clear summary of what was accomplished.` as const;

// ─── Task Planning Prompt ────────────────────────────────────────────────────

export function buildTaskPlanningPrompt(task: string, availableTools: readonly string[]): string {
  const toolList =
    availableTools.length > 0
      ? availableTools.map((t) => `- ${t}`).join('\n')
      : '- No tools available';

  return [
    `Task: ${task}`,
    '',
    'Available tools:',
    toolList,
    '',
    'Create a step-by-step plan to complete this task. ' +
      'For each step, specify: what to do, which tool to use (if any), and expected output.',
    '',
    'Respond in this format:',
    'STEP 1: [Description]',
    'TOOL: [tool_name or "none"]',
    'EXPECTED: [Expected output]',
    '',
    'Continue for all steps.',
  ].join('\n');
}

// ─── Step Execution Prompt ────────────────────────────────────────────────────

export function buildStepExecutionPrompt(
  step: string,
  stepIndex: number,
  totalSteps: number,
  previousResults: readonly string[],
): string {
  const context =
    previousResults.length > 0
      ? `Previous results:\n${previousResults.map((r, i) => `Step ${i + 1}: ${r}`).join('\n')}\n\n`
      : '';

  return [
    context,
    `Executing step ${stepIndex + 1} of ${totalSteps}:`,
    step,
    '',
    'Based on the task and previous results, execute this step and provide the result.',
  ].join('\n');
}

// ─── Agent Completion Prompt ──────────────────────────────────────────────────

export function buildAgentCompletionPrompt(
  originalTask: string,
  stepResults: readonly string[],
): string {
  const resultsBlock = stepResults.map((result, i) => `Step ${i + 1}: ${result}`).join('\n');

  return [
    `Original task: ${originalTask}`,
    '',
    'Completed steps:',
    resultsBlock,
    '',
    'Provide a concise final summary of what was accomplished.',
  ].join('\n');
}
