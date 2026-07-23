export enum AutomationEventType {
  AUTOMATION_TRIGGERED = 'automation.triggered',
  AUTOMATION_EXECUTED = 'automation.executed',
  AUTOMATION_FAILED = 'automation.failed',
}

export interface AutomationTriggeredPayload {
  automationId: string;
  workspaceId: string;
  triggerType: string;
  triggeredAt: Date;
}

export interface AutomationExecutedPayload {
  automationId: string;
  workspaceId: string;
  executionTimeMs: number;
  status: 'SUCCESS' | 'FAILED';
}