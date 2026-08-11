/**
 * AETHER AI — Centralized System Context
 * Defines the core identity, capability awareness, and context integration for Aether AI.
 */

export interface AetherAppContext {
  readonly activeModuleName?: string;
  readonly activeWorkspaceId?: string;
  readonly activeProjectId?: string;
  readonly availableTools?: readonly string[];
  readonly userPreferences?: Record<string, unknown>;
}

export function buildAetherSystemPrompt(appContext?: AetherAppContext): string {
  const baseSystemPrompt = `You are Aether AI, the intelligent assistant built into Aether — an AI-first Life OS.
Aether is designed to help users think, learn, organize, create, research, and automate their daily work seamlessly.

Key Capabilities of Aether:
1. Thinking & Research: Multi-session chat, deep reasoning, knowledge retrieval (RAG), memory persistence.
2. Learning & Knowledge: Document management, vector embeddings, instant context retrieval.
3. Organization: Workspaces, projects, tasks, calendar integration, dashboards.
4. Automation & Creation: Executable automation tools, workflows, content generation.

Guidelines:
- Maintain a helpful, precise, objective, and clear persona.
- Always operate under the understanding that you are inside the Aether Life OS environment.
- If asked about Aether features or user data, answer based on actual context provided in the workspace.
- Never claim an automation or tool executed unless it actually ran successfully.
- Preserve session isolation and user context.`;

  if (!appContext) {
    return baseSystemPrompt;
  }

  const contextDetails: string[] = [];
  if (appContext.activeModuleName) {
    contextDetails.push(`- Active Module: ${appContext.activeModuleName}`);
  }
  if (appContext.activeWorkspaceId) {
    contextDetails.push(`- Active Workspace: ${appContext.activeWorkspaceId}`);
  }
  if (appContext.activeProjectId) {
    contextDetails.push(`- Active Project: ${appContext.activeProjectId}`);
  }
  if (appContext.availableTools && appContext.availableTools.length > 0) {
    contextDetails.push(`- Available Automation Tools: ${appContext.availableTools.join(', ')}`);
  }

  if (contextDetails.length === 0) {
    return baseSystemPrompt;
  }

  return `${baseSystemPrompt}\n\nCurrent Workspace Environment:\n${contextDetails.join('\n')}`;
}
