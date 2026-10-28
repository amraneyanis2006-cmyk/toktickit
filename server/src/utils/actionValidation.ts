// Pure Action Taken field validation (specification.md BR-06, BR-07), kept out
// of the router so it is unit-testable (UNIT-03). Collects every field error at
// once, as api-spec.md sec 4 requires.

export const ACTION_LIMITS = {
  description: 2000,
  result: 2000,
  followUpNote: 1000,
  attachmentNotes: 500,
} as const;

/** BR-06: an Action Date/Time may be at most this far after the server time. */
export const ACTION_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

// ISO-8601 date-time with an explicit time zone, so the stored UTC value is never ambiguous.
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ActionFieldErrors = Record<string, string>;

export interface ActionFieldValues {
  actionAt?: Date;
  description?: string;
  result?: string | null;
  followUpRequired?: boolean;
  followUpNote?: string | null;
  attachmentNotes?: string | null;
}

export interface ActionValidationContext {
  mode: 'create' | 'update';
  ticketCreatedAt: Date;
  now?: Date;
  /** Stored follow-up state, required in update mode (the follow-up rule applies to the merged result). */
  current?: { followUpRequired: boolean; followUpNote: string | null };
}

export function parseIsoDateTime(value: unknown): Date | null {
  if (typeof value !== 'string' || !ISO_DATE_TIME.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

function startOfMinute(date: Date): Date {
  return new Date(Math.floor(date.getTime() / 60000) * 60000);
}

/** Optional text: string or null; trimmed; empty becomes null. Returns undefined + error on a wrong type. */
function optionalText(
  input: Record<string, unknown>,
  key: 'result' | 'attachmentNotes' | 'followUpNote',
  max: number,
  label: string,
  errors: ActionFieldErrors
): string | null | undefined {
  const raw = input[key];
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== 'string') {
    errors[key] = `${label} must be text.`;
    return undefined;
  }
  const trimmed = raw.trim();
  if (trimmed.length > max) {
    errors[key] = `${label} must not exceed ${max} characters.`;
    return undefined;
  }
  return trimmed === '' ? null : trimmed;
}

export function validateActionFields(
  input: Record<string, unknown>,
  ctx: ActionValidationContext
): { fields: ActionFieldErrors; data: ActionFieldValues } {
  const fields: ActionFieldErrors = {};
  const data: ActionFieldValues = {};
  const now = ctx.now ?? new Date();
  const creating = ctx.mode === 'create';
  const has = (key: string) => input[key] !== undefined;

  // Action Date/Time (BR-06). The lower bound is the ticket's creation minute:
  // the form's datetime-local value has minute precision, so "now" on a ticket
  // created seconds ago must not be rejected.
  if (creating || has('actionAt')) {
    const actionAt = parseIsoDateTime(input.actionAt);
    if (!actionAt) {
      fields.actionAt = 'Action Date/Time is required as an ISO-8601 date-time with a time zone.';
    } else if (actionAt < startOfMinute(ctx.ticketCreatedAt)) {
      fields.actionAt = 'Action Date/Time cannot be earlier than the ticket was created.';
    } else if (actionAt.getTime() > now.getTime() + ACTION_FUTURE_TOLERANCE_MS) {
      fields.actionAt = 'Action Date/Time cannot be in the future.';
    } else {
      data.actionAt = actionAt;
    }
  }

  // Action Description (BR-07): required, 1-2000 after trimming.
  if (creating || has('description')) {
    const raw = input.description;
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    if (typeof raw !== 'string' && raw !== undefined && raw !== null) {
      fields.description = 'Action Description must be text.';
    } else if (!trimmed) {
      fields.description = 'Action Description is required.';
    } else if (trimmed.length > ACTION_LIMITS.description) {
      fields.description = `Action Description must not exceed ${ACTION_LIMITS.description} characters.`;
    } else {
      data.description = trimmed;
    }
  }

  const result = optionalText(input, 'result', ACTION_LIMITS.result, 'Result', fields);
  if (result !== undefined) data.result = result;

  const attachmentNotes = optionalText(input, 'attachmentNotes', ACTION_LIMITS.attachmentNotes, 'Attachment Notes', fields);
  if (attachmentNotes !== undefined) data.attachmentNotes = attachmentNotes;

  // Follow-up (BR-07): the note is required iff Follow-Up Required is true on
  // the resulting record, and stored as null when it is false.
  let followUpRequired: boolean | undefined;
  if (has('followUpRequired')) {
    if (typeof input.followUpRequired !== 'boolean') {
      fields.followUpRequired = 'Follow-Up Required must be true or false.';
    } else {
      followUpRequired = input.followUpRequired;
      data.followUpRequired = followUpRequired;
    }
  } else if (creating) {
    followUpRequired = false;
    data.followUpRequired = false;
  }

  if (!fields.followUpRequired) {
    const effectiveRequired = followUpRequired ?? ctx.current?.followUpRequired ?? false;
    const noteErrors: ActionFieldErrors = {};
    const note = optionalText(input, 'followUpNote', ACTION_LIMITS.followUpNote, 'Follow-up Note', noteErrors);
    if (effectiveRequired) {
      const effectiveNote = has('followUpNote') ? note : creating ? undefined : ctx.current?.followUpNote;
      if (noteErrors.followUpNote) {
        fields.followUpNote = noteErrors.followUpNote;
      } else if (!effectiveNote) {
        fields.followUpNote = 'Follow-up Note is required when follow-up is needed.';
      } else if (has('followUpNote')) {
        data.followUpNote = note ?? null;
      }
    } else if (creating || has('followUpRequired') || has('followUpNote')) {
      data.followUpNote = null;
    }
  }

  if (has('clientRequestId') && input.clientRequestId !== null && !isUuid(input.clientRequestId)) {
    fields.clientRequestId = 'clientRequestId must be a UUID.';
  }

  if (has('performedById') && !(Number.isInteger(input.performedById) && (input.performedById as number) > 0)) {
    if (!(creating && input.performedById === null)) {
      fields.performedById = 'Performed by must be a user id.';
    }
  }

  return { fields, data };
}
