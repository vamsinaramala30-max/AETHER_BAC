/**
 * AETHER AI — Health Check Aggregator
 * Gathers and reports runtime availability across database, vector store, cache, and LLM runtime.
 * No fake status — returns explicit typed health status.
 */

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface ComponentHealth {
  readonly name: string;
  readonly status: HealthStatus;
  readonly message?: string;
  readonly latencyMs?: number;
  readonly lastChecked: string;
}

export interface SystemHealthReport {
  readonly status: HealthStatus;
  readonly timestamp: string;
  readonly components: Readonly<Record<string, ComponentHealth>>;
}

export class HealthChecker {
  private readonly checkFns = new Map<string, () => Promise<ComponentHealth>>();

  public registerCheck(name: string, checkFn: () => Promise<ComponentHealth>): void {
    this.checkFns.set(name, checkFn);
  }

  public async getReport(): Promise<SystemHealthReport> {
    const components: Record<string, ComponentHealth> = {};
    let systemStatus: HealthStatus = 'healthy';

    for (const [name, checkFn] of this.checkFns.entries()) {
      try {
        const result = await checkFn();
        components[name] = result;

        if (result.status === 'unhealthy') {
          systemStatus = 'unhealthy';
        } else if (result.status === 'degraded' && systemStatus !== 'unhealthy') {
          systemStatus = 'degraded';
        }
      } catch (error) {
        const errMessage = error instanceof Error ? error.message : 'Unknown health check failure';
        components[name] = {
          name,
          status: 'unhealthy',
          message: errMessage,
          lastChecked: new Date().toISOString(),
        };
        systemStatus = 'unhealthy';
      }
    }

    return {
      status: systemStatus,
      timestamp: new Date().toISOString(),
      components,
    };
  }
}

export const healthChecker = new HealthChecker();
