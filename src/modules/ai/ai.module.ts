import { Request, Response, NextFunction } from 'express';
import { chatController } from './api/controllers/chat-controller.js';
import { aiController as coreAiController } from './api/controllers/ai-controller.js';
import { conversationController } from './api/controllers/conversation-controller.js';
import { modelController } from './api/controllers/model-controller.js';
import { buildDefaultAIConfig } from './ai-config.js';
import { ProviderManager } from './llm/provider-manager.js';
import { messageService } from './conversations/message-service.js';
import { memoryEngine } from './memory/memory-engine.js';
import type { IMemoryEngine } from './memory/memory-engine.js';
import { globalAiEngine } from './core/ai-engine.js';

import { CancelledError, TimeoutError } from './ai-errors.js';

interface ActiveStreamEntry {
  abortController: AbortController;
  requestId: string;
  createdAt: number;
}

export class AiExpressController {
  private static activeStreams = new Map<string, ActiveStreamEntry>();

  public async chat(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req.user as any)?.id || (req as any).userId || 'anonymous';
      const body = req.body || {};
      const message =
        body.message ||
        body.content ||
        (Array.isArray(body.messages) && body.messages[body.messages.length - 1]?.content) ||
        '';
      const conversationId = body.conversationId || body.conversation_id;
      const modelId = body.model || body.modelId || body.model_id;
      const providerMode = body.providerMode;
      const result = await chatController.chat(
        { message, conversationId, modelId, providerMode },
        userId,
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  public async stream(req: Request, res: Response, next: NextFunction): Promise<void> {
    const user = (req as any).user;
    const userId = user?.id || (req as any).userId || 'anonymous';
    const workspaceId = user?.workspaceId || (req as any).workspaceId;
    const body = req.body || {};
    const message =
      body.message ||
      body.content ||
      (Array.isArray(body.messages) && body.messages[body.messages.length - 1]?.content) ||
      '';
    const conversationId = body.conversationId || body.conversation_id || `conv_${Date.now()}`;
    const modelId = body.modelId || body.model_id || body.model;
    const providerMode = body.providerMode;
    const sessionId = body.sessionId || `sess_${userId}`;
    const requestId =
      body.requestId ||
      body.idempotencyKey ||
      `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const streamKey = `${userId}:${conversationId}`;
    const existing = AiExpressController.activeStreams.get(streamKey);
    if (existing) {
      const incomingReqId = body.requestId || body.idempotencyKey;
      if (incomingReqId && existing.requestId === incomingReqId) {
        res.status(409).json({
          error: 'DUPLICATE_REQUEST_IN_FLIGHT',
          message: 'An AI stream with this request identifier is currently processing.',
        });
        return;
      }
      // If a previous stream is still in progress for this conversation,
      // cancel it cleanly so the new user prompt takes precedence.
      existing.abortController.abort(new CancelledError('Stream superseded by a new user message'));
      AiExpressController.activeStreams.delete(streamKey);
    }

    const abortController = new AbortController();
    AiExpressController.activeStreams.set(streamKey, {
      abortController,
      requestId,
      createdAt: Date.now(),
    });

    const onClientClose = () => {
      if (!res.writableEnded && !abortController.signal.aborted) {
        abortController.abort(new CancelledError('Client disconnected'));
      }
    };
    req.on('close', onClientClose);

    const timeoutMs =
      typeof body.timeout === 'number' && body.timeout > 0 ? body.timeout : 120_000;
    const timeoutTimer = setTimeout(() => {
      if (!res.writableEnded && !abortController.signal.aborted) {
        abortController.abort(new TimeoutError('stream', timeoutMs));
      }
    }, timeoutMs);

    let terminalChunkEmitted = false;
    let accumulatedContent = '';

    const writeChunk = async (chunk: any): Promise<boolean> => {
      if (res.writableEnded || res.destroyed) return false;
      if (chunk?.isLast) {
        terminalChunkEmitted = true;
      }
      const payload = `data: ${JSON.stringify(chunk)}\n\n`;
      const ok = res.write(payload);
      if (!ok && !res.writableEnded && !res.destroyed) {
        await new Promise<void>((resolve) => {
          const onDrain = () => {
            cleanup();
            resolve();
          };
          const onClose = () => {
            cleanup();
            resolve();
          };
          const cleanup = () => {
            res.removeListener('drain', onDrain);
            res.removeListener('close', onClose);
          };
          res.once('drain', onDrain);
          res.once('close', onClose);
        });
      }
      return !res.writableEnded && !res.destroyed;
    };

    try {
      const auth = {
        userId,
        sessionId,
        roles: user?.role ? [user.role] : ['user'],
        permissions: ['*'],
        workspaceId,
      };

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      if (conversationId && message) {
        await messageService
          .addMessage({
            conversationId,
            userId,
            role: 'user',
            content: message,
          })
          .catch(() => {});
      }

      const result = await globalAiEngine.processStream(
        {
          requestId,
          userId,
          workspaceId,
          auth,
          sessionId,
          conversationId,
          message,
          options: { streaming: true, modelId, providerMode, timeout: timeoutMs },
          signal: abortController.signal,
          timestamp: Date.now(),
        },
        async (chunk: any) => {
          if (chunk?.delta) {
            accumulatedContent +=
              typeof chunk.delta === 'string' ? chunk.delta : chunk.delta.content ?? '';
          }
          await writeChunk(chunk);
        },
      );

      if (!res.writableEnded && !res.destroyed) {
        if (abortController.signal.aborted) {
          const isTimeout =
            abortController.signal.reason instanceof TimeoutError ||
            (abortController.signal.reason as any)?.code === 'TIMEOUT' ||
            (abortController.signal.reason as any)?.name === 'TimeoutError';
          if (!terminalChunkEmitted) {
            const errorMsg = isTimeout
              ? (abortController.signal.reason as any)?.message || 'Stream timed out'
              : undefined;
            await writeChunk({
              requestId,
              delta: '',
              index: 0,
              isLast: true,
              status: isTimeout ? 'failed' : 'cancelled',
              error: errorMsg,
              details: errorMsg,
              timestamp: Date.now(),
            });
          }
          res.end();
        } else if (!result.ok) {
          if (!terminalChunkEmitted) {
            await writeChunk({
              requestId,
              delta: '',
              index: 0,
              isLast: true,
              status: 'failed',
              error: result.error.message,
              details: result.error.message,
              timestamp: Date.now(),
            });
          }
          res.end();
        } else {
          if (!terminalChunkEmitted) {
            await writeChunk({
              requestId,
              delta: '',
              index: 0,
              isLast: true,
              status: 'completed',
              timestamp: Date.now(),
            });
          }
          // Emit [DONE] ONLY on successful terminal completion
          res.write('data: [DONE]\n\n');
          res.end();
        }
      }

      if (
        result.ok &&
        conversationId &&
        accumulatedContent.trim() &&
        !abortController.signal.aborted
      ) {
        await messageService
          .addMessage({
            conversationId,
            userId,
            role: 'assistant',
            content: accumulatedContent,
          })
          .catch(() => {});
      }
    } catch (err) {
      if (!res.headersSent) {
        next(err);
      } else if (!res.writableEnded && !res.destroyed) {
        if (!terminalChunkEmitted) {
          const errMsg = err instanceof Error ? err.message : String(err);
          res.write(
            `data: ${JSON.stringify({
              requestId,
              delta: '',
              index: 0,
              isLast: true,
              status: 'failed',
              error: errMsg,
              details: errMsg,
              timestamp: Date.now(),
            })}\n\n`,
          );
        }
        res.end();
      }
    } finally {
      clearTimeout(timeoutTimer);
      req.removeListener('close', onClientClose);
      const current = AiExpressController.activeStreams.get(streamKey);
      if (current?.requestId === requestId) {
        AiExpressController.activeStreams.delete(streamKey);
      }
      if (!res.writableEnded && !res.destroyed) {
        res.end();
      }
    }
  }

  public async generatePrompt(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req.user as any)?.id || (req as any).userId || 'anonymous';
      const sessionId = (req as any).sessionID || `sess_${userId}`;
      const result = await coreAiController.processRequest(req.body, userId, sessionId);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  public async getConversations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req.user as any)?.id || (req as any).userId || 'anonymous';
      const result = await conversationController.list(userId);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  public async getConversationById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req.user as any)?.id || (req as any).userId || 'anonymous';
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ success: false, error: { message: 'Missing conversation id' } });
        return;
      }
      const result = await conversationController.get(id, userId);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  public async createConversation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req.user as any)?.id || (req as any).userId || 'anonymous';
      const body = req.body || {};
      const result = await conversationController.create(body, userId);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  public async renameConversation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req.user as any)?.id || (req as any).userId || 'anonymous';
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ success: false, error: { message: 'Missing conversation id' } });
        return;
      }
      const body = req.body || {};
      const result = await conversationController.rename(id, body, userId);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  public async deleteConversation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req.user as any)?.id || (req as any).userId || 'anonymous';
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ success: false, error: { message: 'Missing conversation id' } });
        return;
      }
      const result = await conversationController.delete(id, userId);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  public async getMessages(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req.user as any)?.id || (req as any).userId || 'anonymous';
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ success: false, error: { message: 'Missing conversation id' } });
        return;
      }
      const msgs = await messageService.getMessages(id, userId);
      res.status(200).json({ success: true, data: msgs });
    } catch (err) {
      next(err);
    }
  }

  public async addMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req.user as any)?.id || (req as any).userId || 'anonymous';
      const { id } = req.params;
      const body = req.body || {};
      if (!id || !body.content) {
        res
          .status(400)
          .json({ success: false, error: { message: 'Missing conversation id or content' } });
        return;
      }
      const msg = await messageService.addMessage({
        conversationId: id,
        userId,
        role: body.role || 'user',
        content: body.content,
      });
      res.status(201).json({ success: true, data: msg });
    } catch (err) {
      next(err);
    }
  }

  public async deleteMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req.user as any)?.id || (req as any).userId || 'anonymous';
      const { id, messageId } = req.params;
      if (!id) {
        res.status(400).json({ success: false, error: { message: 'Missing conversation id' } });
        return;
      }
      if (messageId) {
        // Single message delete
        await messageService.deleteMessagesByConversation(id, userId);
      } else {
        await messageService.deleteMessagesByConversation(id, userId);
      }
      res.status(200).json({ success: true, data: { deleted: true } });
    } catch (err) {
      next(err);
    }
  }

  public async getHealth(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const config = buildDefaultAIConfig();
      const manager = new ProviderManager(config);
      const aetherProvider = manager.getProvider('aether');
      const providerStatus = await aetherProvider.healthCheck();
      res.status(200).json({
        success: true,
        status: {
          runtimeType: 'aether',
          status: providerStatus.status === 'available' ? 'healthy' : providerStatus.status,
          message: providerStatus.message,
          checkedAt: providerStatus.checkedAt,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  public async getProvidersStatus(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const config = buildDefaultAIConfig();
      const manager = new ProviderManager(config);
      const statuses = await manager.getAllProviderStatuses();
      res.status(200).json({ success: true, data: statuses });
    } catch (err) {
      next(err);
    }
  }
}

export class ModelsExpressController {
  public async getModels(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
      const result = await modelController.listModels();
      res.status(200).json(result);
    } catch (err) {
      if (next) {
        next(err);
      } else {
        res.status(500).json({ success: false, error: (err as Error).message });
      }
    }
  }

  public async getModelById(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      if (id === 'status') {
        const result = await modelController.getRuntimeStatus();
        res.status(200).json(result);
        return;
      }
      const modelsResult = await modelController.listModels();
      if (modelsResult.success && Array.isArray(modelsResult.data)) {
        const found = modelsResult.data.find((m: any) => m.id === id || m.name === id);
        if (found) {
          res.status(200).json({ success: true, data: found });
          return;
        }
      }
      res.status(200).json({ success: true, data: { id, name: id, status: 'available' } });
    } catch (err) {
      if (next) {
        next(err);
      } else {
        res.status(500).json({ success: false, error: (err as Error).message });
      }
    }
  }
}

export class MemoryExpressController {
  constructor(private readonly engine: IMemoryEngine = memoryEngine) {}

  public async getMemories(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req.user as any)?.id || (req as any).userId || 'anonymous';
      const result = await this.engine.getAllMemory(userId);
      if (!result.ok) {
        res.status(500).json({ success: false, error: { message: result.error.message } });
        return;
      }
      res.status(200).json({ success: true, data: result.value });
    } catch (err) {
      next(err);
    }
  }

  public async getMemoryById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req.user as any)?.id || (req as any).userId || 'anonymous';
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ success: false, error: { message: 'Missing memory id' } });
        return;
      }
      const result = await this.engine.getMemoryById(id, userId);
      if (!result.ok) {
        res.status(404).json({ success: false, error: { message: result.error.message } });
        return;
      }
      res.status(200).json({ success: true, data: result.value });
    } catch (err) {
      next(err);
    }
  }

  public async createMemory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req.user as any)?.id || (req as any).userId || 'anonymous';
      const body = req.body || {};
      const content = body.content || body.fact || body.text;
      if (!content || typeof content !== 'string') {
        res.status(400).json({ success: false, error: { message: 'Missing memory content' } });
        return;
      }
      const result = await this.engine.createMemory({
        userId,
        workspaceId: body.workspaceId,
        projectId: body.projectId,
        scope: body.scope,
        type: body.category || body.type || 'fact',
        content: content.trim(),
        importance: body.importance ?? (body.importanceScore ? body.importanceScore / 10 : 0.7),
        confidence: body.confidence ?? 'user_provided',
        ttlMs: body.ttlMs,
        metadata: body.metadata,
      });
      if (!result.ok) {
        res.status(500).json({ success: false, error: { message: result.error.message } });
        return;
      }
      res.status(201).json({ success: true, data: result.value });
    } catch (err) {
      next(err);
    }
  }

  public async updateMemory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req.user as any)?.id || (req as any).userId || 'anonymous';
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ success: false, error: { message: 'Missing memory id' } });
        return;
      }
      const body = req.body || {};
      const result = await this.engine.updateMemory({
        id,
        userId,
        workspaceId: body.workspaceId,
        projectId: body.projectId,
        content: body.content,
        importance: body.importance,
        confidence: body.confidence,
        metadata: body.metadata,
      });
      if (!result.ok) {
        res.status(404).json({ success: false, error: { message: result.error.message } });
        return;
      }
      res.status(200).json({ success: true, data: result.value });
    } catch (err) {
      next(err);
    }
  }

  public async deleteMemory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req.user as any)?.id || (req as any).userId || 'anonymous';
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ success: false, error: { message: 'Missing memory id' } });
        return;
      }
      const result = await this.engine.deleteMemory(id, userId);
      if (!result.ok) {
        res.status(404).json({ success: false, error: { message: result.error.message } });
        return;
      }
      res.status(200).json({ success: true, data: { deleted: true } });
    } catch (err) {
      next(err);
    }
  }

  public async searchMemories(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req.user as any)?.id || (req as any).userId || 'anonymous';
      const body = req.body || {};
      const result = await this.engine.searchMemory({
        userId,
        text: body.text || body.query,
        workspaceId: body.workspaceId,
        projectId: body.projectId,
        scope: body.scope,
        topK: body.topK || body.limit || 10,
        scoreThreshold: body.scoreThreshold,
      });
      if (!result.ok) {
        res.status(500).json({ success: false, error: { message: result.error.message } });
        return;
      }
      res.status(200).json({ success: true, data: result.value });
    } catch (err) {
      next(err);
    }
  }
}

import { ToolsExpressController } from './api/controllers/tools-controller.js';
import { PlanExpressController } from './api/controllers/plan-controller.js';
import { ExecutionController } from './execution/execution-controller.js';
import { DiagnosticController, diagnosticController } from './observability/diagnostic.controller.js';

export class AiModule {
  public readonly aiController: AiExpressController;
  public readonly modelsController: ModelsExpressController;
  public readonly memoryController: MemoryExpressController;
  public readonly toolsController: ToolsExpressController;
  public readonly plansController: PlanExpressController;
  public readonly executionController: ExecutionController;
  public readonly diagnosticController: DiagnosticController;

  constructor() {
    this.aiController = new AiExpressController();
    this.modelsController = new ModelsExpressController();
    this.memoryController = new MemoryExpressController();
    this.toolsController = new ToolsExpressController();
    this.plansController = new PlanExpressController();
    this.executionController = new ExecutionController();
    this.diagnosticController = diagnosticController;
  }
}

