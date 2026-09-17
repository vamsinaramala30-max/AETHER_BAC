/**
 * AETHER AI — Input Validation Middleware Abstraction
 * Enforces schema validation and strict input limits on incoming requests.
 */

import type { ToolInputSchema } from '../../tools/tool-types.js';
import { ToolValidator } from '../../tools/tool-validator.js';

const validator = new ToolValidator();

export interface ValidationMiddlewareResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export function validateInput(input: unknown, schema: ToolInputSchema): ValidationMiddlewareResult {
  const result = validator.validate(input, schema);
  return {
    valid: result.valid,
    errors: result.errors,
  };
}
