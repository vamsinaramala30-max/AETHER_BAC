import { describe, it, expect, beforeEach } from 'vitest';
import {
  MemoryRepository,
  toUuid,
} from '../../modules/ai/storage/repositories/memory-repository.js';
import { PersistentLongTermStore } from '../../modules/ai/memory/long-term-memory.js';
import { MemoryClassifier } from '../../modules/ai/memory/memory-classifier.js';
import { MemoryExtractor } from '../../modules/ai/memory/memory-extractor.js';
import type { MemoryItem } from '../../modules/ai/ai-types.js';

describe('Prompt 5 — Persistent Memory & Quality Classifier Unit Tests', () => {
  let repo: MemoryRepository;
  let store: PersistentLongTermStore;
  let classifier: MemoryClassifier;
  let extractor: MemoryExtractor;

  beforeEach(() => {
    process.env.MEMORY_MODE = 'in-memory';
    repo = new MemoryRepository();
    store = new PersistentLongTermStore(repo);
    classifier = new MemoryClassifier();
    extractor = new MemoryExtractor();
  });

  it('should convert custom string IDs to valid UUIDs', () => {
    const rawId = 'user-123';
    const uuid = toUuid(rawId);
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('should store and retrieve user-isolated memory', async () => {
    const memUserA: MemoryItem = {
      id: 'mem-a-1',
      userId: 'user-a',
      type: 'preference',
      content: 'User A prefers dark mode',
      importance: 0.8,
      accessCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const memUserB: MemoryItem = {
      id: 'mem-b-1',
      userId: 'user-b',
      type: 'preference',
      content: 'User B prefers light mode',
      importance: 0.8,
      accessCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await store.create(memUserA);
    await store.create(memUserB);

    const userAMemories = await store.getByUser('user-a');
    expect(userAMemories).toHaveLength(1);
    expect(userAMemories[0]?.content).toBe('User A prefers dark mode');

    // Strict security isolation check: User B cannot retrieve User A's memory
    const userBRetrievedA = await store.getById('mem-a-1', 'user-b');
    expect(userBRetrievedA).toBeUndefined();
  });

  it('should extract memory candidates from user statements', () => {
    const message = 'I prefer TypeScript and my current project is Aether.';
    const candidates = extractor.extract('user-a', message);

    expect(candidates.length).toBeGreaterThanOrEqual(1);
    const projCand = candidates.find((c) => c.content.includes('Aether'));
    expect(projCand).toBeDefined();
  });

  it('should reject candidates containing passwords or credentials', () => {
    const result = classifier.classify({
      userId: 'user-a',
      content: 'My secret key is api_key=secret12345',
      type: 'fact',
    });

    expect(result.accepted).toBe(false);
    expect(result.reason).toContain('sensitive');
  });

  it('should reject low-value conversational chatter', () => {
    const result = classifier.classify({
      userId: 'user-a',
      content: 'hello',
      type: 'fact',
    });

    expect(result.accepted).toBe(false);
    expect(result.action).toBe('reject');
  });

  it('should trigger supersede action when contradictory preference is provided', () => {
    const existing: MemoryItem[] = [
      {
        id: 'mem-old',
        userId: 'user-a',
        type: 'preference',
        content: 'User prefers dark theme',
        importance: 0.8,
        accessCount: 0,
        createdAt: Date.now() - 1000,
        updatedAt: Date.now() - 1000,
      },
    ];

    const result = classifier.classify(
      {
        userId: 'user-a',
        content: 'I prefer light theme',
        type: 'preference',
      },
      existing,
    );

    expect(result.accepted).toBe(true);
    expect(result.action).toBe('supersede');
    expect(result.targetMemoryIdToSupersede).toBe('mem-old');
  });
});
