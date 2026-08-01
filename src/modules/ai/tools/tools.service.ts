import { ToolRegistryService } from './tool-registry.service';
import { ToolExecutorService } from './tool-executor.service';

export class ToolsService {
  constructor(
    private registry: ToolRegistryService,
    private executor: ToolExecutorService
  ) {}

  public getAvailableTools() {
    return this.registry.listTools().map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));
  }

  public async runTool(name: string, args: Record<string, any>) {
    return this.executor.executeTool(name, args);
  }
}