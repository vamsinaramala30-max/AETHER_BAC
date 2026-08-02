export interface WorkItemEntity {
  id: string;
  title: string;
  type: 'CONVERSATION' | 'PROJECT';
  updatedAt: string;
}

export interface ContinueWorkingEntity {
  items: WorkItemEntity[];
}
