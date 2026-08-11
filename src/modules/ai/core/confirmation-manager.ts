/**
 * AETHER AI — Confirmation Manager
 * Classifies tool execution safety & manages confirmation requirements.
 * Categorizes actions as READ, LOW_RISK_WRITE, HIGH_RISK_WRITE, or DESTRUCTIVE.
 * Explicit confirmation is required for DESTRUCTIVE and HIGH_RISK_WRITE operations.
 */

import type { ConfirmationRequest } from '../ai-types.js';

export type ActionRiskLevel = 'READ' | 'LOW_RISK_WRITE' | 'HIGH_RISK_WRITE' | 'DESTRUCTIVE';

export interface IConfirmationManager {
  getRiskLevel(toolName: string, args: Record<string, unknown>): ActionRiskLevel;
  requiresConfirmation(toolName: string, args: Record<string, unknown>, confirmedActionId?: string): boolean;
  createConfirmationRequest(toolName: string, args: Record<string, unknown>): ConfirmationRequest;
}

export class ConfirmationManager implements IConfirmationManager {
  private readonly destructiveTools = new Set([
    'deleteResource',
    'delete_task',
    'delete_project',
    'delete_automation',
    'permanentlyDelete',
    'removeMemory',
    'clear_workspace',
  ]);

  private readonly highRiskTools = new Set([
    'updateResource',
    'update_project',
    'execute_automation',
  ]);

  private readonly lowRiskTools = new Set([
    'createProject',
    'create_project',
    'createTask',
    'create_task',
    'createAutomation',
    'create_automation',
  ]);

  public getRiskLevel(toolName: string, _args: Record<string, unknown>): ActionRiskLevel {
    if (this.destructiveTools.has(toolName) || toolName.includes('delete') || toolName.includes('remove')) {
      return 'DESTRUCTIVE';
    }
    if (this.highRiskTools.has(toolName) || toolName.includes('execute') || toolName.includes('update')) {
      return 'HIGH_RISK_WRITE';
    }
    if (this.lowRiskTools.has(toolName) || toolName.includes('create') || toolName.includes('add')) {
      return 'LOW_RISK_WRITE';
    }
    return 'READ';
  }

  public requiresConfirmation(
    toolName: string,
    args: Record<string, unknown>,
    confirmedActionId?: string,
  ): boolean {
    // If action was already confirmed by client, no further confirmation needed
    if (confirmedActionId && confirmedActionId.trim().length > 0) {
      return false;
    }

    const riskLevel = this.getRiskLevel(toolName, args);
    return riskLevel === 'DESTRUCTIVE' || riskLevel === 'HIGH_RISK_WRITE';
  }

  public createConfirmationRequest(
    toolName: string,
    args: Record<string, unknown>,
  ): ConfirmationRequest {
    const riskLevel = this.getRiskLevel(toolName, args);
    const actionId = `conf_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    
    let description = `Confirm execution of ${toolName}.`;
    if (riskLevel === 'DESTRUCTIVE') {
      description = `Are you sure you want to execute destructive action "${toolName}"? This action cannot be undone.`;
    } else if (riskLevel === 'HIGH_RISK_WRITE') {
      description = `Please confirm modifications using "${toolName}".`;
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
