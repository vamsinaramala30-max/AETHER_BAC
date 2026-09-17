import { Request, Response } from 'express';
import { healthChecker } from '../ai/observability/health.js';

export class HealthController {
  /**
   * GET /health/live & /api/v1/health/live
   * Fast liveness probe for container orchestrators.
   */
  public getLiveness(_req: Request, res: Response): void {
    const liveness = healthChecker.getLiveness();
    res.status(200).json(liveness);
  }

  /**
   * GET /health/ready & /api/v1/health/ready
   * Readiness probe verifying core backend dependencies with bounded timeouts.
   */
  public async getReadiness(_req: Request, res: Response): Promise<void> {
    const report = await healthChecker.getReadiness();
    const httpStatus = report.status === 'UNAVAILABLE' ? 503 : 200;
    res.status(httpStatus).json(report);
  }

  /**
   * GET /health & /api/v1/health
   * Standard system health endpoint.
   */
  public async checkHealth(_req: Request, res: Response): Promise<void> {
    const report = await healthChecker.getReport();
    const httpStatus = report.status === 'UNAVAILABLE' ? 503 : 200;
    res.status(httpStatus).json(report);
  }
}

export const healthController = new HealthController();
