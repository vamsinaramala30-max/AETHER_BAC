export class VariableEngine {
  /**
   * Resolves a nested dot path string from a given context object.
   * e.g., resolvePath({ trigger: { data: { title: 'Test' } } }, 'trigger.data.title') -> 'Test'
   */
  public static getPathValue(context: Record<string, unknown>, path: string): unknown {
    if (!context || !path) return undefined;
    const parts = path.trim().split('.');
    let current: unknown = context;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      if (typeof current === 'object') {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * Replaces template placeholder expressions in string or JSON payload.
   * e.g. "Hello {{trigger.data.name}}" -> "Hello Alice"
   */
  public static interpolate<T = unknown>(target: T, context: Record<string, unknown>): T {
    if (typeof target === 'string') {
      return target.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, path) => {
        const val = VariableEngine.getPathValue(context, path);
        if (val === undefined || val === null) return '';
        if (typeof val === 'object') return JSON.stringify(val);
        return String(val);
      }) as unknown as T;
    }

    if (Array.isArray(target)) {
      return target.map((item) => VariableEngine.interpolate(item, context)) as unknown as T;
    }

    if (target !== null && typeof target === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(target as Record<string, unknown>)) {
        result[key] = VariableEngine.interpolate(value, context);
      }
      return result as unknown as T;
    }

    return target;
  }
}
