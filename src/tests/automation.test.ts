import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConditionEngine } from '../modules/automation/engine/condition-engine';
import { VariableEngine } from '../modules/automation/engine/variable-engine';
import { ScheduleManager } from '../modules/automation/scheduler/schedule-manager';
import { withRetry } from '../modules/automation/utils/retry.utils';
import { isValidUuid } from '../modules/automation/utils/automation.utils';
import { AutomationService } from '../modules/automation/automation.service';

describe('Aether Automation Engine Unit Tests', () => {
  describe('VariableEngine', () => {
    it('resolves nested path properties correctly', () => {
      const context = {
        trigger: {
          data: {
            task: {
              title: 'Fix Bug 101',
              priority: 'HIGH',
            },
          },
        },
        user: { id: 'usr_123', email: 'test@aether.os' },
      };

      expect(VariableEngine.getPathValue(context, 'trigger.data.task.title')).toBe('Fix Bug 101');
      expect(VariableEngine.getPathValue(context, 'trigger.data.task.priority')).toBe('HIGH');
      expect(VariableEngine.getPathValue(context, 'user.email')).toBe('test@aether.os');
      expect(VariableEngine.getPathValue(context, 'invalid.path')).toBeUndefined();
    });

    it('interpolates string placeholders correctly', () => {
      const context = {
        trigger: { data: { title: 'Release v1.0' } },
        user: { name: 'Alice' },
      };

      const template = 'Task "{{trigger.data.title}}" created by {{user.name}}';
      const result = VariableEngine.interpolate(template, context);
      expect(result).toBe('Task "Release v1.0" created by Alice');
    });

    it('interpolates nested object payloads', () => {
      const context = { task: { id: 'task_99', title: 'Deploy App' } };
      const payload = {
        name: '{{task.title}}',
        details: { taskId: '{{task.id}}' },
      };

      const result = VariableEngine.interpolate(payload, context);
      expect(result).toEqual({
        name: 'Deploy App',
        details: { taskId: 'task_99' },
      });
    });
  });

  describe('ConditionEngine', () => {
    let engine: ConditionEngine;

    beforeEach(() => {
      engine = new ConditionEngine();
    });

    it('returns true if condition config is null or empty', () => {
      expect(engine.evaluate(null, {})).toBe(true);
      expect(engine.evaluate(undefined, {})).toBe(true);
    });

    it('evaluates equals and not_equals conditions', () => {
      const context = { trigger: { data: { status: 'COMPLETED', priority: 'HIGH' } } };

      expect(engine.evaluate({ field: 'trigger.data.status', operator: 'equals', value: 'COMPLETED' }, context)).toBe(true);
      expect(engine.evaluate({ field: 'trigger.data.status', operator: 'not_equals', value: 'FAILED' }, context)).toBe(true);
      expect(engine.evaluate({ field: 'trigger.data.status', operator: 'equals', value: 'PENDING' }, context)).toBe(false);
    });

    it('evaluates contains and does_not_contain conditions', () => {
      const context = { trigger: { data: { tags: ['urgent', 'backend'], title: 'Critical Fix' } } };

      expect(engine.evaluate({ field: 'trigger.data.title', operator: 'contains', value: 'Critical' }, context)).toBe(true);
      expect(engine.evaluate({ field: 'trigger.data.tags', operator: 'contains', value: 'urgent' }, context)).toBe(true);
      expect(engine.evaluate({ field: 'trigger.data.title', operator: 'does_not_contain', value: 'Feature' }, context)).toBe(true);
    });

    it('evaluates greater_than and less_than conditions', () => {
      const context = { trigger: { data: { score: 85, count: 3 } } };

      expect(engine.evaluate({ field: 'trigger.data.score', operator: 'greater_than', value: 50 }, context)).toBe(true);
      expect(engine.evaluate({ field: 'trigger.data.count', operator: 'less_than', value: 10 }, context)).toBe(true);
      expect(engine.evaluate({ field: 'trigger.data.score', operator: 'less_than', value: 10 }, context)).toBe(false);
    });

    it('evaluates compound AND / OR / NOT conditions', () => {
      const context = { trigger: { data: { priority: 'HIGH', count: 5 } } };

      const compoundAnd = {
        logicalOperator: 'AND' as const,
        conditions: [
          { field: 'trigger.data.priority', operator: 'equals' as const, value: 'HIGH' },
          { field: 'trigger.data.count', operator: 'greater_than' as const, value: 2 },
        ],
      };

      const compoundOr = {
        logicalOperator: 'OR' as const,
        conditions: [
          { field: 'trigger.data.priority', operator: 'equals' as const, value: 'LOW' },
          { field: 'trigger.data.count', operator: 'greater_than' as const, value: 2 },
        ],
      };

      expect(engine.evaluate(compoundAnd, context)).toBe(true);
      expect(engine.evaluate(compoundOr, context)).toBe(true);
    });
  });

  describe('ScheduleManager', () => {
    it('validates cron expressions', () => {
      expect(ScheduleManager.isValidCron('0 * * * *')).toBe(true);
      expect(ScheduleManager.isValidCron('*/5 * * * *')).toBe(true);
      expect(ScheduleManager.isValidCron('invalid_cron')).toBe(false);
    });

    it('normalizes schedule string aliases', () => {
      expect(ScheduleManager.normalizeSchedule('hourly')).toBe('0 * * * *');
      expect(ScheduleManager.normalizeSchedule('daily')).toBe('0 0 * * *');
      expect(ScheduleManager.normalizeSchedule('weekly')).toBe('0 0 * * 0');
      expect(ScheduleManager.normalizeSchedule('monthly')).toBe('0 0 1 * *');
      expect(ScheduleManager.normalizeSchedule('0 12 * * *')).toBe('0 12 * * *');
    });
  });

  describe('RetryUtil', () => {
    it('retries failing operation up to maxRetries', async () => {
      let attempts = 0;
      const fn = vi.fn(async () => {
        attempts++;
        if (attempts < 3) throw new Error('Temporary failure');
        return 'success';
      });

      const result = await withRetry('test_retry', fn, {
        maxRetries: 3,
        initialDelayMs: 10,
        backoffFactor: 1,
      });

      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('throws error after exhausting max retries', async () => {
      const fn = vi.fn(async () => {
        throw new Error('Persistent failure');
      });

      await expect(
        withRetry('test_exhaust', fn, {
          maxRetries: 2,
          initialDelayMs: 10,
          backoffFactor: 1,
        }),
      ).rejects.toThrow('Persistent failure');
    });
  });

  describe('AutomationUtils', () => {
    it('validates UUID formats', () => {
      expect(isValidUuid('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
      expect(isValidUuid('invalid-uuid')).toBe(false);
    });
  });

  describe('AutomationService Templates', () => {
    it('returns pre-built automation templates', () => {
      const service = new AutomationService();
      const templates = service.getTemplates();

      expect(Array.isArray(templates)).toBe(true);
      expect(templates.length).toBeGreaterThan(0);
      expect(templates[0]).toHaveProperty('id');
      expect(templates[0]).toHaveProperty('name');
      expect(templates[0]).toHaveProperty('actions');
    });
  });
});
