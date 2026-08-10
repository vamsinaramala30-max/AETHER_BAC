/**
 * AETHER AI — Reasoning Prompts
 * Prompt templates for chain-of-thought reasoning.
 * Private reasoning is NEVER exposed to the user.
 * Only public status values are exposed.
 */

import type { ReasoningStatus } from '../ai-types.js';
import { REASONING } from '../ai-constants.js';

// ─── Reasoning Status Labels ──────────────────────────────────────────────────

export const REASONING_STATUS_LABELS: Record<ReasoningStatus, string> = {
  thinking: 'Thinking...',
  retrieving: 'Retrieving relevant information...',
  generating: 'Generating response...',
  planning: 'Planning...',
  completed: 'Done',
  failed: 'Processing failed',
} as const;

// ─── Step-by-Step Instruction ─────────────────────────────────────────────────

export const CHAIN_OF_THOUGHT_INSTRUCTION = `
Think step by step before answering. 
Consider the question carefully, examine available information, and provide a well-reasoned response.
Do not expose your internal reasoning process — only provide the final, well-considered answer.` as const;

// ─── Intent Classification Prompt ─────────────────────────────────────────────

export function buildIntentClassificationPrompt(userMessage: string): string {
  return [
    'Classify the following user message into ONE of these intent categories:',
    '',
    '- NORMAL_RESPONSE: A conversational message, general question, or task that can be answered directly.',
    '- RAG_REQUIRED: The message requires searching documents or a knowledge base.',
    '- MEMORY_REQUIRED: The message references previous conversations, user preferences, or past interactions.',
    '- TOOL_REQUIRED: The message requires executing a tool, calculation, real-time data, or external action.',
    '- AGENT_REQUIRED: The message requires multi-step planning, complex workflows, or autonomous task execution.',
    '',
    `User message: "${userMessage}"`,
    '',
    'Respond with ONLY the category name and a confidence score (0.0-1.0) in this exact format:',
    'CATEGORY: <intent>',
    'CONFIDENCE: <score>',
  ].join('\n');
}

// ─── Status Guard ─────────────────────────────────────────────────────────────

export function isSafeReasoningStatus(status: string): status is ReasoningStatus {
  return (REASONING.SAFE_PUBLIC_STATUSES as readonly string[]).includes(status);
}
