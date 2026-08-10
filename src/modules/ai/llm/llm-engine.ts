/**
 * AETHER AI — LLM Engine
 * Top-level LLM interface used by the AI orchestrator.
 * Coordinates: ModelManager → Generation → Runtime.
 */

import type { Result } from '../ai-types.js';
import { ok, fail } from '../ai-types.js';
import type { AIConfig } from '../ai-config.js';
import { ModelManager } from './model-manager.js';
import type { IModelManager } from './model-manager.js';
import { Generation } from './generation.js';
import type { IGeneration, GenerationOptions } from './generation.js';
import type {
  GenerationResponse,
  LLMStreamingChunk,
  ModelInfo,
  ModelStatus,
  RuntimeStatus,
} from './llm-types.js';
import { ModelUnavailableError } from '../ai-errors.js';

// ─── ILLMEngine Interface ─────────────────────────────────────────────────────

export interface ILLMEngine {
  initialize(): Promise<void>;
  getRuntimeStatus(): Promise<RuntimeStatus>;
  getDefaultModelId(): string;
  listModels(): Promise<Result<readonly ModelInfo[]>>;
  getModelStatus(modelId: string): Promise<ModelStatus>;
  generate(
    requestId: string,
    options: GenerationOptions,
  ): Promise<Result<GenerationResponse>>;
  generateStream(
    requestId: string,
    options: GenerationOptions,
    onChunk: (chunk: LLMStreamingChunk) => void,
  ): Promise<Result<void>>;
  destroy(): Promise<void>;
}

// ─── LLM Engine Implementation ────────────────────────────────────────────────

export class LLMEngine implements ILLMEngine {
  private readonly modelManager: IModelManager;
  private readonly generation: IGeneration;
  private initialized = false;

  constructor(config: AIConfig) {
    const manager = new ModelManager(config);
    this.modelManager = manager;
    this.generation = new Generation(manager.getRuntime());
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.modelManager.initialize();
    this.initialized = true;
  }

  public async getRuntimeStatus(): Promise<RuntimeStatus> {
    return this.modelManager.getRuntimeStatus();
  }

  public getDefaultModelId(): string {
    return this.modelManager.getDefaultModelId();
  }

  public async listModels(): Promise<Result<readonly ModelInfo[]>> {
    return this.modelManager.listModels();
  }

  public async getModelStatus(modelId: string): Promise<ModelStatus> {
    return this.modelManager.getModelStatus(modelId);
  }

  public async generate(
    requestId: string,
    options: GenerationOptions,
  ): Promise<Result<GenerationResponse>> {
    if (!this.initialized) await this.initialize();

    const modelId = options.modelId || this.modelManager.getDefaultModelId();
    const loadResult = await this.modelManager.ensureModelLoaded(modelId);
    if (!loadResult.ok) {
      return fail(new ModelUnavailableError(modelId));
    }

    return this.generation.generate(requestId, { ...options, modelId });
  }

  public async generateStream(
    requestId: string,
    options: GenerationOptions,
    onChunk: (chunk: LLMStreamingChunk) => void,
  ): Promise<Result<void>> {
    if (!this.initialized) await this.initialize();

    const modelId = options.modelId || this.modelManager.getDefaultModelId();
    const loadResult = await this.modelManager.ensureModelLoaded(modelId);
    if (!loadResult.ok) {
      return fail(new ModelUnavailableError(modelId));
    }

    return this.generation.generateStream(requestId, { ...options, modelId }, onChunk);
  }

  public async destroy(): Promise<void> {
    await this.modelManager.destroy();
  }
}
