import { AIRepository } from './ai.repository';
import { GeminiProvider } from './providers/gemini.provider';
import { RAGService } from './rag/rag.service';
import { SYSTEM_PROMPT } from './prompts/system.prompt';
import { buildChatPrompt } from './prompts/chat.prompt';

export class AIService {
  private repo: AIRepository;
  private provider: GeminiProvider;
  private rag: RAGService;

  constructor() {
    this.repo = new AIRepository();
    this.provider = new GeminiProvider();
    this.rag = new RAGService();
  }

  public async processChat(userId: string, workspaceId: string, message: string, conversationId?: string) {
    let convId = conversationId;

    if (!convId) {
      // conversation needs a projectId; use workspaceId as fallback
      const newConv = await this.repo.createConversation(userId, workspaceId, workspaceId, message.substring(0, 30));
      convId = newConv.id;
    }

    await this.repo.addMessage(convId, 'user', message);

    const context = await this.rag.retrieval.retrieveContext(message);
    const formattedPrompt = buildChatPrompt(context, message);

    const reply = await this.provider.generateText(formattedPrompt, { systemInstruction: SYSTEM_PROMPT });

    await this.repo.addMessage(convId, 'assistant', reply);

    return { conversationId: convId, reply };
  }

  public async getConversations(userId: string, workspaceId: string) {
    return this.repo.getUserConversations(userId, workspaceId);
  }

  public async getConversationById(id: string) {
    return this.repo.findConversationById(id);
  }
}