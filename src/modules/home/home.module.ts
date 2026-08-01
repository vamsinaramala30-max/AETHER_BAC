import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { createHomeRouter } from './home.routes';

export class HomeModule {
  public static init(prisma: PrismaClient): Router {
    return createHomeRouter(prisma);
  }
}