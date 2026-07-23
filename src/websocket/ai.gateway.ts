import { Server } from 'socket.io';
import { AuthenticatedSocket, SocketEvent, AISreamPayload } from './socketTypes';
import { GeminiProvider } from '../modules/ai/providers/gemini.provider';
import { SYSTEM_PROMPT } from '../modules/ai/prompts/system.prompt';
import { logger } from '../config';

export class AIGateway {
  private aiProvider: GeminiProvider;

  constructor() {
    this.aiProvider = new GeminiProvider();
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

        logger.info(`Streaming AI response for user ${socket.user?.id} in conversation ${payload.conversationId}`);

        // Generate response using provider
        const fullText = await this.aiProvider.generateText(payload.prompt, {
          systemInstruction: SYSTEM_PROMPT,
        });

        // Chunking output for stream simulation
        const chunkSize = 20;
        for (let i = 0; i < fullText.length; i += chunkSize) {
          const chunk = fullText.slice(i, i + chunkSize);
          socket.emit(SocketEvent.AI_STREAM_CHUNK, {
            conversationId: payload.conversationId,
            chunk,
          });
          // Small artificial delay for natural streaming pulse
          await new Promise((resolve) => setTimeout(resolve, 30));
        }

        socket.emit(SocketEvent.AI_STREAM_COMPLETE, {
          conversationId: payload.conversationId,
          fullText,
        });
      } catch (error) {
        logger.error('WebSocket AI Streaming Error:', error);
        socket.emit(SocketEvent.AI_STREAM_ERROR, {
          conversationId: payload.conversationId,
          error: 'Failed to process AI stream request.',
        });
      }
    });
  }
}