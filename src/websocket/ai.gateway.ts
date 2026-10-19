import { Server } from 'socket.io';
import { AuthenticatedSocket, SocketEvent, AISreamPayload } from './socketTypes';
import { AetherModelProvider } from '../modules/ai/llm/providers/aether-provider';
import { AETHER_BASE_SYSTEM_PROMPT } from '../modules/ai/prompts/system-prompts';
import { logger } from '../config';

export class AIGateway {
  private aiProvider: AetherModelProvider;

  constructor() {
    this.aiProvider = new AetherModelProvider();
  }

  public registerHandlers(io: Server, socket: AuthenticatedSocket): void {
    socket.on(SocketEvent.AI_PROMPT, async (payload: AISreamPayload) => {
      try {
        if (!payload.prompt || !payload.conversationId) {
          socket.emit(SocketEvent.AI_STREAM_ERROR, {
            error: 'Invalid payload: Prompt and conversationId are required.',
          });
          return;
        }

        logger.info(
          `Streaming AI response for user ${socket.user?.id} in conversation ${payload.conversationId}`,
        );

        let fullText = '';
        const streamResult = await this.aiProvider.generateStream(
          {
            requestId: `req_${Date.now()}`,
            modelId: 'qwen2.5-1.5b-instruct-q4km',
            messages: [
              { role: 'system', content: AETHER_BASE_SYSTEM_PROMPT },
              { role: 'user', content: payload.prompt },
            ],
            stream: true,
          },
          (chunk) => {
            const textDelta = chunk.delta || '';
            fullText += textDelta;
            socket.emit(SocketEvent.AI_STREAM_CHUNK, {
              conversationId: payload.conversationId,
              chunk: textDelta,
            });
          },
        );

        if (!streamResult.ok) {
          throw streamResult.error;
        }

        socket.emit(SocketEvent.AI_STREAM_COMPLETE, {
          conversationId: payload.conversationId,
          fullText,
        });
      } catch (error: any) {
        logger.error('WebSocket AI Streaming Error:', error);
        socket.emit(SocketEvent.AI_STREAM_ERROR, {
          conversationId: payload.conversationId,
          error: error.message || 'Failed to process AI stream request.',
        });
      }
    });
  }
}
