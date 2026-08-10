/**
 * AETHER AI — Tool Types
 * Strict type definitions for the tool subsystem.
 * Every tool must define: name, description, input schema,
 * permission requirements, execution handler, and typed output.
 */

// ─── JSON Schema Types ───────────────────────────────────────────────────────

export type JSONSchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array';

export interface JSONSchemaProperty {
  readonly type: JSONSchemaType;
  readonly description?: string;
  readonly enum?: readonly (string | number | boolean)[];
  readonly items?: JSONSchemaProperty;
  readonly properties?: Readonly<Record<string, JSONSchemaProperty>>;
  readonly required?: readonly string[];
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly default?: string | number | boolean;
}

export interface ToolInputSchema {
  readonly type: 'object';
  readonly properties: Readonly<Record<string, JSONSchemaProperty>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
}

// ─── Authentication / Authorization Context ──────────────────────────────────

export interface AuthenticationContext {
  readonly userId: string;
  readonly sessionId: string;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
}

// ─── Tool Execution Context ──────────────────────────────────────────────────

export interface ToolExecutionContext {
  readonly auth: AuthenticationContext;
  readonly traceId: string;
  readonly conversationId?: string;
  readonly requestId?: string;
  readonly signal?: AbortSignal;
}

// ─── Tool Result ─────────────────────────────────────────────────────────────

export type ToolResultCode =
  | 'SUCCESS'
  | 'TOOL_NOT_FOUND'
  | 'FORBIDDEN'
  | 'INVALID_INPUT'
  | 'TOOL_EXECUTION_FAILED'
  | 'TIMEOUT'
  | 'CANCELLED';

export interface ToolResult<T = unknown> {
  readonly success: boolean;
  readonly code: ToolResultCode;
  readonly data?: T;
  readonly error?: string;
  readonly executionTimeMs: number;
}

// ─── Tool Definition ─────────────────────────────────────────────────────────

export interface ToolDefinition<TInput extends object = Record<string, unknown>, TOutput = unknown> {
  readonly name: string;
  readonly description: string;
  readonly category: ToolCategory;
  readonly inputSchema: ToolInputSchema;
  readonly requiredPermissions: readonly string[];
  readonly timeoutMs?: number;
  handler(input: TInput, context: ToolExecutionContext): Promise<TOutput>;
}

export type ToolCategory = 'tasks' | 'projects' | 'knowledge' | 'workspace' | 'system' | 'automation';

// ─── Tool Listing (public-safe, no handler exposed) ──────────────────────────

export interface ToolDescriptor {
  readonly name: string;
  readonly description: string;
  readonly category: ToolCategory;
  readonly inputSchema: ToolInputSchema;
  readonly requiredPermissions: readonly string[];
}

// ─── Tool Invocation Request ─────────────────────────────────────────────────

export interface ToolInvocation {
  readonly toolName: string;
  readonly input: Record<string, unknown>;
  readonly context: ToolExecutionContext;
}
