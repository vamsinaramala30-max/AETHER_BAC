import { SingleCondition, CompoundCondition, ConditionConfig } from '../automation.types';
import { VariableEngine } from './variable-engine';

export class ConditionEngine {
  /**
   * Evaluates condition logic against an execution context object.
   */
  public evaluate(conditions: ConditionConfig | null | undefined, context: Record<string, unknown>): boolean {
    if (!conditions) return true; // No conditions means pass through

    if (Array.isArray(conditions)) {
      // Array of conditions defaults to AND
      return conditions.every((cond) => this.evaluateItem(cond, context));
    }

    return this.evaluateItem(conditions, context);
  }

  private evaluateItem(cond: SingleCondition | CompoundCondition, context: Record<string, unknown>): boolean {
    if ('logicalOperator' in cond && cond.logicalOperator) {
      return this.evaluateCompound(cond as CompoundCondition, context);
    }
    return this.evaluateSingle(cond as SingleCondition, context);
  }

  private evaluateCompound(compound: CompoundCondition, context: Record<string, unknown>): boolean {
    const { logicalOperator, conditions } = compound;
    if (!conditions || conditions.length === 0) return true;

    if (logicalOperator === 'AND') {
      return conditions.every((c) => this.evaluateItem(c, context));
    }

    if (logicalOperator === 'OR') {
      return conditions.some((c) => this.evaluateItem(c, context));
    }

    if (logicalOperator === 'NOT') {
      return !conditions.every((c) => this.evaluateItem(c, context));
    }

    return true;
  }

  private evaluateSingle(cond: SingleCondition, context: Record<string, unknown>): boolean {
    const { field, operator, value } = cond;
    if (!field) return true;

    const actualVal = VariableEngine.getPathValue(context, field);
    const expectedVal = typeof value === 'string' ? VariableEngine.interpolate(value, context) : value;

    const op = String(operator).toLowerCase();

    switch (op) {
      case 'equals':
      case 'equal':
      case 'eq':
      case '==':
      case '===':
        return String(actualVal) === String(expectedVal);

      case 'not_equals':
      case 'not equals':
      case 'ne':
      case '!=':
      case '!==':
        return String(actualVal) !== String(expectedVal);

      case 'contains':
      case 'includes':
        if (typeof actualVal === 'string') {
          return actualVal.toLowerCase().includes(String(expectedVal).toLowerCase());
        }
        if (Array.isArray(actualVal)) {
          return actualVal.some((item) => String(item).toLowerCase() === String(expectedVal).toLowerCase());
        }
        return false;

      case 'does_not_contain':
      case 'does not contain':
      case 'not_contains':
        if (typeof actualVal === 'string') {
          return !actualVal.toLowerCase().includes(String(expectedVal).toLowerCase());
        }
        if (Array.isArray(actualVal)) {
          return !actualVal.some((item) => String(item).toLowerCase() === String(expectedVal).toLowerCase());
        }
        return true;

      case 'exists':
        return actualVal !== undefined && actualVal !== null;

      case 'is_empty':
      case 'is empty':
      case 'empty':
        if (actualVal === undefined || actualVal === null || actualVal === '') return true;
        if (Array.isArray(actualVal)) return actualVal.length === 0;
        if (typeof actualVal === 'object') return Object.keys(actualVal as object).length === 0;
        return false;

      case 'greater_than':
      case 'greater than':
      case 'gt':
      case '>':
        return Number(actualVal) > Number(expectedVal);

      case 'less_than':
      case 'less than':
      case 'lt':
      case '<':
        return Number(actualVal) < Number(expectedVal);

      default:
        return true;
    }
  }
}
