import { eventBus } from '../../../events/EventBus';
import { logger } from '../../../config';

export type TriggerHandler = (eventPayload: Record<string, unknown>) => Promise<void>;

export class TriggerEngine {
  private static instance: TriggerEngine;
  private triggerHandlers: Map<string, Set<TriggerHandler>> = new Map();

  private constructor() {
    this.registerSystemEvents();
  }

  public static getInstance(): TriggerEngine {
    if (!TriggerEngine.instance) {
      TriggerEngine.instance = new TriggerEngine();
    }
    return TriggerEngine.instance;
  }

  /**
   * Register a trigger type handler listener.
   */
  public registerTrigger(triggerType: string, handler: TriggerHandler): () => void {
    const key = triggerType.toUpperCase().trim();
    if (!this.triggerHandlers.has(key)) {
      this.triggerHandlers.set(key, new Set());
    }
    this.triggerHandlers.get(key)!.add(handler);
    logger.info(`[TriggerEngine] Registered handler for trigger type '${key}'`);

    return () => {
      this.triggerHandlers.get(key)?.delete(handler);
    };
  }

  /**
   * Dispatch an incoming trigger event to all registered automation subscribers.
   */
  public async dispatchEvent(triggerType: string, payload: Record<string, unknown>): Promise<void> {
    const key = triggerType.toUpperCase().trim();
    const handlers = this.triggerHandlers.get(key);

    logger.info(`[TriggerEngine] Dispatching event '${key}' to ${handlers?.size || 0} handlers`);

    if (!handlers || handlers.size === 0) {
      return;
    }

    const promises = Array.from(handlers).map((handler) =>
      handler(payload).catch((err) => {
        logger.error(`[TriggerEngine] Error in handler for trigger '${key}':`, err);
      }),
    );

    await Promise.all(promises);
  }

  /**
   * Listen to system-wide EventBus events and route them as triggers.
   */
  private registerSystemEvents(): void {
    // Task events
    eventBus.on('task.created', (payload) => this.dispatchEvent('TASK_CREATED', payload as Record<string, unknown>));
    eventBus.on('task.completed', (payload) => this.dispatchEvent('TASK_COMPLETED', payload as Record<string, unknown>));
    eventBus.on('task.overdue', (payload) => this.dispatchEvent('TASK_OVERDUE', payload as Record<string, unknown>));

    // Calendar events
    eventBus.on('calendar.event_created', (payload) => this.dispatchEvent('CALENDAR_EVENT_CREATED', payload as Record<string, unknown>));
    eventBus.on('calendar.event_updated', (payload) => this.dispatchEvent('CALENDAR_EVENT_UPDATED', payload as Record<string, unknown>));

    // Project & Goal events
    eventBus.on('project.created', (payload) => this.dispatchEvent('PROJECT_CREATED', payload as Record<string, unknown>));
    eventBus.on('project.updated', (payload) => this.dispatchEvent('PROJECT_UPDATED', payload as Record<string, unknown>));
    eventBus.on('goal.updated', (payload) => this.dispatchEvent('GOAL_UPDATED', payload as Record<string, unknown>));

    // Knowledge & File events
    eventBus.on('document.created', (payload) => this.dispatchEvent('DOCUMENT_CREATED', payload as Record<string, unknown>));
    eventBus.on('document.updated', (payload) => this.dispatchEvent('DOCUMENT_UPDATED', payload as Record<string, unknown>));
    eventBus.on('file.uploaded', (payload) => this.dispatchEvent('FILE_UPLOADED', payload as Record<string, unknown>));

    // AI & Agent events
    eventBus.on('ai.event', (payload) => this.dispatchEvent('AI_EVENT', payload as Record<string, unknown>));
    eventBus.on('agent.event', (payload) => this.dispatchEvent('AGENT_EVENT', payload as Record<string, unknown>));

    // Notification events
    eventBus.on('notification.event', (payload) => this.dispatchEvent('NOTIFICATION_EVENT', payload as Record<string, unknown>));
  }
}

export const triggerEngine = TriggerEngine.getInstance();
