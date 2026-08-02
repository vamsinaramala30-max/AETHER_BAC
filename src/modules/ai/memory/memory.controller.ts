import { MemoryService } from './memory.service';

export class MemoryController {
  constructor(private service: MemoryService) {}

  public async store(req: any, res: any): Promise<void> {
    const memory = await this.service.storeMemory(req.body);
    res.status(201).json({ success: true, data: memory });
  }

  public async query(req: any, res: any): Promise<void> {
    const memories = await this.service.retrieveRelevantMemory(req.query);
    res.json({ success: true, data: memories });
  }

  public async cleanup(req: any, res: any): Promise<void> {
    const count = await this.service.cleanupOldMemories(req.params.userId);
    res.json({ success: true, deletedCount: count });
  }
}
