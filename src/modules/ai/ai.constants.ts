export const AI_CONSTANTS = {
  EVENTS: {
    STREAM_START: 'stream.start',
    STREAM_CHUNK: 'stream.chunk',
    STREAM_TOOL_CALL: 'stream.tool_call',
    STREAM_ERROR: 'stream.error',
    STREAM_END: 'stream.end',
  },
  PROVIDERS: {
    OPENAI: 'openai',
    GEMINI: 'gemini',
    ANTHROPIC: 'anthropic',
  },
  LIMITS: {
    DEFAULT_MAX_TOKENS: 4096,
    DEFAULT_TEMPERATURE: 0.7,
    CONTEXT_WINDOW_SAFETY_MARGIN: 500,
    DEFAULT_PAGE_SIZE: 20,
    MAX_PAGE_SIZE: 100,
  },
  TIMEOUTS: {
    PROVIDER_REQUEST_MS: 30000,
    STREAM_HEARTBEAT_MS: 15000,
  },
  CACHE_KEYS: {
    MODEL_REGISTRY: 'ai:models:registry',
    PROMPT_TEMPLATE: 'ai:prompts:',
  },
  DEFAULT_MODELS: {
    FAST: 'gpt-4o-mini',
    BALANCED: 'gpt-4o',
    REASONING: 'claude-3-5-sonnet',
    EMBEDDING: 'text-embedding-3-small',
  },
};
