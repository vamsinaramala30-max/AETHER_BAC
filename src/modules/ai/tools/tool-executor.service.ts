import { ToolRegistryService } from './tool-registry.service';

export class ToolExecutorService {
  constructor(private registry: ToolRegistryService) {}

  public async executeTool(name: string, args: Record<string, any>): Promise<any> {
    const tool = this.registry.getTool(name);
    if (!tool) {
      throw new Error(`Tool '${name}' is not registered.`);
    }
    return tool.execute(args);
  }
}
