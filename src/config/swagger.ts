import { Options } from 'swagger-jsdoc';
import { env } from './env';

export const swaggerConfig: Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'AETHER Platform API Specification',
      version: '1.0.0',
      description: 'Production API documentation for the AETHER Backend Suite',
      contact: {
        name: 'AETHER Engineering Team',
        email: 'engineering@aether.internal',
      },
    },
    servers: [
      {
        url: `${env.APP_URL}${env.API_PREFIX}`,
        description: `${env.NODE_ENV} Server`,
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./src/routes/*.ts', './src/modules/**/*.routes.ts', './src/modules/**/*.types.ts'],
};
