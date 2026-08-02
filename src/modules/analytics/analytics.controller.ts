import { NextFunction, Request, Response } from 'express';
import { db } from '../../database/client';
import { AnalyticsRepository } from './analytics.repository';
import { AnalyticsService } from './analytics.service';
import { ExportAnalyticsDto } from './dto/ExportAnalyticsDto';
import { GetAnalyticsDto } from './dto/GetAnalyticsDto';

export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  public getDashboard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await this.handleDashboard(req, res, next);
  };

  public getOverviewMetrics = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    await this.handleDashboard(req, res, next);
  };

  public getUsageMetrics = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    await this.handleDashboard(req, res, next);
  };

  public exportAnalytics = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user?.id ?? 'usr-default-uuid';
      const userEmail = req.user?.email ?? 'architect@aiproductivity.com';
      const query = req.query as unknown as ExportAnalyticsDto;

      const dateRange = this.analyticsService.resolveDateRange(
        query.preset,
        query.startDate,
        query.endDate,
      );

      const result = await this.analyticsService.exportAnalytics(
        userId,
        userEmail,
        dateRange,
        query.format,
      );

      if (query.format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="analytics-${query.preset ?? '7d'}.csv"`,
        );
        res.status(200).send(result);
        return;
      }

      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  private async handleDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id ?? 'usr-default-uuid';
      const query = req.query as unknown as GetAnalyticsDto;

      const dateRange = this.analyticsService.resolveDateRange(
        query.preset,
        query.startDate,
        query.endDate,
      );

      const data = await this.analyticsService.getDashboardAnalytics(userId, dateRange);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

const analyticsService = new AnalyticsService(new AnalyticsRepository(db));
export const analyticsController = new AnalyticsController(analyticsService);
