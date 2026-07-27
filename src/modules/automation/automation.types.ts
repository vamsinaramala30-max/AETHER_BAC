export interface AutomationDTO {
  id: string;
  name: string;
  trigger: string;
  actions: unknown;
  isEnabled: boolean;
}
