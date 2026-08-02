export const CALENDAR_ERRORS = {
  UNAUTHORIZED: 'User lacks required access permissions for this resource',
  NOT_FOUND: 'Requested entity was not found',
  CONFLICT: 'Temporal overlap or scheduling collision detected',
  INVALID_RRULE: 'The provided Recurrence Rule (RRule) format is invalid',
  SYNC_FAILED: 'Third-party synchronization pipeline failed',
};

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 250;
