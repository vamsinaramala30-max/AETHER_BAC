import { EventEmitter } from 'events';

export class StreamGateway extends EventEmitter {
  public broadcastToStream(streamId: string, event: any): void {
    this.emit(`stream:${streamId}`, event);
  }
}