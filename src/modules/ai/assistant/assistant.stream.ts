import { Response } from 'express';
import { ASSISTANT_CONSTANTS } from './assistant.constants';
import { SSEEvent } from './assistant.types';

export class AssistantStreamHandler {
  private res: Response;
  private isClosed: boolean = false;
  private heartbeatInterval?: NodeJS.Timeout;

  constructor(res: Response) {
    this.res = res;
    this.initSSE();
  }

  private initSSE(): void {
    this.res.setHeader('Content-Type', 'text/event-stream');
    this.res.setHeader('Cache-Control', 'no-cache, no-transform');
    this.res.setHeader('Connection', 'keep-alive');
    this.res.setHeader('X-Accel-Buffering', 'no');
    this.res.flushHeaders();

    this.sendEvent({
      event: 'connected',
      data: { status: 'established', timestamp: new Date().toISOString() },
      retry: ASSISTANT_CONSTANTS.STREAMING.SSE_RETRY_TIMEOUT_MS,
    });

    this.startHeartbeat();

    this.res.on('close', () => {
      this.close();
    });
  }

  public sendEvent(payload: SSEEvent): void {
    if (this.isClosed) return;

    if (payload.id) {
      this.res.write(`id: ${payload.id}\n`);
    }
    if (payload.retry) {
      this.res.write(`retry: ${payload.retry}\n`);
    }
    this.res.write(`event: ${payload.event}\n`);
    this.res.write(`data: ${JSON.stringify(payload.data)}\n\n`);
  }

  public sendToken(token: string): void {
    this.sendEvent({ event: 'token', data: { token } });
  }

  public sendTyping(isTyping: boolean): void {
    this.sendEvent({ event: 'typing', data: { isTyping } });
  }

  public sendError(error: string): void {
    this.sendEvent({ event: 'error', data: { error } });
  }

  public complete(metadata?: Record<string, unknown>): void {
    if (this.isClosed) return;
    this.sendEvent({ event: 'done', data: metadata || { status: 'completed' } });
    this.close();
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (!this.isClosed) {
        this.sendEvent({ event: 'heartbeat', data: { timestamp: new Date().toISOString() } });
      }
    }, ASSISTANT_CONSTANTS.STREAMING.HEARTBEAT_INTERVAL_MS);
  }

  public close(): void {
    if (this.isClosed) return;
    this.isClosed = true;
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    this.res.end();
  }

  public get closed(): boolean {
    return this.isClosed;
  }
}