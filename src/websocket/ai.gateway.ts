import { Server } from 'socket.io';
import { AuthenticatedSocket, SocketEvent, AISreamPayload } from './socketTypes';
import { OllamaProvider } from '../modules/ai/providers/ollama.provider';
import { SYSTEM_PROMPT } from '../modules/ai/prompts/system.prompt';
import { logger } from '../config';

export class AIGateway {
  private aiProvider: OllamaProvider;

  constructor() {
    this.aiProvider = new OllamaProvider();
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
        await this.aiProvider.generateStream(
          [{ role: 'user', content: payload.prompt }],
          { model: 'llama3.1:8b', systemPrompt: SYSTEM_PROMPT },
          (chunk: string) => {
            fullText += chunk;
            socket.emit(SocketEvent.AI_STREAM_CHUNK, {
              conversationId: payload.conversationId,
              chunk,
            });
          },
        );

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
