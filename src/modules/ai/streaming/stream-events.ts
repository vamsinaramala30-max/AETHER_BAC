import { AI_CONSTANTS } from '../ai.constants';

export interface StreamEvent {
  type: string;
  payload: any;
  timestamp: number;
}

export class StreamEventBuilder {
  public static start(streamId: string): StreamEvent {
    return { type: AI_CONSTANTS.EVENTS.STREAM_START, payload: { streamId }, timestamp: Date.now() };
  }

  public static chunk(content: string): StreamEvent {
    return { type: AI_CONSTANTS.EVENTS.STREAM_CHUNK, payload: { content }, timestamp: Date.now() };
  }

  public static end(): StreamEvent {
    return { type: AI_CONSTANTS.EVENTS.STREAM_END, payload: {}, timestamp: Date.now() };
  }
}
