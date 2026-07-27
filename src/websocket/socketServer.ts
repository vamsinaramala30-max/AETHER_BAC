import { Server as HttpServer } from 'http';
import { Server, ServerOptions } from 'socket.io';
import { corsConfig, logger } from '../config';
import { socketAuthMiddleware } from './socketAuth';
import { AuthenticatedSocket, SocketEvent } from './socketTypes';
import { SOCKET_ROOMS } from './socketEvents';
import { AIGateway } from './ai.gateway';
import { WorkspaceGateway } from './workspace.gateway';
import { ProjectGateway } from './project.gateway';

export class SocketServer {
  private static instance: SocketServer;
  private io!: Server;
  private aiGateway: AIGateway;
  private workspaceGateway: WorkspaceGateway;
  private projectGateway: ProjectGateway;

  private constructor() {
    this.aiGateway = new AIGateway();
    this.workspaceGateway = new WorkspaceGateway();
    this.projectGateway = new ProjectGateway();
  }

  public static getInstance(): SocketServer {
    if (!SocketServer.instance) {
      SocketServer.instance = new SocketServer();
    }
    return SocketServer.instance;
  }

  public initialize(httpServer: HttpServer, options?: Partial<ServerOptions>): Server {
    this.io = new Server(httpServer, {
      cors: corsConfig,
      path: '/socket.io',
      pingTimeout: 60000,
      pingInterval: 25000,
      ...options,
    });

    // Guard with Authentication Middleware
    this.io.use(socketAuthMiddleware);

    this.io.on(SocketEvent.CONNECT, (socket: AuthenticatedSocket) => {
      const userId = socket.user?.id;
      logger.info(`WebSocket Client Connected: ${socket.id} (User ID: ${userId})`);

      if (userId) {
        // Auto-join personal user channel
        socket.join(SOCKET_ROOMS.user(userId));
      }

      // Register feature gateways
      this.aiGateway.registerHandlers(this.io, socket);
      this.workspaceGateway.registerHandlers(this.io, socket);
      this.projectGateway.registerHandlers(this.io, socket);

      socket.on(SocketEvent.DISCONNECT, (reason: string) => {
        logger.info(`WebSocket Client Disconnected: ${socket.id}, Reason: ${reason}`);
      });
    });

    logger.info('Socket.IO Server initialized successfully.');
    return this.io;
  }

  public getIO(): Server {
    if (!this.io) {
      throw new Error('Socket.IO instance has not been initialized yet.');
    }
    return this.io;
  }
}
