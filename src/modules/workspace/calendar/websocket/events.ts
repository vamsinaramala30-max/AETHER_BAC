export interface WSEventPayload<T = any> {
  event: string;
  data: T;
  timestamp: string;
}