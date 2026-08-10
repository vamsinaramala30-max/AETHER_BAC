/**
 * AETHER AI — Knowledge Controller (Thin Controller)
 * Handles /ai/knowledge endpoints. Delegates to KnowledgeService.
 */

import { knowledgeService } from '../../knowledge/knowledge-service.js';
import { handleAPIError } from '../middleware/error-handler.js';

export class KnowledgeController {
  public async listCollections() {
    try {
      const collections = await knowledgeService.listCollections();
      return { success: true, data: collections };
    } catch (err) {
      return handleAPIError(err);
    }
  }

  public async ingestDocument(body: {
    title: string;
    content: string;
    mimeType?: string;
    collectionId?: string;
  }) {
    try {
      const doc = await knowledgeService.ingestDocument(
        body.title,
        body.content,
        body.mimeType ?? 'text/plain',
        { collectionId: body.collectionId },
      );
      return { success: true, data: doc };
    } catch (err) {
      return handleAPIError(err);
    }
  }

  public async deleteDocument(id: string) {
    try {
      const deleted = await knowledgeService.deleteDocument(id);
      return { success: true, data: { deleted } };
    } catch (err) {
      return handleAPIError(err);
    }
  }
}

export const knowledgeController = new KnowledgeController();
