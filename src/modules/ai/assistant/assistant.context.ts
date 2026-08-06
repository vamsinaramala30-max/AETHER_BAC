import { ASSISTANT_CONSTANTS } from './assistant.constants';
import { Message, MessageRole } from './assistant.types';
import { AssistantUtils } from './assistant.utils';

export class AssistantContextManager {
  public static trimContextWindow(
    messages: Message[],
    maxTokens: number = ASSISTANT_CONSTANTS.CONTEXT.MAX_TOKEN_WINDOW -
      ASSISTANT_CONSTANTS.CONTEXT.RESERVED_COMPLETION_TOKENS,
    systemPrompt?: string,
  ): { role: MessageRole; content: string }[] {
    let currentTokens = 0;

    if (systemPrompt) {
      const systemTokens = AssistantUtils.estimateTokenCount(systemPrompt);
      currentTokens += systemTokens;
    }

    const reversed: { role: MessageRole; content: string }[] = [];

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const tokens = msg.metadata.totalTokens || AssistantUtils.estimateTokenCount(msg.content);

      if (currentTokens + tokens > maxTokens) {
        break;
      }

      currentTokens += tokens;
      reversed.push({
        role: msg.role,
        content: msg.content,
      });
    }

    const truncatedHistory = reversed.reverse();

    if (systemPrompt) {
      return [{ role: MessageRole.SYSTEM, content: systemPrompt }, ...truncatedHistory];
    }

    return truncatedHistory;
  }
}
