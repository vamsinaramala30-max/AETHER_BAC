/**
 * AETHER AI — Model Management Types
 * Types for model metadata, listing, selection, health, and local model storage abstraction.
 */

import type { ModelId } from '../ai-types.js';
import type { ModelInfo as Part1ModelInfo, ModelStatus as Part1ModelStatus, RuntimeStatus } from '../llm/llm-types.js';

export type ModelProviderType = 'ollama' | 'llamacpp' | 'local_file';

export interface ModelMetadata {
  readonly id: ModelId;
  readonly name: string;
  readonly provider: ModelProviderType;
  readonly family: string;
  readonly parameterCount?: string;
  readonly contextLength: number;
  readonly quantization?: string;
  readonly sizeBytes?: number;
  readonly filePath?: string;
  readonly isDefault: boolean;
  readonly isActive: boolean;
}

export interface ModelHealthReport {
  readonly modelId: ModelId;
  readonly healthy: boolean;
  readonly latencyMs: number;
  readonly lastChecked: number;
  readonly error?: string;
}

export interface SelectModelRequest {
  readonly modelId: ModelId;
}

export interface LocalModelFileInfo {
  readonly fileName: string;
  readonly filePath: string;
  readonly sizeBytes: number;
  readonly modifiedAt: number;
}
