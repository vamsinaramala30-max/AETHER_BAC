/**
 * AETHER AI — Production Tools Layer Index
 * Central export point for all authoritative tool definitions, executor, registry, validator, permissions, and types.
 */

// Types & Contracts
export * from './tool-types.js';

// Authoritative Registry, Permissions, Validator, Router, Executor
export { ToolRegistry, toolRegistry } from './tool-registry.js';
export { ToolPermissions, toolPermissions } from './tool-permissions.js';
export { ToolValidator, toolValidator } from './tool-validator.js';
export { ToolRouter, toolRouter } from './tool-router.js';
export { ToolExecutor, toolExecutor } from './tool-executor.js';

// Auto-register and export all tool domains
export * from './task-tools.js';
export * from './project-tools.js';
export * from './goal-tools.js';
export * from './productivity-tools.js';
export * from './automation-tools.js';
export * from './workspace-tools.js';
export * from './note-tools.js';
export * from './memory-tools.js';
export {
  searchKnowledgeTool,
  addKnowledgeDocumentTool,
  deleteKnowledgeDocumentTool,
  getDocumentTool,
  listDocumentsTool,
  knowledgeTools,
} from './knowledge-tools.js';
