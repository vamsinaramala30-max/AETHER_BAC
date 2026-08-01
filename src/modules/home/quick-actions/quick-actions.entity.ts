export interface QuickActionItemEntity {
  id: string;
  label: string;
  actionKey: string;
  icon: string;
  endpoint: string;
}

export interface QuickActionsEntity {
  actions: QuickActionItemEntity[];
}