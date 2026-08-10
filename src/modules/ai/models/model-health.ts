/**
 * AETHER AI — Model Health Checker
 * Evaluates health and latency of local models via the Part 1 LLM subsystem.
 */

import { performance } from 'perf_hooks';
import type { ModelHealthReport } from './model-types.js';
import type { ILLMEngine } from '../llm/llm-engine.js';

export interface IModelHealthChecker {
  checkModelHealth(modelId: string): Promise<ModelHealthReport>;
}

export class ModelHealthChecker implements IModelHealthChecker {
  constructor(private readonly llmEngine?: ILLMEngine) {}

  public async checkModelHealth(modelId: string): Promise<ModelHealthReport> {
    const startTime = performance.now();

    if (!this.llmEngine) {
      return {
        modelId,
        healthy: false,
        latencyMs: 0,
        lastChecked: Date.now(),
        error: 'LLM engine is not initialized.',
      };
    }

    try {
      const status = await this.llmEngine.getModelStatus(modelId);
      const latencyMs = performance.now() - startTime;

      const healthy = status.status === 'loaded' || status.status === 'available';

      return {
        modelId,
        healthy,
        latencyMs,
        lastChecked: Date.now(),
        error: status.errorMessage,
      };
    } catch (err) {
      const latencyMs = performance.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : 'Health check failed';

      return {
        modelId,
        healthy: false,
        latencyMs,
        lastChecked: Date.now(),
        error: errorMsg,
      };
    }
  }
}

export const modelHealthChecker = new ModelHealthChecker();
