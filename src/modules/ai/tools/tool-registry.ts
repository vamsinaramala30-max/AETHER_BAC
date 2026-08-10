/**
 * AETHER AI — Tool Registry
 * Central registration point for all tools.
 * Provides safe listing without exposing handlers.
 */

import type { ToolDefinition, ToolDescriptor } from './tool-types.js';

// ─── IToolRegistry Interface ─────────────────────────────────────────────────

export interface IToolRegistry {
  register<TInput extends Record<string, unknown>, TOutput>(tool: ToolDefinition<TInput, TOutput>): void;
  unregister(name: string): boolean;
  get(name: string): ToolDefinition | undefined;
  has(name: string): boolean;
  list(): readonly ToolDescriptor[];
  listByCategory(category: string): readonly ToolDescriptor[];
  getToolNames(): readonly string[];
  clear(): void;
}

// ─── Tool Registry Implementation ────────────────────────────────────────────

export class ToolRegistry implements IToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  public register<TInput extends Record<string, unknown>, TOutput>(
    tool: ToolDefinition<TInput, TOutput>,
  ): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered.`);
    }
    this.tools.set(tool.name, tool as ToolDefinition);
  }

  public unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  public get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  public has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Returns a list of tool descriptors safe for public consumption.
   * Handlers are NOT included.
   */
  public list(): readonly ToolDescriptor[] {
    return Array.from(this.tools.values()).map(toDescriptor);
  }

  public listByCategory(category: string): readonly ToolDescriptor[] {
    return Array.from(this.tools.values())
      .filter((t) => t.category === category)
      .map(toDescriptor);
  }

  public getToolNames(): readonly string[] {
    return Array.from(this.tools.keys());
  }

  public clear(): void {
    this.tools.clear();
  }
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function toDescriptor(tool: ToolDefinition): ToolDescriptor {
  return {
    name: tool.name,
    description: tool.description,
    category: tool.category,
    inputSchema: tool.inputSchema,
    requiredPermissions: tool.requiredPermissions,
  };
}

export const toolRegistry = new ToolRegistry();
