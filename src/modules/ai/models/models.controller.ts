import { ModelsService } from './models.service';

export class ModelsController {
  constructor(private service: ModelsService) {}

  public async getModels(req: any, res: any): Promise<void> {
    const models = this.service.getAllModels();
    res.json({ success: true, data: models });
  }

  public async getModelById(req: any, res: any): Promise<void> {
    const capabilities = this.service.getModelCapabilities(req.params.id);
    if (!capabilities) {
      res.status(404).json({ success: false, message: 'Model not found' });
      return;
    }
    res.json({ success: true, data: capabilities });
  }
}
