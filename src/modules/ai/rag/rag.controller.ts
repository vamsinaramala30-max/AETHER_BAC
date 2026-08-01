import { RagService } from './rag.service';

export class RagController {
  constructor(private service: RagService) {}

  public async retrieve(req: any, res: any): Promise<void> {
    const { query } = req.body;
    const result = await this.service.buildAugmentedContext(query || '');
    res.json({ success: true, data: result });
  }
}