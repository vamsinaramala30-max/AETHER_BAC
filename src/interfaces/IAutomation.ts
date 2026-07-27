export interface IAutomation {
  id: string;
  workspaceId: string;
  name: string;
  trigger: string;
  actions: Record<string, unknown>;
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}
