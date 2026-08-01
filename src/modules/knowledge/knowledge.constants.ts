export const KNOWLEDGE_CONSTANTS = {
  PAGINATION: {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100,
  },
  UPLOADS: {
    MAX_FILE_SIZE_BYTES: 25 * 1024 * 1024, // 25 MB
    ALLOWED_MIME_TYPES: [
      'application/pdf',
      'text/plain',
      'text/markdown',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png',
      'image/jpeg',
      'image/webp',
    ],
  },
  SEARCH: {
    DEFAULT_SIMILARITY_THRESHOLD: 0.75,
    MAX_SUGGESTIONS: 10,
  },
  CACHE_KEYS: {
    KNOWLEDGE_BASE_HIERARCHY: 'kb:hierarchy',
    SEARCH_SUGGESTIONS: 'search:suggestions',
  },
  EVENTS: {
    DOCUMENT_UPLOADED: 'knowledge.document.uploaded',
    DOCUMENT_INDEXED: 'knowledge.document.indexed',
    NOTE_UPDATED: 'knowledge.note.updated',
  },
} as const;

export enum DocumentStatus {
  DRAFT = 'DRAFT',
  PROCESSING = 'PROCESSING',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
  INDEX_FAILED = 'INDEX_FAILED',
}

export enum IndexingState {
  PENDING = 'PENDING',
  EXTRACTING = 'EXTRACTING',
  CHUNKED = 'CHUNKED',
  EMBEDDED = 'EMBEDDED',
  INDEXED = 'INDEXED',
  FAILED = 'FAILED',
}

export enum SearchType {
  FULL_TEXT = 'FULL_TEXT',
  SEMANTIC = 'SEMANTIC',
  HYBRID = 'HYBRID',
}