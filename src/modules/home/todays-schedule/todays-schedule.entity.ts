export interface ScheduleItemEntity {
  id: string;
  title: string;
  time: string;
  type: 'CONVERSATION' | 'AUTOMATION' | 'PROJECT_UPDATE';
}

export interface TodaysScheduleEntity {
  items: ScheduleItemEntity[];
}
