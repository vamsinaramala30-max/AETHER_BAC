import { KnowledgeRepository } from './knowledge.repository';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeController } from './knowledge.controller';

export class KnowledgeModule {
  public static register() {
    const repository = new KnowledgeRepository();
    const service = new KnowledgeService(repository);
    const controller = new KnowledgeController(service);

    return {
      repository,
      service,
      controller,
    };
  }
}