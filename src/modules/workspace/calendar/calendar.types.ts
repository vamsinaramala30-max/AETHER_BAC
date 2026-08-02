// Local enum definitions to avoid relying on generated Prisma types
export enum CalendarRole {
  OWNER = 'OWNER',
  EDITOR = 'EDITOR',
  VIEWER = 'VIEWER',
  MEMBER = 'MEMBER',
}

export enum CalendarType {
  PERSONAL = 'PERSONAL',
  TEAM = 'TEAM',
  WORKSPACE = 'WORKSPACE',
  SHARED = 'SHARED',
}

export enum EventStatus {
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
  TENTATIVE = 'TENTATIVE',
}

export enum RSVPStatus {
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
  TENTATIVE = 'TENTATIVE',
}

export interface CalendarCreateInput {
  name: string;
  description?: string;
  color?: string;
  type?: CalendarType;
  timeZone?: string;
}

export interface CalendarUpdateInput {
  name?: string;
  description?: string;
  color?: string;
  timeZone?: string;
}

export interface CalendarWithRole {
  id: string;
  name: string;
  description: string | null;
  color: string;
  type: CalendarType;
  isPrimary: boolean;
  timeZone: string;
  role: CalendarRole;
}

export interface ExpandedEvent {
  id: string;
  title: string;
  description?: string;
  location?: string;
  start: Date | string;
  end: Date | string;
  [key: string]: any;
}
