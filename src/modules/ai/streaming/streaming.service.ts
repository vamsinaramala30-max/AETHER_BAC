import { StreamGateway } from './stream.gateway';

export class StreamingService {
  private activeStreams: Set<string> = new Set();

  constructor(private gateway: StreamGateway) {}

  public registerStream(streamId: string): void {
    this.activeStreams.add(streamId);
  }

  public cancelStream(streamId: string): boolean {
    if (this.activeStreams.has(streamId)) {
      this.activeStreams.delete(streamId);
      this.gateway.broadcastToStream(streamId, { type: 'CANCELLED' });
      return true;
    }
    return false;
  }

  public isActive(streamId: string): boolean {
    return this.activeStreams.has(streamId);
  }
}