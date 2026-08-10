/**
 * AETHER AI — Model Controller (Thin Controller)
 * Handles GET /ai/models and GET /ai/models/status. Delegates to ModelService.
 */

import { modelService } from '../../models/model-service.js';
import { handleAPIError } from '../middleware/error-handler.js';

export class ModelController {
  public async listModels() {
    try {
      const models = await modelService.listModels();
      return { success: true, data: models };
    } catch (err) {
      return handleAPIError(err);
    }
  }

  public async getRuntimeStatus() {
    try {
      const status = await modelService.getRuntimeStatus();
      return { success: true, data: status };
    } catch (err) {
      return handleAPIError(err);
    }
  }
}

export const modelController = new ModelController();
