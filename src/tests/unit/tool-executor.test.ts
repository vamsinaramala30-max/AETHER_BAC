import { describe, it, expect, beforeAll } from 'vitest';
import { toolExecutor } from '../../modules/ai/tools/tool-executor.js';
import { toolRegistry } from '../../modules/ai/tools/tool-registry.js';
import type { ToolExecutionContext, ToolDefinition } from '../../modules/ai/tools/tool-types.js';

describe('ToolExecutor', () => {
  const dummyContext: ToolExecutionContext = {
    auth: {
      userId: 'user_1',
      sessionId: 'sess_1',
      roles: ['user'],
      permissions: ['*'],
    },
    traceId: 'trace_1',
  };

  const sampleTool: ToolDefinition<Record<string, unknown>, { message: string }> = {
    name: 'test_tool',
    description: 'Sample test tool',
    category: 'system',
    inputSchema: { type: 'object', properties: {} },
    requiredPermissions: [],
    handler: async () => ({ message: 'ok' }),
  };

  beforeAll(() => {
    if (!toolRegistry.has('test_tool')) {
      toolRegistry.register(sampleTool);
    }
  });

  it('should return TOOL_NOT_FOUND for non-existent tool', async () => {
    const res = await toolExecutor.execute('non_existent_tool_123', {}, dummyContext);
    expect(res.success).toBe(false);
    expect(res.code).toBe('TOOL_NOT_FOUND');
  });

  it('should execute registered test tool if present', async () => {
    const res = await toolExecutor.execute('test_tool', {}, dummyContext);
    expect(res.code).toBe('SUCCESS');
    expect(res.success).toBe(true);
  });

  it('should reject execution with FORBIDDEN if auth context or userId is missing', async () => {
    const unauthContext = {
      traceId: 'trace_no_auth',
    } as any;
    const res = await toolExecutor.execute('test_tool', {}, unauthContext);
    expect(res.success).toBe(false);
    expect(res.code).toBe('FORBIDDEN');
    expect(res.error).toContain('Missing or invalid authentication context');
  });

  it('should reject execution with FORBIDDEN if required permissions are missing', async () => {
    const restrictedTool: ToolDefinition<Record<string, unknown>, { message: string }> = {
      name: 'restricted_admin_tool',
      description: 'Restricted tool',
      category: 'system',
      inputSchema: { type: 'object', properties: {} },
      requiredPermissions: ['admin:manage'],
      handler: async () => ({ message: 'admin ok' }),
    };
    if (!toolRegistry.has('restricted_admin_tool')) {
      toolRegistry.register(restrictedTool);
    }

    const unprivilegedContext: ToolExecutionContext = {
      auth: {
        userId: 'user_regular',
        sessionId: 'sess_reg',
        roles: ['user'],
        permissions: ['tasks:read'],
      },
      traceId: 'trace_unprivileged',
    };

    const res = await toolExecutor.execute('restricted_admin_tool', {}, unprivilegedContext);
    expect(res.success).toBe(false);
    expect(res.code).toBe('FORBIDDEN');
    expect(res.error).toContain('Unauthorized to execute tool');
  });

  it('should sanitize and prevent model-supplied identity from overriding server-side context', async () => {
    let capturedInput: any = null;
    const identityCheckTool: ToolDefinition<Record<string, unknown>, { message: string }> = {
      name: 'identity_check_tool',
      description: 'Checks caller identity in input',
      category: 'system',
      inputSchema: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          workspaceId: { type: 'string' },
        },
      },
      requiredPermissions: [],
      handler: async (input) => {
        capturedInput = input;
        return { message: 'checked' };
      },
    };
    if (!toolRegistry.has('identity_check_tool')) {
      toolRegistry.register(identityCheckTool);
    }

    const spoofContext: ToolExecutionContext = {
      auth: {
        userId: 'server_trusted_user_id',
        sessionId: 'sess_spoof',
        roles: ['user'],
        permissions: ['*'],
        workspaceId: 'server_trusted_workspace_id',
      },
      traceId: 'trace_spoof',
    };

    const res = await toolExecutor.execute(
      'identity_check_tool',
      {
        userId: 'attacker_injected_user_id',
        workspaceId: 'attacker_injected_workspace_id',
      },
      spoofContext,
    );

    expect(res.success).toBe(true);
    expect(capturedInput.userId).toBe('server_trusted_user_id');
    expect(capturedInput.workspaceId).toBe('server_trusted_workspace_id');
  });
});
