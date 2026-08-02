import { ExportFormat, ExportDataPayload } from './analytics.types';

export class AnalyticsExporter {
  public static format(payload: ExportDataPayload, format: ExportFormat): string | object {
    switch (format) {
      case ExportFormat.JSON:
        return payload;

      case ExportFormat.CSV:
        return this.toCSV(payload);

      case ExportFormat.EXCEL:
      case ExportFormat.PDF:
        return {
          meta: {
            format,
            generatedAt: payload.generatedAt,
            user: payload.user.email,
          },
          summary: payload.scores,
          raw: payload.metrics,
          insights: payload.recommendations,
        };

      default:
        return payload;
    }
  }

  private static toCSV(payload: ExportDataPayload): string {
    const headers = ['Metric', 'Value'];
    const rows = [
      ['Productivity Score', payload.scores.productivityScore],
      ['Focus Score', payload.scores.focusScore],
      ['Goal Completion Rate (%)', payload.scores.goalCompletionRate],
      ['Consistency Score', payload.scores.consistencyScore],
      ['Burnout Risk Index', payload.scores.burnoutRiskIndex],
      ['Total Tasks', payload.metrics.totalTasks],
      ['Completed Tasks', payload.metrics.completedTasks],
      ['Total Tracked Hours', (payload.metrics.totalTrackedSeconds / 3600).toFixed(2)],
    ];

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }
}
