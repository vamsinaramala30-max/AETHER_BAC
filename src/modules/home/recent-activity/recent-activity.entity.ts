export interface ActivityItemEntity {
  id: string;
  action: string;
  resource: string;
  createdAt: string;
}

export interface RecentActivityEntity {
  activities: ActivityItemEntity[];
}
