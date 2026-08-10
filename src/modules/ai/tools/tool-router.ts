/**
 * AETHER AI — Tool Router
 * Resolves a tool name or intent to the matching ToolDefinition.
 * Never executes — only routes to a tool reference.
 */

import type { IToolRegistry } from './tool-registry.js';
import { toolRegistry } from './tool-registry.js';
import type { ToolDefinition } from './tool-types.js';

// ─── IToolRouter Interface ───────────────────────────────────────────────────

export interface IToolRouter {
  route(
    toolName: string,
    availableToolNames?: readonly string[],
  ): ToolDefinition | undefined;

  routeByIntent(
    intent: string,
    availableToolNames?: readonly string[],
  ): ToolDefinition | undefined;
}

// ─── Tool Router Implementation ──────────────────────────────────────────────

export class ToolRouter implements IToolRouter {
  constructor(private readonly registry: IToolRegistry) {}

  /**
   * Exact match by tool name.
   */
  public route(
    toolName: string,
    availableToolNames?: readonly string[],
  ): ToolDefinition | undefined {
    if (availableToolNames && !availableToolNames.includes(toolName)) {
      return undefined;
    }
    return this.registry.get(toolName);
  }

  /**
   * Heuristic match by intent description against tool names and descriptions.
   * Uses exact-name match first, then falls back to substring-in-description.
   */
  public routeByIntent(
    intent: string,
    availableToolNames?: readonly string[],
  ): ToolDefinition | undefined {
    const normalized = intent.toLowerCase().trim();

    // 1. Exact name match
    const tools = this.registry.list();
    for (const descriptor of tools) {
      if (availableToolNames && !availableToolNames.includes(descriptor.name)) {
        continue;
      }
      if (descriptor.name.toLowerCase() === normalized) {
        return this.registry.get(descriptor.name);
      }
    }

    // 2. Substring in description
    for (const descriptor of tools) {
      if (availableToolNames && !availableToolNames.includes(descriptor.name)) {
        continue;
      }
      if (descriptor.description.toLowerCase().includes(normalized)) {
        return this.registry.get(descriptor.name);
      }
    }

    return undefined;
  }
}

export const toolRouter = new ToolRouter(toolRegistry);
