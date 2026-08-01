import { AIProviderAdapter } from './assistant.types';
import { AssistantUtils } from './assistant.utils';

export class AssistantTitleGenerator {
  static async generateTitle(
    firstMessageContent: string,
    aiAdapter?: AIProviderAdapter
  ): Promise<string> {
    if (!aiAdapter) {
      return AssistantUtils.generateTitleFromContent(firstMessageContent);
    }

    try {
      const response = await aiAdapter.generateCompletion({
        messages: [
          {
            role: 'system' as any,
            content: 'Summarize the user message in 3 to 6 words to use as a conversation title. Return ONLY the title.',
          },
          {
            role: 'user' as any,
            content: firstMessageContent,
          },
        ],
        temperature: 0.3,
      });

      return response.content.trim().replace(/^["']|["']$/g, '') || AssistantUtils.generateTitleFromContent(firstMessageContent);
    } catch {
      return AssistantUtils.generateTitleFromContent(firstMessageContent);
    }
  }
}