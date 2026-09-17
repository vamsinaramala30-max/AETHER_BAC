/**
 * AETHER AI — Tool Registry
 * Central registration point for all tools.
 * Provides safe listing without exposing handlers.
 */

import type { ToolDefinition, ToolDescriptor } from './tool-types.js';

// ─── IToolRegistry Interface ─────────────────────────────────────────────────

export interface IToolRegistry {
  register<TInput extends Record<string, unknown>, TOutput>(
    tool: ToolDefinition<TInput, TOutput>,
    options?: { override?: boolean },
  ): void;
  unregister(name: string): boolean;
  get(nameOrId: string): ToolDefinition | undefined;
  getById(id: string): ToolDefinition | undefined;
  getAll(): readonly ToolDefinition[];
  has(nameOrId: string): boolean;
  list(): readonly ToolDescriptor[];
  listByCategory(category: string): readonly ToolDescriptor[];
  listByRiskLevel(riskLevel: string): readonly ToolDescriptor[];
  getToolNames(): readonly string[];
  clear(): void;
}

// ─── Tool Registry Implementation ────────────────────────────────────────────

export class ToolRegistry implements IToolRegistry {
  private readonly toolsByName = new Map<string, ToolDefinition>();
  private readonly toolsById = new Map<string, ToolDefinition>();

  public register<TInput extends Record<string, unknown>, TOutput>(
    tool: ToolDefinition<TInput, TOutput>,
    options?: { override?: boolean },
  ): void {
    const existing = this.toolsByName.get(tool.name);
    if (existing && !options?.override) {
      throw new Error(`Tool "${tool.name}" is already registered.`);
    }

    const toolDef = tool as ToolDefinition;
    this.toolsByName.set(tool.name, toolDef);
    if (tool.id) {
      this.toolsById.set(tool.id, toolDef);
    }
  }

  public unregister(nameOrId: string): boolean {
    const tool = this.get(nameOrId);
    if (!tool) return false;
    this.toolsByName.delete(tool.name);
    if (tool.id) {
      this.toolsById.delete(tool.id);
    }
    return true;
  }

  public get(nameOrId: string): ToolDefinition | undefined {
    return this.toolsByName.get(nameOrId) ?? this.toolsById.get(nameOrId);
  }

  public getById(id: string): ToolDefinition | undefined {
    return this.toolsById.get(id);
  }

  public getAll(): readonly ToolDefinition[] {
    return Array.from(this.toolsByName.values());
  }

  public has(nameOrId: string): boolean {
    return this.toolsByName.has(nameOrId) || this.toolsById.has(nameOrId);
  }

  /**
   * Returns a list of tool descriptors safe for public consumption.
   * Handlers are NOT included.
   */
  public list(): readonly ToolDescriptor[] {
    return Array.from(this.toolsByName.values()).map(toDescriptor);
  }

  public listByCategory(category: string): readonly ToolDescriptor[] {
    return Array.from(this.toolsByName.values())
      .filter((t) => t.category === category)
      .map(toDescriptor);
  }

  public listByRiskLevel(riskLevel: string): readonly ToolDescriptor[] {
    return Array.from(this.toolsByName.values())
      .filter((t) => (t.riskLevel ?? 'READ_ONLY') === riskLevel)
      .map(toDescriptor);
  }

  public getToolNames(): readonly string[] {
    return Array.from(this.toolsByName.keys());
  }

  public clear(): void {
    this.toolsByName.clear();
    this.toolsById.clear();
  }
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function toDescriptor(tool: ToolDefinition): ToolDescriptor {
  return {
    id: tool.id ?? `tool_${tool.name}`,
    name: tool.name,
    description: tool.description,
    version: tool.version ?? '1.0.0',
    category: tool.category,
    inputSchema: tool.inputSchema,
    requiredPermissions: tool.requiredPermissions ?? tool.permissions ?? [],
    riskLevel: tool.riskLevel ?? 'READ_ONLY',
    requiresConfirmation:
      typeof tool.requiresConfirmation === 'boolean' ? tool.requiresConfirmation : undefined,
    idempotent: tool.idempotent ?? false,
    retryable: tool.retryable ?? false,
    timeoutMs: tool.timeoutMs ?? 30000,
  };
}

export const toolRegistry = new ToolRegistry();

