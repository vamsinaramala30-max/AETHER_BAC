export interface ActiveStream {
  id: string;
  userId: string;
  status: 'active' | 'cancelled' | 'completed' | 'failed';
  startedAt: Date;
}