export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
  execute: (args: Record<string, any>) => Promise<any>;
}
