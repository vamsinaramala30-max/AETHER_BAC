import cors from 'cors';
import { corsConfig } from '../config';

/**
 * Cross-Origin Resource Sharing (CORS) middleware using centralized CORS configuration.
 */
export const corsMiddleware = cors(corsConfig);
