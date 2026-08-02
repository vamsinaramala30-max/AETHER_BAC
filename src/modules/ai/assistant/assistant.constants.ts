export const ASSISTANT_CONSTANTS = {
  PAGINATION: {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100,
  },
  CONTEXT: {
    MAX_TOKEN_WINDOW: 8192,
    RESERVED_COMPLETION_TOKENS: 1024,
    CHARS_PER_TOKEN_ESTIMATE: 4,
    MAX_HISTORY_MESSAGES: 50,
    SUMMARY_TRIGGER_TOKEN_THRESHOLD: 6000,
  },
  STREAMING: {
    HEARTBEAT_INTERVAL_MS: 15000,
    SSE_RETRY_TIMEOUT_MS: 3000,
  },
  CACHE: {
    MEMORY_TTL_SECONDS: 300,
  },
  EVENTS: {
    CONVERSATION_CREATED: 'assistant.conversation.created',
    CONVERSATION_UPDATED: 'assistant.conversation.updated',
    CONVERSATION_DELETED: 'assistant.conversation.deleted',
    MESSAGE_SENT: 'assistant.message.sent',
    MESSAGE_STREAMING_STARTED: 'assistant.message.streaming_started',
    MESSAGE_COMPLETED: 'assistant.message.completed',
    MESSAGE_FAILED: 'assistant.message.failed',
    MEMORY_INDEXED: 'assistant.memory.indexed',
  },
  ERRORS: {
    CONVERSATION_NOT_FOUND: 'Conversation not found or access denied',
    MESSAGE_NOT_FOUND: 'Message not found or access denied',
    UNAUTHORIZED_ACCESS: 'Unauthorized access to assistant resource',
    STREAM_ABORTED: 'Request was cancelled by the client',
    CONTEXT_WINDOW_EXCEEDED: 'Context window limit exceeded',
    RATE_LIMIT_EXCEEDED: 'Rate limit exceeded for assistant operations',
  },
} as const;
