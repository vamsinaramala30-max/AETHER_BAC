import helmet from 'helmet';
import { securityConfig } from '../config';

/**
 * Wrapper exporting standard Helmet security header middleware configured for modern APIs.
 */
export const securityHeaders = helmet(securityConfig.helmet);
