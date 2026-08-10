/**
 * AETHER AI — Constants
 * Immutable constants used across the AI module.
 */

// ─── Version ──────────────────────────────────────────────────────────────────

export const AETHER_AI_VERSION = '1.0.0' as const;
export const AETHER_AI_MODULE = 'aether-ai' as const;

// ─── Token Limits ─────────────────────────────────────────────────────────────

export const TOKEN_LIMITS = {
  MIN_CONTEXT: 512,
  DEFAULT_CONTEXT: 8_192,
  MAX_CONTEXT: 131_072,
  SYSTEM_BUDGET_RATIO: 0.1,
  HISTORY_BUDGET_RATIO: 0.3,
  RAG_BUDGET_RATIO: 0.35,
  RESPONSE_BUDGET_RATIO: 0.25,
  CHARS_PER_TOKEN_ESTIMATE: 4,
} as const;

// ─── Chunking ─────────────────────────────────────────────────────────────────

export const CHUNKING = {
  DEFAULT_CHUNK_SIZE: 512,
  DEFAULT_CHUNK_OVERLAP: 64,
  MIN_CHUNK_SIZE: 64,
  MAX_CHUNK_SIZE: 2048,
  SENTENCE_SEPARATOR: /(?<=[.!?])\s+/,
  PARAGRAPH_SEPARATOR: /\n\n+/,
} as const;

// ─── Retrieval ────────────────────────────────────────────────────────────────

export const RETRIEVAL = {
  DEFAULT_TOP_K: 5,
  MAX_TOP_K: 20,
  DEFAULT_SCORE_THRESHOLD: 0.5,
  HYBRID_ALPHA_DEFAULT: 0.5,
  MAX_CONTEXT_DOCS: 10,
} as const;

// ─── Memory ───────────────────────────────────────────────────────────────────

export const MEMORY = {
  DEFAULT_WINDOW_SIZE: 20,
  MAX_WINDOW_SIZE: 100,
  WORKING_MEMORY_TTL_MS: 3_600_000,
  LONG_TERM_MAX_ITEMS: 10_000,
  IMPORTANCE_DECAY_RATE: 0.01,
  MIN_IMPORTANCE_SCORE: 0.1,
  MAX_IMPORTANCE_SCORE: 1.0,
  SUMMARIZATION_THRESHOLD: 30,
} as const;

// ─── Safety ───────────────────────────────────────────────────────────────────

export const SAFETY = {
  MAX_INPUT_LENGTH: 32_768,
  MAX_OUTPUT_LENGTH: 32_768,
  PROMPT_INJECTION_PATTERNS: [
    /ignore previous instructions/i,
    /ignore all prior instructions/i,
    /you are now/i,
    /forget everything/i,
    /system prompt/i,
    /\[INST\]/,
    /<\|im_start\|>/,
  ] as readonly RegExp[],
} as const;

// ─── Timeouts ─────────────────────────────────────────────────────────────────

export const TIMEOUTS = {
  DEFAULT_GENERATION_MS: 120_000,
  DEFAULT_EMBEDDING_MS: 30_000,
  DEFAULT_RETRIEVAL_MS: 10_000,
  DEFAULT_MEMORY_OP_MS: 5_000,
  MODEL_HEALTH_CHECK_MS: 5_000,
  STREAM_HEARTBEAT_MS: 15_000,
} as const;

// ─── Streaming ────────────────────────────────────────────────────────────────

export const STREAMING = {
  MAX_CHUNK_SIZE: 256,
  MIN_CHUNK_DELAY_MS: 0,
  HEARTBEAT_INTERVAL_MS: 15_000,
} as const;

// ─── Intent Classification ────────────────────────────────────────────────────

export const INTENT = {
  MIN_CONFIDENCE: 0.0,
  MAX_CONFIDENCE: 1.0,
  DEFAULT_CONFIDENCE: 0.5,
  RAG_KEYWORDS: [
    'document',
    'file',
    'search',
    'find',
    'look up',
    'retrieve',
    'according to',
    'based on',
    'from the',
    'in the document',
    'knowledge base',
  ] as readonly string[],
  MEMORY_KEYWORDS: [
    'remember',
    'recall',
    'i told you',
    'previously',
    'last time',
    'as we discussed',
    'you said',
    'earlier',
    'before',
    'do you remember',
  ] as readonly string[],
  TOOL_KEYWORDS: [
    'calculate',
    'compute',
    'what is',
    'run',
    'execute',
    'fetch',
    'get',
    'current',
    'today',
    'now',
    'weather',
    'time',
  ] as readonly string[],
  AGENT_KEYWORDS: [
    'plan',
    'multi-step',
    'sequence',
    'workflow',
    'task',
    'complete the following',
    'do all of',
    'steps',
    'automate',
  ] as readonly string[],
} as const;

// ─── Reasoning ────────────────────────────────────────────────────────────────

export const REASONING = {
  SAFE_PUBLIC_STATUSES: [
    'thinking',
    'retrieving',
    'generating',
    'planning',
    'completed',
    'failed',
  ] as const,
} as const;

// ─── Embedding ────────────────────────────────────────────────────────────────

export const EMBEDDING = {
  DEFAULT_DIMENSIONS: 768,
  SIMILARITY_METRIC: 'cosine' as const,
  CACHE_TTL_MS: 3_600_000,
  BATCH_SIZE: 32,
} as const;
