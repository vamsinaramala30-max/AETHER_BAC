/**
 * AETHER AI — Tool Router
 * Resolves a tool name or intent to the matching ToolDefinition.
 * Never executes — only routes to a tool reference.
 */

import type { IToolRegistry } from './tool-registry.js';
import { toolRegistry } from './tool-registry.js';
import type { ToolDefinition, ToolDescriptor, AuthenticationContext } from './tool-types.js';
import { toolPermissions } from './tool-permissions.js';

// ─── IToolRouter Interface ───────────────────────────────────────────────────

export interface IToolRouter {
  route(toolName: string, availableToolNames?: readonly string[]): ToolDefinition | undefined;

  routeByIntent(intent: string, availableToolNames?: readonly string[]): ToolDefinition | undefined;

  routeAuthorized(toolName: string, auth: AuthenticationContext): ToolDefinition | undefined;

  discoverTools(query?: string, auth?: AuthenticationContext): readonly ToolDescriptor[];
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
   * Routes to tool only if user has required permissions.
   */
  public routeAuthorized(
    toolName: string,
    auth: AuthenticationContext,
  ): ToolDefinition | undefined {
    const tool = this.registry.get(toolName);
    if (!tool) return undefined;

    const check = toolPermissions.checkPermissions(tool.requiredPermissions, auth);
    return check.allowed ? tool : undefined;
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

  /**
   * Discovers available tools, optionally filtered by keyword query and user authorization.
   */
  public discoverTools(
    query?: string,
    auth?: AuthenticationContext,
  ): readonly ToolDescriptor[] {
    let tools = this.registry.list();

    if (auth) {
      tools = tools.filter((t) => {
        const check = toolPermissions.checkPermissions(t.requiredPermissions, auth);
        return check.allowed;
      });
    }

    if (query && query.trim().length > 0) {
      const q = query.toLowerCase().trim();
      tools = tools.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q),
      );
    }

    return tools;
  }
}

export const toolRouter = new ToolRouter(toolRegistry);
