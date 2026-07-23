import { EventEmitter } from 'events';
import { logger } from '../config';

export class EventBus {
  private static instance: EventBus;
  private emitter: EventEmitter;

  private constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(50);
  }

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * Publishes an event to all subscribed listeners.
   */
  public emit<T = unknown>(event: string, payload: T): boolean {
    logger.debug(`[EventBus] Emitting event '${event}'`, { payload });
    return this.emitter.emit(event, payload);
  }

  /**
   * Subscribes a listener callback to an event.
   */
  public on<T = unknown>(event: string, listener: (payload: T) => void): this {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  /**
   * Subscribes a one-time listener callback to an event.
   */
  public once<T = unknown>(event: string, listener: (payload: T) => void): this {
    this.emitter.once(event, listener as (...args: unknown[]) => void);
    return this;
  }

  /**
   * Removes a listener callback from an event.
   */
  public off<T = unknown>(event: string, listener: (payload: T) => void): this {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
    return this;
  }
}

export const eventBus = EventBus.getInstance();