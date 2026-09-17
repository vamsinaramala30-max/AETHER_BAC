/**
 * AETHER AI — Confirmation Manager
 * Manages confirmation requirements and formats structured user confirmation prompts.
 * Explicitly details: WHAT will happen, WHY it is needed, WHICH resource will change.
 */

import type { ConfirmationRequest } from '../ai-types.js';
import { toolRegistry } from '../tools/tool-registry.js';

export type ActionRiskLevel =
  | 'READ'
  | 'LOW_RISK_WRITE'
  | 'HIGH_RISK_WRITE'
  | 'DESTRUCTIVE'
  | 'READ_ONLY'
  | 'LOW_RISK'
  | 'MODIFY'
  | 'HIGH_IMPACT';

export interface IConfirmationManager {
  getRiskLevel(
    toolName: string,
    args?: Record<string, unknown>,
  ): 'READ' | 'LOW_RISK_WRITE' | 'HIGH_RISK_WRITE' | 'DESTRUCTIVE';
  requiresConfirmation(
    toolName: string,
    args?: Record<string, unknown>,
    confirmedActionId?: string,
  ): boolean;
  createConfirmationRequest(
    toolName: string,
    args: Record<string, unknown>,
    customReason?: string,
  ): ConfirmationRequest;
}

export class ConfirmationManager implements IConfirmationManager {
  private readonly destructiveTools = new Set([
    'deleteResource',
    'delete_task',
    'delete_project',
    'delete_automation',
    'delete_goal',
    'delete_knowledge_document',
    'delete_note',
    'permanentlyDelete',
    'removeMemory',
    'clear_workspace',
  ]);

  private readonly highRiskTools = new Set([
    'updateResource',
    'update_project',
    'update_goal',
    'execute_automation',
  ]);

  private readonly lowRiskTools = new Set([
    'createProject',
    'create_project',
    'createTask',
    'create_task',
    'createAutomation',
    'create_automation',
    'createGoal',
    'create_goal',
    'update_task',
    'complete_task',
    'prioritize_task',
    'pause_automation',
    'activate_automation',
    'add_knowledge_document',
  ]);

  public getRiskLevel(
    toolName: string,
    _args: Record<string, unknown> = {},
  ): 'READ' | 'LOW_RISK_WRITE' | 'HIGH_RISK_WRITE' | 'DESTRUCTIVE' {
    const regTool = toolRegistry.get(toolName);
    if (regTool?.riskLevel) {
      if (regTool.riskLevel === 'HIGH_IMPACT') return 'DESTRUCTIVE';
      if (regTool.riskLevel === 'MODIFY') return 'HIGH_RISK_WRITE';
      if (regTool.riskLevel === 'LOW_RISK') return 'LOW_RISK_WRITE';
      if (regTool.riskLevel === 'READ_ONLY') return 'READ';
    }

    if (
      this.destructiveTools.has(toolName) ||
      toolName.includes('delete') ||
      toolName.includes('remove') ||
      toolName.includes('clear')
    ) {
      return 'DESTRUCTIVE';
    }
    if (
      this.highRiskTools.has(toolName) ||
      toolName.includes('execute') ||
      toolName.includes('update_project')
    ) {
      return 'HIGH_RISK_WRITE';
    }
    if (
      this.lowRiskTools.has(toolName) ||
      toolName.includes('create') ||
      toolName.includes('add') ||
      toolName.includes('update') ||
      toolName.includes('complete')
    ) {
      return 'LOW_RISK_WRITE';
    }
    return 'READ';
  }

  public requiresConfirmation(
    toolName: string,
    args: Record<string, unknown> = {},
    confirmedActionId?: string,
  ): boolean {
    if (confirmedActionId && confirmedActionId.trim().length > 0) {
      return false;
    }

    const regTool = toolRegistry.get(toolName);
    if (regTool) {
      if (typeof regTool.requiresConfirmation === 'boolean') {
        return regTool.requiresConfirmation;
      }
      if (typeof regTool.requiresConfirmation === 'function') {
        return regTool.requiresConfirmation(args as any, {} as any);
      }
    }

    const risk = this.getRiskLevel(toolName, args);
    return risk === 'DESTRUCTIVE' || risk === 'HIGH_RISK_WRITE';
  }

  public createConfirmationRequest(
    toolName: string,
    args: Record<string, unknown> = {},
    customReason?: string,
  ): ConfirmationRequest {
    const riskLevel = this.getRiskLevel(toolName, args);
    const actionId = `conf_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const targetResource =
      (args['taskId'] as string) ||
      (args['projectId'] as string) ||
      (args['automationId'] as string) ||
      (args['goalId'] as string) ||
      (args['documentId'] as string) ||
      (args['name'] as string) ||
      'the specified workspace resource';

    let description: string;
    if (customReason) {
      description = customReason;
    } else if (riskLevel === 'DESTRUCTIVE') {
      description = `Action requires confirmation:\n• WHAT: Execute ${toolName}\n• WHY: Destructive operation that permanently alters or removes records\n• WHICH RESOURCE: ${targetResource}`;
    } else if (riskLevel === 'HIGH_RISK_WRITE') {
      description = `Action requires confirmation:\n• WHAT: Execute ${toolName}\n• WHY: High-impact modification to workspace state\n• WHICH RESOURCE: ${targetResource}`;
    } else {
      description = `Please confirm execution of ${toolName} for resource "${targetResource}".`;
    }

    return {
      actionId,
      toolName,
      description,
      riskLevel,
      args,
    };
  }
}

export const confirmationManager = new ConfirmationManager();
