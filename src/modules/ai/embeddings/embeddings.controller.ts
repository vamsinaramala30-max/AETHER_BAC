import { EmbeddingsService } from './embeddings.service';

export class EmbeddingsController {
  constructor(private service: EmbeddingsService) {}

  public async generate(req: any, res: any): Promise<void> {
    const result = await this.service.createEmbeddings(req.body);
    res.json({ success: true, data: result });
  }

  public async search(req: any, res: any): Promise<void> {
    const results = await this.service.searchSimilar(req.body);
    res.json({ success: true, data: results });
  }
}