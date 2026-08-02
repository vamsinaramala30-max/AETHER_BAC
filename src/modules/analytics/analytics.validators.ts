import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { GetAnalyticsDtoSchema } from './dto/GetAnalyticsDto';
import { ExportAnalyticsDtoSchema } from './dto/ExportAnalyticsDto';
import { ProductivityQueryDtoSchema } from './dto/ProductivityQueryDto';
import { GoalAnalyticsDtoSchema } from './dto/GoalAnalyticsDto';
import { TimeAnalyticsDtoSchema } from './dto/TimeAnalyticsDto';
import { AIRecommendationDtoSchema } from './dto/AIRecommendationDto';

export const validateQuery = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.query = schema.parse(req.query);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          message: 'Validation failed',
          errors: error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
        });
        return;
      }
      next(error);
    }
  };
};

export const analyticsValidators = {
  getAnalytics: validateQuery(GetAnalyticsDtoSchema),
  exportAnalytics: validateQuery(ExportAnalyticsDtoSchema),
  productivityQuery: validateQuery(ProductivityQueryDtoSchema),
  goalAnalyticsQuery: validateQuery(GoalAnalyticsDtoSchema),
  timeAnalyticsQuery: validateQuery(TimeAnalyticsDtoSchema),
  aiRecommendationQuery: validateQuery(AIRecommendationDtoSchema),
};
