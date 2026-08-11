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

  const sampleTool: ToolDefinition<{}, { message: string }> = {
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
});
