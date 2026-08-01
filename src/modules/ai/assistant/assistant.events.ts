import { EventEmitter } from 'events';
import { ASSISTANT_CONSTANTS } from './assistant.constants';
import { Conversation, Message } from './assistant.types';

export class AssistantEventEmitter extends EventEmitter {
  private static instance: AssistantEventEmitter;

  private constructor() {
    super();
  }

  public static getInstance(): AssistantEventEmitter {
    if (!AssistantEventEmitter.instance) {
      AssistantEventEmitter.instance = new AssistantEventEmitter();
    }
    return AssistantEventEmitter.instance;
  }

  emitConversationCreated(conversation: Conversation): void {
    this.emit(ASSISTANT_CONSTANTS.EVENTS.CONVERSATION_CREATED, conversation);
  }

  emitMessageCompleted(message: Message): void {
    this.emit(ASSISTANT_CONSTANTS.EVENTS.MESSAGE_COMPLETED, message);
  }

  emitMessageFailed(messageId: string, error: string): void {
    this.emit(ASSISTANT_CONSTANTS.EVENTS.MESSAGE_FAILED, { messageId, error, timestamp: new Date() });
  }
}

export const assistantEventEmitter = AssistantEventEmitter.getInstance();
