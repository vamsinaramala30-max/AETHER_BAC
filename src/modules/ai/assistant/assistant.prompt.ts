import { AssistantMemoryManager } from './assistant.memory';
import { AttachmentMetadata, MessageRole } from './assistant.types';
import { AssistantUtils } from './assistant.utils';

export class AssistantPromptBuilder {
  private systemPrompt: string = 'You are AETHER Assistant, an advanced enterprise AI assistant.';
  private userQuery: string = '';
  private contextMemory: string = '';
  private attachmentsContext: string = '';
  private conversationHistory: { role: MessageRole; content: string }[] = [];

  public setSystemPrompt(prompt?: string): this {
    if (prompt) this.systemPrompt = prompt;
    return this;
  }

  public setUserQuery(query: string): this {
    this.userQuery = query;
    return this;
  }

  public setAttachments(attachments?: AttachmentMetadata[]): this {
    if (attachments && attachments.length > 0) {
      this.attachmentsContext = AssistantUtils.formatAttachmentContext(attachments);
    }
    return this;
  }

  public async injectLongTermMemory(userId: string, workspaceId?: string): Promise<this> {
    this.contextMemory = await AssistantMemoryManager.getInstance().buildMemoryContextPrompt(
      userId,
      this.userQuery,
      workspaceId,
    );
    return this;
  }

  public setHistory(messages: { role: MessageRole; content: string }[]): this {
    this.conversationHistory = messages;
    return this;
  }

  public build(): { role: MessageRole; content: string }[] {
    const fullSystemContent = `${this.systemPrompt}${this.contextMemory}`.trim();

    const result: { role: MessageRole; content: string }[] = [
      { role: MessageRole.SYSTEM, content: fullSystemContent },
    ];

    for (const msg of this.conversationHistory) {
      if (msg.role !== MessageRole.SYSTEM) {
        result.push(msg);
      }
    }

    if (this.userQuery) {
      result.push({
        role: MessageRole.USER,
        content: `${this.userQuery}${this.attachmentsContext}`,
      });
    }

    return result;
  }
}
