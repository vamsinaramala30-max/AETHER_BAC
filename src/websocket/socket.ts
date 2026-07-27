import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { SocketServer } from './socketServer';

export const initWebSocketServer = (httpServer: HttpServer): Server => {
  return SocketServer.getInstance().initialize(httpServer);
};

export const getIO = (): Server => {
  return SocketServer.getInstance().getIO();
};
