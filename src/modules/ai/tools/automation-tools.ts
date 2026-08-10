/**
 * AETHER AI — Automation Tools
 * Tool definitions for listing and executing automation workflows.
 */

import type { ToolDefinition, ToolExecutionContext } from './tool-types.js';
import { toolRegistry } from './tool-registry.js';
import { AutomationService } from '../../automation/automation.service.js';

const automationService = new AutomationService();

// ─── List Automations Tool ──────────────────────────────────────────────────

export interface ListAutomationsInput extends Record<string, unknown> {
  readonly status?: 'active' | 'paused';
}

export interface AutomationSummary {
  readonly id: string;
  readonly name: string;
  readonly trigger: string;
  readonly isEnabled: boolean;
}

export interface ListAutomationsOutput {
  readonly automations: readonly AutomationSummary[];
  readonly total: number;
}

export const listAutomationsTool: ToolDefinition<ListAutomationsInput, ListAutomationsOutput> = {
  name: 'list_automations',
  description: 'List user automation rules and workflows.',
  category: 'automation',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['active', 'paused'],
        description: 'Filter automations by status.',
      },
    },
  },
  requiredPermissions: ['automation:read'],
  handler: async (
    _input: ListAutomationsInput,
    context: ToolExecutionContext,
  ): Promise<ListAutomationsOutput> => {
    const userId = context.auth.userId;
    const res = await automationService.getAutomations(userId);
    const items = Array.isArray(res) ? res : ((res as any).items || []);
    const summaries: AutomationSummary[] = items.map((r: any) => ({
      id: r.id,
      name: r.name,
      trigger: r.trigger || r.triggerType || 'SCHEDULE',
      isEnabled: r.isEnabled !== false && r.status !== 'paused',
    }));
    return { automations: summaries, total: summaries.length };
  },
};

// ─── Execute Automation Tool ────────────────────────────────────────────────

export interface ExecuteAutomationInput extends Record<string, unknown> {
  readonly automationId: string;
  readonly triggerData?: Record<string, unknown>;
}

export interface ExecuteAutomationOutput {
  readonly executionId: string;
  readonly status: string;
  readonly message: string;
}

export const executeAutomationTool: ToolDefinition<ExecuteAutomationInput, ExecuteAutomationOutput> = {
  name: 'execute_automation',
  description: 'Trigger execution of a specific automation workflow.',
  category: 'automation',
  inputSchema: {
    type: 'object',
    properties: {
      automationId: {
        type: 'string',
        description: 'The unique ID of the automation workflow to run.',
      },
      triggerData: {
        type: 'object',
        description: 'Optional trigger payload data.',
      },
    },
    required: ['automationId'],
  },
  requiredPermissions: ['automation:execute'],
  handler: async (
    input: ExecuteAutomationInput,
    context: ToolExecutionContext,
  ): Promise<ExecuteAutomationOutput> => {
    const userId = context.auth.userId;
    const result = await automationService.runAutomation(
      input.automationId,
      input.triggerData || {},
      userId,
    );
    return {
      executionId: (result as any).id || `exec_${Date.now()}`,
      status: (result as any).status || 'SUCCESS',
      message: `Automation ${input.automationId} executed successfully.`,
    };
  },
};

// Auto-register tools on load
try {
  if (!toolRegistry.has(listAutomationsTool.name)) {
    toolRegistry.register(listAutomationsTool);
  }
  if (!toolRegistry.has(executeAutomationTool.name)) {
    toolRegistry.register(executeAutomationTool);
  }
} catch {
  // Already registered or initialized elsewhere
}
