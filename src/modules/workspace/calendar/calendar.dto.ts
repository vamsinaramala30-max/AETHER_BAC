import { z } from 'zod';

export const CreateCalendarSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  color: z
    .string()
    .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .default('#039BE5'),
  timeZone: z.string().default('UTC'),
  // Use a string for calendar type to avoid depending on generated Prisma enums here
  type: z.string().default('PERSONAL'),
});

export const UpdateCalendarSchema = CreateCalendarSchema.partial();

export const CreateEventBase = z.object({
  calendarId: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  location: z.string().optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  isAllDay: z.boolean().default(false),
  // Use strings for enums to avoid Prisma-generated types in the DTO layer
  status: z.string().default('CONFIRMED'),
  visibility: z.string().default('PUBLIC'),
  timeZone: z.string().default('UTC'),
  rrule: z.string().optional(),
  participants: z
    .array(
      z.object({
        userId: z.string().uuid(),
        role: z.string().default('REQUIRED'),
      }),
    )
    .optional(),
  reminders: z
    .array(
      z.object({
        minutes: z.number().int().nonnegative(),
        method: z.string().default('IN_APP'),
      }),
    )
    .optional(),
});

export const CreateEventSchema = CreateEventBase.refine(
  (data) => {
    // Cast to string to satisfy Date constructor overloads
    const start = new Date(String((data as any).startTime));
    const end = new Date(String((data as any).endTime));
    return start < end;
  },
  {
    message: 'startTime must precede endTime',
  },
);

export const UpdateEventSchema = CreateEventBase.partial().extend({
  calendarId: z.string().uuid().optional(),
});

export const RespondInvitationSchema = z.object({
  status: z.enum(['ACCEPTED', 'DECLINED', 'TENTATIVE']),
});

export type CreateCalendarDTO = z.infer<typeof CreateCalendarSchema>;
export type UpdateCalendarDTO = z.infer<typeof UpdateCalendarSchema>;
export type CreateEventDTO = z.infer<typeof CreateEventSchema>;
export type UpdateEventDTO = z.infer<typeof UpdateEventSchema>;
export type RespondInvitationDTO = z.infer<typeof RespondInvitationSchema>;
