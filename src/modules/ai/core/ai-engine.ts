/**
 * AETHER AI — AI Engine
 * The primary public entry point for the AETHER AI module.
 * Wires up and exposes the AIOrchestrator to callers.
 * Manages lifecycle: initialize → process requests → destroy.
 */

import type { AIRequest, AIResponse } from '../ai-types.js';
import type { Result } from '../ai-types.js';
import { ok, fail } from '../ai-types.js';
import { InternalError } from '../ai-errors.js';
import type { AIConfig } from '../ai-config.js';
import { buildDefaultAIConfig, validateAIConfig } from '../ai-config.js';
import { AIOrchestrator } from './ai-orchestrator.js';
import type { IAIOrchestrator } from './ai-orchestrator.js';
import { HeuristicIntentEngine } from './intent-engine.js';
import { ContextEngine } from './context-engine.js';
import { ReasoningEngine } from './reasoning-engine.js';
import { SafetyEngine } from './safety-engine.js';
import { ResponseEngine } from './response-engine.js';
import { StreamingEngine } from './streaming-engine.js';
import type { StreamSubscriber } from './streaming-engine.js';
import { PromptEngine } from '../prompts/prompt-engine.js';
import { LLMEngine } from '../llm/llm-engine.js';
import type { ILLMEngine } from '../llm/llm-engine.js';
import { MemoryEngine } from '../memory/memory-engine.js';
import type { IMemoryEngine } from '../memory/memory-engine.js';
import { RAGEngine } from '../rag/rag-engine.js';
import type { IRAGEngine } from '../rag/rag-engine.js';
import type { RuntimeStatus, ModelInfo, ModelStatus } from '../llm/llm-types.js';

// ─── IAIEngine Interface ──────────────────────────────────────────────────────

export interface IAIEngine {
  initialize(): Promise<void>;
  process(request: AIRequest): Promise<Result<AIResponse>>;
  processStream(request: AIRequest, subscriber: StreamSubscriber): Promise<Result<void>>;
  getRuntimeStatus(): Promise<RuntimeStatus>;
  listModels(): Promise<Result<readonly ModelInfo[]>>;
  getModelStatus(modelId: string): Promise<ModelStatus>;
  getMemoryEngine(): IMemoryEngine;
  getRAGEngine(): IRAGEngine;
  destroy(): Promise<void>;
}

// ─── AI Engine Implementation ─────────────────────────────────────────────────

export class AIEngine implements IAIEngine {
  private readonly config: AIConfig;
  private readonly llmEngine: ILLMEngine;
  private readonly memoryEngine: IMemoryEngine;
  private readonly ragEngine: IRAGEngine;
  private readonly orchestrator: IAIOrchestrator;
  private readonly streamingEngine: StreamingEngine;
  private readonly reasoningEngine: ReasoningEngine;
  private initialized = false;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(configOverrides?: Partial<AIConfig>) {
    const config = buildDefaultAIConfig(configOverrides);
    const validation = validateAIConfig(config);

    if (!validation.valid) {
      throw new Error(`Invalid AI configuration: ${validation.errors.join(', ')}`);
    }

    if (validation.warnings.length > 0) {
      for (const warning of validation.warnings) {
        console.warn(`[AETHER AI] Warning: ${warning}`);
      }
    }

    this.config = config;
    this.llmEngine = new LLMEngine(config);
    this.ragEngine = new RAGEngine(config);
    this.memoryEngine = new MemoryEngine(config);

    const intentEngine = new HeuristicIntentEngine();
    const contextEngine = new ContextEngine(this.memoryEngine, this.ragEngine, config);
    const promptEngine = new PromptEngine();
    this.reasoningEngine = new ReasoningEngine();
    const safetyEngine = new SafetyEngine(config.safety);
    const responseEngine = new ResponseEngine();
    this.streamingEngine = new StreamingEngine(config.streaming.heartbeatIntervalMs);

    this.orchestrator = new AIOrchestrator(
      this.llmEngine,
      intentEngine,
      contextEngine,
      promptEngine,
      this.reasoningEngine,
      safetyEngine,
      responseEngine,
      this.streamingEngine,
      this.memoryEngine,
      config,
    );
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.llmEngine.initialize();
    this.initialized = true;

    // Periodic cleanup of expired reasoning sessions
    this.cleanupTimer = setInterval(() => {
      this.reasoningEngine.clearExpired();
    }, 300_000);
  }

  public async process(request: AIRequest): Promise<Result<AIResponse>> {
    if (!this.initialized) await this.initialize();
    return this.orchestrator.process(request);
  }

  public async processStream(
    request: AIRequest,
    subscriber: StreamSubscriber,
  ): Promise<Result<void>> {
    if (!this.initialized) await this.initialize();
    return this.orchestrator.processStream(request, subscriber);
  }

  public async getRuntimeStatus(): Promise<RuntimeStatus> {
    return this.llmEngine.getRuntimeStatus();
  }

  public async listModels(): Promise<Result<readonly ModelInfo[]>> {
    return this.llmEngine.listModels();
  }

  public async getModelStatus(modelId: string): Promise<ModelStatus> {
    return this.llmEngine.getModelStatus(modelId);
  }

  public getMemoryEngine(): IMemoryEngine {
    return this.memoryEngine;
  }

  public getRAGEngine(): IRAGEngine {
    return this.ragEngine;
  }

  public async destroy(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.streamingEngine.destroy();
    await this.llmEngine.destroy();
    this.initialized = false;
  }
}

export const globalAiEngine = new AIEngine();
