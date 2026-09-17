/**
 * AETHER AI — Prompt Engine
 * Top-level prompt management: template registry and build coordination.
 */

import type { Result } from '../ai-types.js';
import { ok, fail } from '../ai-types.js';
import { PromptBuildFailedError } from '../ai-errors.js';
import type { AIContext, BuiltPrompt, PromptTemplate, PromptType } from '../ai-types.js';
import { PromptBuilder } from './prompt-builder.js';
import type { IPromptBuilder, PromptBuildOptions } from './prompt-builder.js';

// ─── IPromptEngine Interface ──────────────────────────────────────────────────

export interface IPromptEngine {
  build(
    userMessage: string,
    context: AIContext,
    options?: PromptEngineOptions,
  ): Result<BuiltPrompt>;

  registerTemplate(template: PromptTemplate): void;
  getTemplate(id: string): PromptTemplate | undefined;
  listTemplates(type?: PromptType): readonly PromptTemplate[];
  renderTemplate(id: string, variables: Record<string, string>): Result<string>;
}

// ─── Prompt Engine Options ────────────────────────────────────────────────────

export interface PromptEngineOptions {
  readonly includeRAG?: boolean;
  readonly includeMemory?: boolean;
  readonly customSystemInstructions?: string;
}

// ─── Prompt Engine Implementation ────────────────────────────────────────────

export class PromptEngine implements IPromptEngine {
  private readonly builder: IPromptBuilder;
  private readonly templates = new Map<string, PromptTemplate>();

  constructor() {
    this.builder = new PromptBuilder();
  }

  public build(
    userMessage: string,
    context: AIContext,
    options: PromptEngineOptions = {},
  ): Result<BuiltPrompt> {
    const buildOptions: PromptBuildOptions = {
      userMessage,
      context,
      includeRAG: options.includeRAG ?? true,
      includeMemory: options.includeMemory ?? true,
      customSystemInstructions: options.customSystemInstructions,
    };
    return this.builder.build(buildOptions);
  }

  public registerTemplate(template: PromptTemplate): void {
    this.templates.set(template.id, template);
  }

  public getTemplate(id: string): PromptTemplate | undefined {
    return this.templates.get(id);
  }

  public listTemplates(type?: PromptType): readonly PromptTemplate[] {
    const all = Array.from(this.templates.values());
    if (!type) return all;
    return all.filter((t) => t.type === type);
  }

  public renderTemplate(id: string, variables: Record<string, string>): Result<string> {
    const template = this.templates.get(id);
    if (!template) {
      return fail(new PromptBuildFailedError(`Prompt template "${id}" not found`));
    }

    // Validate all required variables are provided
    const missing = template.variables.filter((v) => !(v in variables));
    if (missing.length > 0) {
      return fail(new PromptBuildFailedError(`Missing template variables: ${missing.join(', ')}`));
    }

    let rendered = template.template;
    for (const [key, value] of Object.entries(variables)) {
      rendered = rendered.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }

    // Check for unreplaced variables
    const unreplaced = rendered.match(/\{\{[a-zA-Z_]+\}\}/g);
    if (unreplaced) {
      return fail(
        new PromptBuildFailedError(`Template has unreplaced variables: ${unreplaced.join(', ')}`),
      );
    }

    return ok(rendered);
  }
}
