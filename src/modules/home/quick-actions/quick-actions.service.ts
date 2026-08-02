import { QuickActionsRepository } from './quick-actions.repository';
import { QuickActionsEntity } from './quick-actions.entity';

export class QuickActionsService {
  constructor(private readonly repository: QuickActionsRepository) {}

  async getAvailableActions(): Promise<QuickActionsEntity> {
    return {
      actions: [
        {
          id: '1',
          label: 'New Chat',
          actionKey: 'create_chat',
          icon: 'message-square',
          endpoint: '/api/v1/conversations',
        },
        {
          id: '2',
          label: 'New Project',
          actionKey: 'create_project',
          icon: 'folder-plus',
          endpoint: '/api/v1/projects',
        },
        {
          id: '3',
          label: 'Upload Document',
          actionKey: 'upload_document',
          icon: 'file-up',
          endpoint: '/api/v1/files/upload',
        },
      ],
    };
  }

  async executeAction(userId: string, actionKey: string, payload: any) {
    await this.repository.logActionExecution(userId, actionKey, payload);
    return { executed: true, actionKey };
  }
}
