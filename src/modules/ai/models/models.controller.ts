import { ModelsService } from './models.service';

export class ModelsController {
  constructor(private service: ModelsService) {}

  public getModels = async (req: any, res: any): Promise<void> => {
    try {
      const models = await this.service.getAllModels();
      res.json({ success: true, data: models });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public getModelById = async (req: any, res: any): Promise<void> => {
    try {
      const capabilities = this.service.getModelCapabilities(req.params.id);
      if (!capabilities) {
        res.status(404).json({ success: false, message: 'Model not found' });
        return;
      }
      res.json({ success: true, data: capabilities });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };
}
