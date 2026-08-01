import { Router } from 'express';
import { AssistantController } from './assistant.controller';
import { AssistantRepository } from './assistant.repository';
import { createAssistantRouter } from './assistant.routes';
import { AssistantService } from './assistant.service';
import { AIProviderAdapter } from './assistant.types';

export class AssistantModule {
  public readonly repository: AssistantRepository;
  public readonly service: AssistantService;
  public readonly controller: AssistantController;
  public readonly router: Router;

  constructor(aiAdapter?: AIProviderAdapter) {
    this.repository = new AssistantRepository();
    this.service = new AssistantService(this.repository, aiAdapter);
    this.controller = new AssistantController(this.service);
    this.router = createAssistantRouter(this.controller);
  }
}