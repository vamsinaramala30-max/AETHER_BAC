import { ToolsService } from './tools.service';

export class ToolsController {
  constructor(private service: ToolsService) {}

  public async list(req: any, res: any): Promise<void> {
    res.json({ success: true, data: this.service.getAvailableTools() });
  }

  public async execute(req: any, res: any): Promise<void> {
    try {
      const { name, args } = req.body;
      const result = await this.service.runTool(name, args);
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }
}
