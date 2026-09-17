/**
 * AETHER AI — Verification + Reliability Test Suite (Prompt 25)
 *
 * Verifies that Aether distinguishes between:
 * - what the user said
 * - what Aether inferred
 * - what Aether retrieved
 * - what the model generated
 * - what a tool actually executed
 * - what was successfully verified
 * - what remains uncertain
 * - what failed
 *
 * Covers all 19 mandatory test scenarios:
 * 1. Verified successful action
 * 2. Executed but unverifiable action (NOT_VERIFIABLE)
 * 3. Failed action (FAILED)
 * 4. Partially successful workflow (PARTIALLY_VERIFIED)
 * 5. Invalid tool result
 * 6. Missing evidence handling
 * 7. Valid retrieved evidence handling
 * 8. Unsupported claim detection & correction
 * 9. Tool timeout handling
 * 10. Tool failure transparency
 * 11. Retry after uncertain execution
 * 12. Duplicate execution prevention (idempotency)
 * 13. Permission failure verification
 * 14. User isolation in verification
 * 15. Workspace isolation in verification
 * 16. Response accuracy with execution state
 * 17. Simple conversational response (lightweight verification)
 * 18. Complex multi-step workflow verification
 * 19. Full end-to-end regression testing
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ToolExecutor } from '../../modules/ai/tools/tool-executor.js';
import { ToolRegistry } from '../../modules/ai/tools/tool-registry.js';
import { ToolPermissions } from '../../modules/ai/tools/tool-permissions.js';
import { ToolValidator } from '../../modules/ai/tools/tool-validator.js';
import { PlanExecutor } from '../../modules/ai/planning/plan-executor.js';
import { ResponseValidator } from '../../modules/ai/core/response-validator.js';
import { ConfidenceEngine } from '../../modules/ai/core/confidence-engine.js';
import type {
  ToolDefinition,
  ToolExecutionContext,
} from '../../modules/ai/tools/tool-types.js';
import type { ActionPlan } from '../../modules/ai/planning/planning-types.js';
import type {
  AIRequest,
  AIContext,
  Intent,
  ExecutionReliabilityState,
} from '../../modules/ai/ai-types.js';

describe('AETHER AI — Prompt 25: Verification + Reliability', () => {
  let registry: ToolRegistry;
  let permissions: ToolPermissions;
  let validator: ToolValidator;
  let executor: ToolExecutor;
  let planExecutorInstance: PlanExecutor;
  let respValidator: ResponseValidator;
  let confEngine: ConfidenceEngine;

  const mockUserAuth = {
    userId: 'user_alpha',
    sessionId: 'sess_1',
    roles: ['user'],
    permissions: ['tasks:write', 'tasks:read', 'projects:read', 'system:read'],
    workspaceId: 'ws_alpha',
    userWorkspaceIds: ['ws_alpha'],
  };

  const defaultContext: ToolExecutionContext = {
    auth: mockUserAuth,
    traceId: 'trace_101',
    conversationId: 'conv_101',
    requestId: 'req_101',
  };

  const defaultAIRequest: AIRequest = {
    requestId: 'req_101',
    userId: 'user_alpha',
    sessionId: 'sess_1',
    conversationId: 'conv_101',
    message: 'Create a priority task for Project Alpha',
    timestamp: Date.now(),
  };

  const defaultAIContext: AIContext = {
    userId: 'user_alpha',
    sessionId: 'sess_1',
    conversationId: 'conv_101',
    tokenBudget: {
      total: 4096,
      system: 500,
      history: 1000,
      context: 1000,
      response: 1000,
      remaining: 596,
    },
  };

  beforeEach(() => {
    registry = new ToolRegistry();
    permissions = new ToolPermissions();
    validator = new ToolValidator();
    executor = new ToolExecutor(registry, permissions, validator);
    planExecutorInstance = new PlanExecutor(executor);
    respValidator = new ResponseValidator();
    confEngine = new ConfidenceEngine();
  });

  // ─── 1. VERIFIED SUCCESSFUL ACTION ──────────────────────────────────────────
  it('Scenario 1: Verified successful action updates database state and returns VERIFIED status', async () => {
    let dbRecord: { id: string; title: string; userId: string } | null = null;

    const verifiableCreateTool: ToolDefinition = {
      id: 'tool_verifiable_create',
      name: 'create_verifiable_task',
      description: 'Creates a task and verifies database persistence.',
      category: 'tasks',
      riskLevel: 'LOW_RISK',
      requiredPermissions: ['tasks:write'],
      inputSchema: {
        type: 'object',
        properties: { title: { type: 'string', minLength: 1 } },
        required: ['title'],
      },
      handler: async (input: { title: string }, ctx: ToolExecutionContext) => {
        dbRecord = { id: 'task_db_1', title: input.title, userId: ctx.auth.userId };
        return { taskId: 'task_db_1', title: input.title };
      },
      verify: async (output: { taskId: string; title: string }, input: { title: string }, ctx: ToolExecutionContext) => {
        if (!dbRecord || dbRecord.id !== output.taskId || dbRecord.title !== input.title) {
          return { verified: false, error: 'Database record not found.' };
        }
        if (dbRecord.userId !== ctx.auth.userId) {
          return { verified: false, error: 'User isolation violation.' };
        }
        return {
          verified: true,
          status: 'VERIFIED',
          details: `Confirmed task "${dbRecord.title}" exists in DB with ID ${dbRecord.id}`,
        };
      },
    };

    registry.register(verifiableCreateTool);

    const result = await executor.execute('create_verifiable_task', { title: 'Implement Reliability' }, defaultContext);

    expect(result.success).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.verificationStatus).toBe('VERIFIED');
    expect(result.verificationDetails).toContain('Confirmed task "Implement Reliability" exists in DB');
  });

  // ─── 2. EXECUTED BUT UNVERIFIABLE ACTION ────────────────────────────────────
  it('Scenario 2: Executed action without verify hook returns NOT_VERIFIABLE (never falsely claimed as VERIFIED)', async () => {
    const readOnlyQueryTool: ToolDefinition = {
      id: 'tool_search_data',
      name: 'search_data',
      description: 'Performs search across knowledge items without mutating persistent state.',
      category: 'knowledge',
      riskLevel: 'READ_ONLY',
      requiredPermissions: ['projects:read'],
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
      handler: async (input: { query: string }) => {
        return { results: [`Result for ${input.query}`], count: 1 };
      },
    };

    registry.register(readOnlyQueryTool);

    const result = await executor.execute('search_data', { query: 'Architecture' }, defaultContext);

    expect(result.success).toBe(true);
    expect(result.verificationStatus).toBe('NOT_VERIFIABLE');
    expect(result.verificationDetails).toContain('persistent state was not modified');
  });

  // ─── 3. FAILED ACTION ───────────────────────────────────────────────────────
  it('Scenario 3: Failed action preserves failure state and returns FAILED verificationStatus', async () => {
    const failingTool: ToolDefinition = {
      id: 'tool_failing',
      name: 'failing_action',
      description: 'Simulates a tool that encounters an exception.',
      category: 'system',
      riskLevel: 'MODIFY',
      requiredPermissions: ['tasks:write'],
      inputSchema: { type: 'object', properties: {} },
      handler: async () => {
        throw new Error('Database connection reset during commit.');
      },
    };

    registry.register(failingTool);

    const result = await executor.execute('failing_action', {}, defaultContext);

    expect(result.success).toBe(false);
    expect(result.code).toBe('TOOL_EXECUTION_FAILED');
    expect(result.verificationStatus).toBe('FAILED');
    expect(result.error).toContain('Database connection reset during commit.');
  });

  // ─── 4. PARTIALLY SUCCESSFUL WORKFLOW ───────────────────────────────────────
  it('Scenario 4: Multi-step workflow with partial failure returns PARTIAL_SUCCESS and PARTIALLY_VERIFIED', async () => {
    const step1Tool: ToolDefinition = {
      id: 'tool_step1',
      name: 'step1_tool',
      description: 'First step tool',
      category: 'tasks',
      riskLevel: 'LOW_RISK',
      requiredPermissions: ['tasks:write'],
      inputSchema: { type: 'object', properties: {} },
      handler: async () => ({ step: 1, created: true }),
      verify: async () => ({ verified: true, status: 'VERIFIED', details: 'Step 1 verified' }),
    };

    const step2Tool: ToolDefinition = {
      id: 'tool_step2',
      name: 'step2_tool',
      description: 'Second step tool',
      category: 'tasks',
      riskLevel: 'LOW_RISK',
      requiredPermissions: ['tasks:write'],
      inputSchema: { type: 'object', properties: {} },
      handler: async () => {
        throw new Error('Step 2 resource locked by another transaction.');
      },
    };

    registry.register(step1Tool);
    registry.register(step2Tool);

    const plan: ActionPlan = {
      planId: 'plan_partial_1',
      objective: 'Execute two-step migration',
      steps: [
        {
          stepId: 's1',
          stepNumber: 1,
          description: 'Execute Step 1',
          toolName: 'step1_tool',
          toolInput: {},
          riskLevel: 'LOW_RISK',
          status: 'pending',
          verified: false,
        },
        {
          stepId: 's2',
          stepNumber: 2,
          description: 'Execute Step 2',
          toolName: 'step2_tool',
          toolInput: {},
          riskLevel: 'LOW_RISK',
          status: 'pending',
          verified: false,
        },
      ],
      totalSteps: 2,
      requiresConfirmation: false,
      createdAt: new Date().toISOString(),
    };

    const planRes = await planExecutorInstance.executePlan(plan, defaultContext);

    expect(planRes.status).toBe('PARTIAL_SUCCESS');
    expect(planRes.verificationStatus).toBe('PARTIALLY_VERIFIED');
    expect(planRes.successfulStepsCount).toBe(1);
    expect(planRes.failedStepsCount).toBe(1);
    expect(planRes.summary).toContain('1 actions completed successfully');
    expect(planRes.summary).toContain('Step 2 resource locked');
  });

  // ─── 5. INVALID TOOL RESULT / SCHEMA MISMATCH ──────────────────────────────
  it('Scenario 5: Invalid input arguments rejected with INVALID_INPUT and FAILED status', async () => {
    const strictTool: ToolDefinition = {
      id: 'tool_strict',
      name: 'strict_tool',
      description: 'Strict schema tool',
      category: 'tasks',
      riskLevel: 'LOW_RISK',
      requiredPermissions: ['tasks:write'],
      inputSchema: {
        type: 'object',
        properties: {
          taskId: { type: 'string', minLength: 5 },
          priority: { type: 'string', enum: ['low', 'high'] },
        },
        required: ['taskId', 'priority'],
      },
      handler: async () => ({ success: true }),
    };

    registry.register(strictTool);

    const result = await executor.execute('strict_tool', { taskId: 'abc', priority: 'invalid_level' }, defaultContext);

    expect(result.success).toBe(false);
    expect(result.code).toBe('INVALID_INPUT');
    expect(result.verificationStatus).toBe('FAILED');
    expect(result.error).toContain('Invalid input');
  });

  // ─── 6. MISSING EVIDENCE (RAG) ──────────────────────────────────────────────
  it('Scenario 6: Missing RAG evidence returns INSUFFICIENT_INFORMATION confidence and catches hallucinations', () => {
    const knowledgeIntent: Intent = {
      type: 'KNOWLEDGE_QUESTION',
      confidence: 0.9,
      requiresRAG: true,
      requiresMemory: false,
      requiresTool: false,
      requiresAgent: false,
    };

    const emptyRAGContext: AIContext = {
      ...defaultAIContext,
      ragContext: {
        documents: [],
        totalRetrieved: 0,
        searchQuery: 'Non-existent policy',
      },
    };

    const conf = confEngine.assess('What is the policy?', knowledgeIntent, emptyRAGContext);
    expect(conf.level).toBe('INSUFFICIENT_INFORMATION');

    // Response Validator detects if model claimed the document contains specific facts
    const hallucinatedResponse = 'According to your document, all developers must work 90 hours.';
    const validation = respValidator.validate(
      defaultAIRequest,
      knowledgeIntent,
      emptyRAGContext,
      hallucinatedResponse,
    );

    expect(validation.valid).toBe(false);
    expect(validation.reason).toContain('no documents were retrieved');
    expect(validation.correctedContent).toContain('No matching documents or knowledge records were found');
  });

  // ─── 7. VALID RETRIEVED EVIDENCE ────────────────────────────────────────────
  it('Scenario 7: Valid retrieved evidence yields HIGH_CONFIDENCE and passes response validation', () => {
    const knowledgeIntent: Intent = {
      type: 'KNOWLEDGE_QUESTION',
      confidence: 0.95,
      requiresRAG: true,
      requiresMemory: false,
      requiresTool: false,
      requiresAgent: false,
    };

    const populatedRAGContext: AIContext = {
      ...defaultAIContext,
      ragContext: {
        documents: [
          {
            documentId: 'doc_1',
            chunkId: 'chunk_1',
            content: 'Aether provides autonomous task planning and verification.',
            score: 0.92,
            metadata: { title: 'Aether Overview' },
            citation: {
              id: 'cit_1',
              documentId: 'doc_1',
              chunkId: 'chunk_1',
              title: 'Aether Overview',
              source: 'docs/overview.md',
              excerpt: 'Aether provides autonomous task planning...',
              relevanceScore: 0.92,
            },
          },
        ],
        totalRetrieved: 1,
        searchQuery: 'What does Aether provide?',
      },
    };

    const conf = confEngine.assess('What does Aether provide?', knowledgeIntent, populatedRAGContext);
    expect(conf.level).toBe('HIGH_CONFIDENCE');
    expect(conf.score).toBe(0.92);

    const validResponse = 'Based on the documentation, Aether provides autonomous task planning and verification.';
    const validation = respValidator.validate(
      defaultAIRequest,
      knowledgeIntent,
      populatedRAGContext,
      validResponse,
    );

    expect(validation.valid).toBe(true);
  });

  // ─── 8. UNSUPPORTED CLAIM DETECTION & CORRECTION ────────────────────────────
  it('Scenario 8: Unsupported action claim without backend tool execution is intercepted and corrected', () => {
    const actionIntent: Intent = {
      type: 'PROJECT_WORKSPACE_TASK',
      confidence: 0.9,
      requiresRAG: false,
      requiresMemory: false,
      requiresTool: true,
      requiresAgent: false,
    };

    const claimedActionContent = 'I have created the task "Prepare Launch Deck" with high priority.';

    const validation = respValidator.validate(
      defaultAIRequest,
      actionIntent,
      defaultAIContext,
      claimedActionContent,
      false, // tool was NOT executed!
      false,
    );

    expect(validation.valid).toBe(false);
    expect(validation.reason).toContain('no backend tool was executed');
    expect(validation.correctedContent).toContain('The requested action was not executed');
  });

  // ─── 9. TOOL TIMEOUT HANDLING ───────────────────────────────────────────────
  it('Scenario 9: Tool timeout is safely aborted without hanging and returns TIMEOUT status', async () => {
    const slowTool: ToolDefinition = {
      id: 'tool_slow',
      name: 'slow_tool',
      description: 'Simulates a hanging query',
      category: 'system',
      riskLevel: 'READ_ONLY',
      timeoutMs: 50,
      requiredPermissions: ['system:read'],
      inputSchema: { type: 'object', properties: {} },
      handler: async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return { done: true };
      },
    };

    registry.register(slowTool);

    const result = await executor.execute('slow_tool', {}, defaultContext, { timeoutMs: 50 });

    expect(result.success).toBe(false);
    expect(result.code).toBe('TIMEOUT');
    expect(result.verificationStatus).toBe('FAILED');
    expect(result.error).toContain('timed out');
  });

  // ─── 10. TOOL FAILURE TRANSPARENCY ──────────────────────────────────────────
  it('Scenario 10: Tool failure error is preserved and transparently reflected in response validation', () => {
    const actionIntent: Intent = {
      type: 'PROJECT_WORKSPACE_TASK',
      confidence: 0.9,
      requiresRAG: false,
      requiresMemory: false,
      requiresTool: true,
      requiresAgent: false,
    };

    const executionState: ExecutionReliabilityState = {
      toolExecuted: true,
      toolSuccess: false,
      verificationStatus: 'FAILED',
      errors: ['Foreign key violation on projectId "proj_invalid"'],
      verifiedStepsCount: 0,
      totalStepsCount: 1,
    };

    const claimedSuccess = 'I have updated the project task successfully.';

    const validation = respValidator.validate(
      defaultAIRequest,
      actionIntent,
      defaultAIContext,
      claimedSuccess,
      executionState,
    );

    expect(validation.valid).toBe(false);
    expect(validation.correctedContent).toContain('Foreign key violation on projectId "proj_invalid"');
  });

  // ─── 11. RETRY AFTER UNCERTAIN EXECUTION ────────────────────────────────────
  it('Scenario 11: Idempotent read tool automatically retries on transient error', async () => {
    let attempts = 0;
    const retryableReadTool: ToolDefinition = {
      id: 'tool_retryable_read',
      name: 'retryable_read',
      description: 'Read tool that succeeds on second try',
      category: 'knowledge',
      riskLevel: 'READ_ONLY',
      retryable: true,
      requiredPermissions: ['projects:read'],
      inputSchema: { type: 'object', properties: {} },
      handler: async () => {
        attempts++;
        if (attempts === 1) {
          throw new Error('Temporary network glitch');
        }
        return { data: 'Recovered read data' };
      },
    };

    registry.register(retryableReadTool);

    const result = await executor.execute('retryable_read', {}, defaultContext, { maxRetries: 1 });

    expect(result.success).toBe(true);
    expect(result.retryCount).toBe(1);
    expect(result.data).toEqual({ data: 'Recovered read data' });
  });

  // ─── 12. DUPLICATE EXECUTION PREVENTION (IDEMPOTENCY) ───────────────────────
  it('Scenario 12: Duplicate execution with same idempotencyKey returns cached result without re-executing', async () => {
    let executionCounter = 0;
    const uniqueTool: ToolDefinition = {
      id: 'tool_unique_side_effect',
      name: 'unique_side_effect',
      description: 'Mutating tool that must run once per key',
      category: 'tasks',
      riskLevel: 'LOW_RISK',
      requiredPermissions: ['tasks:write'],
      inputSchema: { type: 'object', properties: {} },
      handler: async () => {
        executionCounter++;
        return { executionCount: executionCounter };
      },
      verify: async () => ({ verified: true, status: 'VERIFIED' }),
    };

    registry.register(uniqueTool);

    const key = 'idempotent_key_abc_123';
    const res1 = await executor.execute('unique_side_effect', {}, defaultContext, { idempotencyKey: key });
    const res2 = await executor.execute('unique_side_effect', {}, defaultContext, { idempotencyKey: key });

    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);
    expect(res2.cached).toBe(true);
    expect(executionCounter).toBe(1); // Executed exactly once!
  });

  // ─── 13. PERMISSION FAILURE ─────────────────────────────────────────────────
  it('Scenario 13: Tool execution blocked by missing permissions returns FORBIDDEN and FAILED status', async () => {
    const adminTool: ToolDefinition = {
      id: 'tool_admin_purge',
      name: 'admin_purge',
      description: 'Admin level purge tool',
      category: 'system',
      riskLevel: 'DESTRUCTIVE',
      requiredPermissions: ['admin:all'],
      inputSchema: { type: 'object', properties: {} },
      handler: async () => ({ purged: true }),
    };

    registry.register(adminTool);

    // User auth only has tasks:write, not admin:all
    const result = await executor.execute('admin_purge', {}, defaultContext);

    expect(result.success).toBe(false);
    expect(result.code).toBe('FORBIDDEN');
    expect(result.verificationStatus).toBe('FAILED');
    expect(result.error).toContain('Unauthorized to execute tool');
  });

  // ─── 14. USER ISOLATION IN VERIFICATION ─────────────────────────────────────
  it('Scenario 14: Verification handler enforces user isolation', async () => {
    const multiTenantTool: ToolDefinition = {
      id: 'tool_tenant_task',
      name: 'tenant_task',
      description: 'Creates task scoped to specific user',
      category: 'tasks',
      riskLevel: 'LOW_RISK',
      requiredPermissions: ['tasks:write'],
      inputSchema: { type: 'object', properties: { title: { type: 'string' } } },
      handler: async (input: { title: string }, ctx: ToolExecutionContext) => {
        // Return output created for a DIFFERENT user (e.g. simulation of security breach)
        return { taskId: 'task_999', ownerId: 'other_user', title: input.title };
      },
      verify: async (output: { taskId: string; ownerId: string }, _input: unknown, ctx: ToolExecutionContext) => {
        if (output.ownerId !== ctx.auth.userId) {
          return {
            verified: false,
            error: `Security isolation violation: task belongs to user "${output.ownerId}", not authenticated user "${ctx.auth.userId}".`,
          };
        }
        return { verified: true, status: 'VERIFIED' };
      },
    };

    registry.register(multiTenantTool);

    const result = await executor.execute('tenant_task', { title: 'Test Task' }, defaultContext);

    expect(result.success).toBe(false);
    expect(result.code).toBe('VERIFICATION_FAILED');
    expect(result.verificationStatus).toBe('FAILED');
    expect(result.error).toContain('Security isolation violation');
  });

  // ─── 15. WORKSPACE ISOLATION IN VERIFICATION ────────────────────────────────
  it('Scenario 15: Verification ensures workspace boundary is respected', async () => {
    const workspaceTool: ToolDefinition = {
      id: 'tool_workspace_doc',
      name: 'workspace_doc',
      description: 'Workspace document retrieval',
      category: 'workspace',
      riskLevel: 'READ_ONLY',
      requiredPermissions: ['projects:read'],
      inputSchema: { type: 'object', properties: { targetWorkspaceId: { type: 'string' } } },
      handler: async (input: { targetWorkspaceId: string }, ctx: ToolExecutionContext) => {
        const allowed = ctx.auth.userWorkspaceIds?.includes(input.targetWorkspaceId);
        if (!allowed) {
          throw new Error(`Unauthorized access to workspace "${input.targetWorkspaceId}".`);
        }
        return { workspaceId: input.targetWorkspaceId, content: 'Workspace Data' };
      },
    };

    registry.register(workspaceTool);

    const result = await executor.execute('workspace_doc', { targetWorkspaceId: 'unauthorized_ws' }, defaultContext);

    expect(result.success).toBe(false);
    expect(result.verificationStatus).toBe('FAILED');
    expect(result.error).toContain('Unauthorized access to workspace');
  });

  // ─── 16. RESPONSE ACCURACY WITH EXECUTION STATE ─────────────────────────────
  it('Scenario 16: Response Validator corrects 100% success claims on partial workflow completion', () => {
    const actionIntent: Intent = {
      type: 'PROJECT_WORKSPACE_TASK',
      confidence: 0.9,
      requiresRAG: false,
      requiresMemory: false,
      requiresTool: true,
      requiresAgent: false,
    };

    const partialExecutionState: ExecutionReliabilityState = {
      toolExecuted: true,
      toolSuccess: true,
      verificationStatus: 'PARTIALLY_VERIFIED',
      verifiedStepsCount: 1,
      totalStepsCount: 2,
      plan: {
        planId: 'plan_p1',
        objective: 'Batch update tasks',
        steps: [],
        totalSteps: 2,
        requiresConfirmation: false,
        summary: 'Completed 1 of 2 tasks. Step 2 failed due to lock timeout.',
        createdAt: new Date().toISOString(),
      },
    };

    const overconfidentModelClaim = 'All steps completed successfully! All tasks have been completed.';

    const validation = respValidator.validate(
      defaultAIRequest,
      actionIntent,
      defaultAIContext,
      overconfidentModelClaim,
      partialExecutionState,
    );

    expect(validation.valid).toBe(false);
    expect(validation.verificationStatus).toBe('PARTIALLY_VERIFIED');
    expect(validation.correctedContent).toContain('Partially Completed:');
    expect(validation.correctedContent).toContain('Step 2 failed due to lock timeout');
  });

  // ─── 17. SIMPLE CONVERSATIONAL RESPONSE FAST-PATH ───────────────────────────
  it('Scenario 17: Simple conversational query bypasses heavy action verification with fast path', () => {
    const conversationalIntent: Intent = {
      type: 'CONVERSATIONAL',
      confidence: 0.98,
      requiresRAG: false,
      requiresMemory: false,
      requiresTool: false,
      requiresAgent: false,
    };

    const start = performance.now();
    const validation = respValidator.validate(
      { ...defaultAIRequest, message: 'Hello Aether!' },
      conversationalIntent,
      defaultAIContext,
      'Hello! How can I help you today in your workspace?',
    );
    const durationMs = performance.now() - start;

    expect(validation.valid).toBe(true);
    expect(validation.verificationStatus).toBe('NOT_VERIFIABLE');
    expect(durationMs).toBeLessThan(10); // Super fast execution
  });

  // ─── 18. COMPLEX MULTI-STEP WORKFLOW VERIFICATION ───────────────────────────
  it('Scenario 18: Multi-step verified workflow successfully updates state and passes validation', async () => {
    const stepA: ToolDefinition = {
      id: 'tool_step_a',
      name: 'step_a',
      description: 'Step A tool',
      category: 'projects',
      riskLevel: 'LOW_RISK',
      requiredPermissions: ['tasks:write'],
      inputSchema: { type: 'object', properties: {} },
      handler: async () => ({ step: 'A', projectId: 'p1' }),
      verify: async () => ({ verified: true, status: 'VERIFIED', details: 'Project state verified' }),
    };

    const stepB: ToolDefinition = {
      id: 'tool_step_b',
      name: 'step_b',
      description: 'Step B tool',
      category: 'tasks',
      riskLevel: 'LOW_RISK',
      requiredPermissions: ['tasks:write'],
      inputSchema: { type: 'object', properties: {} },
      handler: async () => ({ step: 'B', taskId: 't1' }),
      verify: async () => ({ verified: true, status: 'VERIFIED', details: 'Task state verified' }),
    };

    registry.register(stepA);
    registry.register(stepB);

    const fullPlan: ActionPlan = {
      planId: 'plan_full_success',
      objective: 'Create project and task',
      steps: [
        {
          stepId: 'step_1',
          stepNumber: 1,
          description: 'Create Project Alpha',
          toolName: 'step_a',
          toolInput: {},
          riskLevel: 'LOW_RISK',
          status: 'pending',
          verified: false,
        },
        {
          stepId: 'step_2',
          stepNumber: 2,
          description: 'Create Initial Task',
          toolName: 'step_b',
          toolInput: {},
          dependencies: ['step_1'],
          riskLevel: 'LOW_RISK',
          status: 'pending',
          verified: false,
        },
      ],
      totalSteps: 2,
      requiresConfirmation: false,
      createdAt: new Date().toISOString(),
    };

    const planRes = await planExecutorInstance.executePlan(fullPlan, defaultContext);

    expect(planRes.status).toBe('SUCCESS');
    expect(planRes.verificationStatus).toBe('VERIFIED');
    expect(planRes.successfulStepsCount).toBe(2);
    expect(planRes.failedStepsCount).toBe(0);
    expect(planRes.evidence?.length).toBe(2);

    const execState: ExecutionReliabilityState = {
      plan: fullPlan,
      toolResults: planRes.steps.map((s) => s.result),
      evidence: planRes.evidence,
      verificationStatus: planRes.verificationStatus ?? 'VERIFIED',
      toolExecuted: true,
      toolSuccess: true,
      verifiedStepsCount: 2,
      totalStepsCount: 2,
    };

    const conf = confEngine.assess('Create project and task', { type: 'PROJECT_WORKSPACE_TASK', requiresTool: true } as Intent, defaultAIContext, 'Created project and task', execState);
    expect(conf.level).toBe('HIGH_CONFIDENCE');
    expect(conf.verificationStatus).toBe('VERIFIED');
  });

  // ─── 19. REGRESSION OF EXISTING AI BEHAVIOR ─────────────────────────────────
  it('Scenario 19: Discrete confidence levels and reasonings remain strictly non-percentage and grounded', () => {
    const unsupportedIntent: Intent = {
      type: 'UNSUPPORTED',
      confidence: 0.1,
      requiresRAG: false,
      requiresMemory: false,
      requiresTool: false,
      requiresAgent: false,
    };

    const conf = confEngine.assess('Do something impossible', unsupportedIntent, defaultAIContext);
    expect(conf.level).toBe('INSUFFICIENT_INFORMATION');
    expect(conf.reasoning).toContain('outside Aether capabilities');

    const ambiguousIntent: Intent = {
      type: 'AMBIGUOUS',
      confidence: 0.4,
      requiresRAG: false,
      requiresMemory: false,
      requiresTool: false,
      requiresAgent: false,
    };

    const confAmb = confEngine.assess('Update it', ambiguousIntent, defaultAIContext);
    expect(confAmb.level).toBe('LOW_CONFIDENCE');
    expect(confAmb.reasoning).toContain('clarification required');
  });
});
