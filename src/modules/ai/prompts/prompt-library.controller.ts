import { PromptLibraryService } from './prompt-library.service';

export class PromptLibraryController {
  constructor(private service: PromptLibraryService) {}

  public async create(req: any, res: any): Promise<void> {
    const prompt = await this.service.createPrompt(req.body);
    res.status(201).json({ success: true, data: prompt });
  }

  public async compile(req: any, res: any): Promise<void> {
    try {
      const content = await this.service.compilePrompt(req.params.id, req.body.variables || {});
      res.json({ success: true, data: { compiled: content } });
    } catch (err: any) {
      res.status(404).json({ success: false, message: err.message });
    }
  }
}