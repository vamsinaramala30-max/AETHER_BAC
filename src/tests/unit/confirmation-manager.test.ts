import { describe, it, expect } from 'vitest';
import { ConfirmationManager } from '../../modules/ai/core/confirmation-manager.js';

describe('ConfirmationManager', () => {
  const manager = new ConfirmationManager();

  it('should categorize destructive actions as DESTRUCTIVE', () => {
    expect(manager.getRiskLevel('delete_project', {})).toBe('DESTRUCTIVE');
    expect(manager.getRiskLevel('removeMemory', {})).toBe('DESTRUCTIVE');
  });

  it('should categorize updates as HIGH_RISK_WRITE', () => {
    expect(manager.getRiskLevel('update_project', {})).toBe('HIGH_RISK_WRITE');
  });

  it('should categorize list/search actions as READ', () => {
    expect(manager.getRiskLevel('list_automations', {})).toBe('READ');
  });

  it('should require confirmation for DESTRUCTIVE actions when not confirmed', () => {
    expect(manager.requiresConfirmation('delete_project', {})).toBe(true);
  });

  it('should NOT require confirmation if confirmedActionId is present', () => {
    expect(manager.requiresConfirmation('delete_project', {}, 'conf_123456')).toBe(false);
  });
});
