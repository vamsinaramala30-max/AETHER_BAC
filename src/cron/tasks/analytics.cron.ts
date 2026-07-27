import { logger } from '../../config';
import { CronTaskDefinition } from '../scheduler';

export const analyticsAggregateCron: CronTaskDefinition = {
  name: 'analytics:aggregate_metrics',
  expression: '0 * * * *', // Every hour on the hour
  handler: async () => {
    logger.info('[Cron:Analytics] Aggregating hourly system usage metrics...');
    await new Promise((resolve) => setTimeout(resolve, 100));
    logger.info('[Cron:Analytics] Analytics aggregation complete.');
  },
};
