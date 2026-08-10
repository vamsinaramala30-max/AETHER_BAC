/**
 * AETHER AI — Tool Validator
 * Validates tool invocation input against its declared JSON-like schema.
 * No `any` types. No arbitrary code execution.
 */

import type { ToolInputSchema, JSONSchemaProperty } from './tool-types.js';

// ─── Validation Result ───────────────────────────────────────────────────────

export interface ToolValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

// ─── IToolValidator Interface ────────────────────────────────────────────────

export interface IToolValidator {
  validate(input: unknown, schema: ToolInputSchema): ToolValidationResult;
}

// ─── Tool Validator Implementation ───────────────────────────────────────────

export class ToolValidator implements IToolValidator {
  public validate(input: unknown, schema: ToolInputSchema): ToolValidationResult {
    const errors: string[] = [];

    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      return { valid: false, errors: ['Input must be a non-null object.'] };
    }

    const inputObj = input as Record<string, unknown>;

    // Check required fields
    if (schema.required) {
      for (const reqKey of schema.required) {
        if (!(reqKey in inputObj) || inputObj[reqKey] === undefined || inputObj[reqKey] === null) {
          errors.push(`Missing required field: "${reqKey}".`);
        }
      }
    }

    // Reject unknown keys if additionalProperties is false
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(inputObj)) {
        if (!(key in schema.properties)) {
          errors.push(`Unknown field: "${key}".`);
        }
      }
    }

    // Validate each declared property
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      const value = inputObj[key];
      if (value === undefined || value === null) {
        continue; // Missing optionals handled by required check above
      }
      const propErrors = this.validateProperty(value, propSchema, key);
      errors.push(...propErrors);
    }

    return { valid: errors.length === 0, errors };
  }

  private validateProperty(
    value: unknown,
    schema: JSONSchemaProperty,
    path: string,
  ): readonly string[] {
    const errors: string[] = [];

    // Type checks
    switch (schema.type) {
      case 'string': {
        if (typeof value !== 'string') {
          errors.push(`"${path}" must be a string.`);
          return errors;
        }
        if (schema.minLength !== undefined && value.length < schema.minLength) {
          errors.push(`"${path}" must have at least ${schema.minLength} characters.`);
        }
        if (schema.maxLength !== undefined && value.length > schema.maxLength) {
          errors.push(`"${path}" must have at most ${schema.maxLength} characters.`);
        }
        break;
      }
      case 'number':
      case 'integer': {
        if (typeof value !== 'number') {
          errors.push(`"${path}" must be a number.`);
          return errors;
        }
        if (schema.type === 'integer' && !Number.isInteger(value)) {
          errors.push(`"${path}" must be an integer.`);
        }
        if (schema.minimum !== undefined && value < schema.minimum) {
          errors.push(`"${path}" must be >= ${schema.minimum}.`);
        }
        if (schema.maximum !== undefined && value > schema.maximum) {
          errors.push(`"${path}" must be <= ${schema.maximum}.`);
        }
        break;
      }
      case 'boolean': {
        if (typeof value !== 'boolean') {
          errors.push(`"${path}" must be a boolean.`);
        }
        break;
      }
      case 'array': {
        if (!Array.isArray(value)) {
          errors.push(`"${path}" must be an array.`);
          return errors;
        }
        if (schema.items) {
          for (let i = 0; i < value.length; i++) {
            errors.push(
              ...this.validateProperty(value[i] as unknown, schema.items, `${path}[${i}]`),
            );
          }
        }
        break;
      }
      case 'object': {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          errors.push(`"${path}" must be an object.`);
          return errors;
        }
        if (schema.properties) {
          const objValue = value as Record<string, unknown>;
          if (schema.required) {
            for (const reqKey of schema.required) {
              if (!(reqKey in objValue) || objValue[reqKey] === undefined) {
                errors.push(`"${path}.${reqKey}" is required.`);
              }
            }
          }
          for (const [nestedKey, nestedSchema] of Object.entries(schema.properties)) {
            if (nestedKey in objValue && objValue[nestedKey] !== undefined) {
              errors.push(
                ...this.validateProperty(objValue[nestedKey], nestedSchema, `${path}.${nestedKey}`),
              );
            }
          }
        }
        break;
      }
    }

    // Enum check
    if (schema.enum && schema.enum.length > 0) {
      const matchesEnum = schema.enum.some((allowed) => allowed === value);
      if (!matchesEnum) {
        errors.push(`"${path}" must be one of: [${schema.enum.join(', ')}].`);
      }
    }

    return errors;
  }
}

export const toolValidator = new ToolValidator();
