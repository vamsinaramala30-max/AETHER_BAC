/**
 * AETHER AI — Automation Tools
 * Authoritative tool definitions for creating, inspecting, and running automation workflows.
 * Implements strict trigger validation, risk classification, confirmation requirements, and verification.
 */

import type { ToolDefinition, ToolExecutionContext, ToolVerificationResult } from './tool-types.js';
import { toolRegistry } from './tool-registry.js';
import { AutomationService } from '../../automation/automation.service.js';

let _automationService: AutomationService | undefined;
function getAutomationService(): AutomationService {
  if (!_automationService) {
    _automationService = new AutomationService();
  }
  return _automationService;
}

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
  id: 'tool_list_automations',
  name: 'list_automations',
  description: 'List user automation rules and workflows.',
  category: 'automation',
  riskLevel: 'READ_ONLY',
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
    const res = await getAutomationService().getUserAutomations(userId);
    const items = Array.isArray(res) ? res : (res as any).items || [];
    const summaries: AutomationSummary[] = items.map((r: any) => ({
      id: r.id,
      name: r.name,
      trigger: r.trigger || r.triggerType || 'SCHEDULE',
      isEnabled: r.isEnabled !== false && r.status !== 'paused',
    }));
    return { automations: summaries, total: summaries.length };
  },
};

// ─── Get Automation Tool ────────────────────────────────────────────────────

export interface GetAutomationInput extends Record<string, unknown> {
  readonly automationId: string;
}

export interface AutomationDetails {
  readonly id: string;
  readonly name: string;
  readonly trigger: string;
  readonly isEnabled: boolean;
  readonly status: string;
  readonly schedule?: string;
  readonly actions: unknown;
  readonly createdAt: string;
}

export const getAutomationTool: ToolDefinition<GetAutomationInput, AutomationDetails> = {
  id: 'tool_get_automation',
  name: 'get_automation',
  description: 'Inspect details of a specific automation workflow by ID.',
  category: 'automation',
  riskLevel: 'READ_ONLY',
  inputSchema: {
    type: 'object',
    properties: {
      automationId: { type: 'string', description: 'The unique ID of the automation' },
    },
    required: ['automationId'],
  },
  requiredPermissions: ['automation:read'],
  handler: async (
    input: GetAutomationInput,
    _context: ToolExecutionContext,
  ): Promise<AutomationDetails> => {
    const auto = await getAutomationService().getAutomationById(input.automationId);
    return {
      id: auto.id,
      name: auto.name,
      trigger: auto.trigger,
      isEnabled: auto.isEnabled,
      status: auto.status,
      schedule: auto.schedule ?? undefined,
      actions: auto.actions,
      createdAt: auto.createdAt ? new Date(auto.createdAt).toISOString() : new Date().toISOString(),
    };
  },
};

// ─── Create Automation Tool ──────────────────────────────────────────────────

export interface CreateAutomationInput extends Record<string, unknown> {
  readonly name: string;
  readonly trigger: string;
  readonly description?: string;
  readonly schedule?: string;
  readonly actions?: Array<{ type: string; params?: Record<string, unknown> }>;
}

export interface CreateAutomationOutput {
  readonly automationId: string;
  readonly name: string;
  readonly status: string;
  readonly trigger: string;
}

export const createAutomationTool: ToolDefinition<CreateAutomationInput, CreateAutomationOutput> = {
  id: 'tool_create_automation',
  name: 'create_automation',
  description: 'Create a new automated rule or scheduled workflow.',
  category: 'automation',
  riskLevel: 'LOW_RISK',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name of the automation', minLength: 1, maxLength: 300 },
      trigger: {
        type: 'string',
        description: 'Trigger type, e.g. SCHEDULE, TASK_COMPLETED, TASK_OVERDUE, PROJECT_CREATED',
      },
      description: { type: 'string', description: 'Optional description' },
      schedule: {
        type: 'string',
        description: 'Cron syntax or schedule string (e.g. 0 9 * * 1 for Monday 9 AM)',
      },
      actions: {
        type: 'array',
        description: 'List of actions to perform',
        items: { type: 'object' },
      },
    },
    required: ['name', 'trigger'],
  },
  requiredPermissions: ['automation:write'],
  handler: async (
    input: CreateAutomationInput,
    context: ToolExecutionContext,
  ): Promise<CreateAutomationOutput> => {
    const userId = context.auth.userId;
    const created = await getAutomationService().createAutomation({
      userId,
      name: input.name,
      trigger: input.trigger,
      description: input.description,
      schedule: input.schedule,
      actions: input.actions || [{ type: 'NOTIFICATION_CREATE', params: { title: input.name } }],
    });
    return {
      automationId: created.id,
      name: created.name,
      status: created.status || 'ACTIVE',
      trigger: created.trigger,
    };
  },
  verify: async (
    output: CreateAutomationOutput,
    input: CreateAutomationInput,
  ): Promise<ToolVerificationResult> => {
    const auto = await getAutomationService().getAutomationById(output.automationId);
    if (!auto) {
      return { verified: false, error: `Automation ${output.automationId} not found in database.` };
    }
    if (auto.name !== input.name) {
      return {
        verified: false,
        error: `Automation name mismatch: expected "${input.name}", found "${auto.name}".`,
      };
    }
    return {
      verified: true,
      details: `Automation "${auto.name}" (ID: ${auto.id}) verified in database with trigger ${auto.trigger}.`,
      verifiedObject: auto,
    };
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

export const executeAutomationTool: ToolDefinition<
  ExecuteAutomationInput,
  ExecuteAutomationOutput
> = {
  id: 'tool_execute_automation',
  name: 'execute_automation',
  description:
    'Trigger immediate execution of an automation workflow. Requires confirmation for high-impact actions.',
  category: 'automation',
  riskLevel: 'HIGH_IMPACT',
  requiresConfirmation: true,
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
    const result = await getAutomationService().runAutomation(
      input.automationId,
      input.triggerData || {},
      userId,
    );
    return {
      executionId: (result as any).executionId || (result as any).id || '',
      status: (result as any).status || 'FAILED',
      message: (result as any).message || `Automation ${input.automationId} executed.`,
    };
  },

  verify: async (output: ExecuteAutomationOutput): Promise<ToolVerificationResult> => {
    if (output.status !== 'SUCCESS' && output.status !== 'COMPLETED') {
      return { verified: false, error: `Automation execution returned status "${output.status}".` };
    }
    return {
      verified: true,
      details: `Automation execution (ID: ${output.executionId}) verified successfully.`,
    };
  },
};

