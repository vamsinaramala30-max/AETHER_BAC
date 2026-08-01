import { RRule, RRuleSet, rrulestr } from 'rrule';

export class RecurrenceEngine {
  static parseRule(rruleStr: string, dtstart: Date): RRule {
    return rrulestr(rruleStr, { dtstart }) as RRule;
  }

  static generateInstances(rruleStr: string, dtstart: Date, windowStart: Date, windowEnd: Date): Date[] {
    const rule = this.parseRule(rruleStr, dtstart);
    return rule.between(windowStart, windowEnd, true);
  }

  static validateRRule(rruleStr: string): boolean {
    try {
      RRule.fromString(rruleStr);
      return true;
    } catch {
      return false;
    }
  }
}