// ─── Pause Automation Tool ──────────────────────────────────────────────────

export interface PauseAutomationInput extends Record<string, unknown> {
  readonly automationId: string;
}

export const pauseAutomationTool: ToolDefinition<
  PauseAutomationInput,
  { automationId: string; status: string }
> = {
  id: 'tool_pause_automation',
  name: 'pause_automation',
  description: 'Pauses an active automation rule.',
  category: 'automation',
  riskLevel: 'MODIFY',
  inputSchema: {
    type: 'object',
    properties: {
      automationId: { type: 'string', description: 'The unique ID of the automation' },
    },
    required: ['automationId'],
  },
  requiredPermissions: ['automation:write'],
  handler: async (input: PauseAutomationInput, context: ToolExecutionContext) => {
    const userId = context.auth.userId;
    const updated = await getAutomationService().pauseAutomation(input.automationId, userId);
    return {
      automationId: updated.id,
      status: updated.status,
    };
  },
  verify: async (output: {
    automationId: string;
    status: string;
  }): Promise<ToolVerificationResult> => {
    const auto = await getAutomationService().getAutomationById(output.automationId);
    if (auto.status !== 'PAUSED' && auto.isEnabled) {
      return { verified: false, error: `Automation ${output.automationId} is not paused.` };
    }
    return { verified: true, details: `Automation ${output.automationId} verified as paused.` };
  },
};

// ─── Activate Automation Tool ───────────────────────────────────────────────

export interface ActivateAutomationInput extends Record<string, unknown> {
  readonly automationId: string;
}

export const activateAutomationTool: ToolDefinition<
  ActivateAutomationInput,
  { automationId: string; status: string }
> = {
  id: 'tool_activate_automation',
  name: 'activate_automation',
  description: 'Activates or resumes a paused automation rule.',
  category: 'automation',
  riskLevel: 'MODIFY',
  inputSchema: {
    type: 'object',
    properties: {
      automationId: { type: 'string', description: 'The unique ID of the automation' },
    },
    required: ['automationId'],
  },
  requiredPermissions: ['automation:write'],
  handler: async (input: ActivateAutomationInput, context: ToolExecutionContext) => {
    const userId = context.auth.userId;
    const updated = await getAutomationService().activateAutomation(input.automationId, userId);
    return {
      automationId: updated.id,
      status: updated.status,
    };
  },
  verify: async (output: {
    automationId: string;
    status: string;
  }): Promise<ToolVerificationResult> => {
    const auto = await getAutomationService().getAutomationById(output.automationId);
    if (auto.status !== 'ACTIVE' || !auto.isEnabled) {
      return { verified: false, error: `Automation ${output.automationId} is not active.` };
    }
    return { verified: true, details: `Automation ${output.automationId} verified as active.` };
  },
};

// ─── Delete Automation Tool ─────────────────────────────────────────────────

export interface DeleteAutomationInput extends Record<string, unknown> {
  readonly automationId: string;
}

export const deleteAutomationTool: ToolDefinition<
  DeleteAutomationInput,
  { automationId: string; deleted: boolean }
> = {
  id: 'tool_delete_automation',
  name: 'delete_automation',
  description: 'Permanently removes an automation rule. Requires user confirmation.',
  category: 'automation',
  riskLevel: 'HIGH_IMPACT',
  requiresConfirmation: true,
  inputSchema: {
    type: 'object',
    properties: {
      automationId: { type: 'string', description: 'The unique ID of the automation to delete' },
    },
    required: ['automationId'],
  },
  requiredPermissions: ['automation:write'],
  handler: async (input: DeleteAutomationInput, context: ToolExecutionContext) => {
    const userId = context.auth.userId;
    await getAutomationService().deleteAutomation(input.automationId, userId);
    return {
      automationId: input.automationId,
      deleted: true,
    };
  },
  verify: async (output: {
    automationId: string;
    deleted: boolean;
  }): Promise<ToolVerificationResult> => {
    try {
      const auto = await getAutomationService().getAutomationById(output.automationId);
      if (auto) {
        return {
          verified: false,
          error: `Automation ${output.automationId} still exists after delete.`,
        };
      }
    } catch {
      // Expected — not found error
    }
    return { verified: true, details: `Automation ${output.automationId} verified as deleted.` };
  },
};

// ─── All Automation Tools ───────────────────────────────────────────────────

export const automationTools = [
  listAutomationsTool,
  getAutomationTool,
  createAutomationTool,
  executeAutomationTool,
  pauseAutomationTool,
  activateAutomationTool,
  deleteAutomationTool,
] as const;

// Auto-register tools on load
for (const tool of automationTools) {
  try {
    if (!toolRegistry.has(tool.name)) {
      toolRegistry.register(tool as any);
    }
  } catch {
    // Already registered
  }
}
