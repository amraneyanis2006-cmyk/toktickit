import { describe, it, expect } from 'vitest';
import { validateActionFields, ACTION_LIMITS } from '../../../src/utils/actionValidation';

const ticketCreatedAt = new Date('2026-10-28T03:00:30.000Z');
const now = new Date('2026-10-28T09:00:00.000Z');
const createCtx = { mode: 'create' as const, ticketCreatedAt, now };

function valid(overrides: Record<string, unknown> = {}) {
  return {
    actionAt: '2026-10-28T08:00:00.000Z',
    description: 'Reset the Wi-Fi profile.',
    followUpRequired: false,
    ...overrides,
  };
}

describe('Action Taken field validation (BR-06, BR-07)', () => {
  it('UNIT-03: accepts a valid action and trims every text field', () => {
    const { fields, data } = validateActionFields(
      valid({ description: '  Reset the profile.  ', result: '  Fixed  ', attachmentNotes: '  see wifi.png ' }),
      createCtx
    );
    expect(fields).toEqual({});
    expect(data.description).toBe('Reset the profile.');
    expect(data.result).toBe('Fixed');
    expect(data.attachmentNotes).toBe('see wifi.png');
    expect(data.actionAt).toEqual(new Date('2026-10-28T08:00:00.000Z'));
    expect(data.followUpRequired).toBe(false);
  });

  it('UNIT-03: rejects an empty (whitespace-only) and a too-long description', () => {
    expect(validateActionFields(valid({ description: '   ' }), createCtx).fields.description).toBeDefined();
    expect(validateActionFields(valid({ description: undefined }), createCtx).fields.description).toBeDefined();
    const long = 'x'.repeat(ACTION_LIMITS.description + 1);
    expect(validateActionFields(valid({ description: long }), createCtx).fields.description).toBeDefined();
    const max = 'x'.repeat(ACTION_LIMITS.description);
    expect(validateActionFields(valid({ description: max }), createCtx).fields.description).toBeUndefined();
  });

  it('UNIT-03: requires a Follow-up Note when Follow-Up Required, and stores null otherwise', () => {
    expect(validateActionFields(valid({ followUpRequired: true }), createCtx).fields.followUpNote).toBeDefined();
    expect(validateActionFields(valid({ followUpRequired: true, followUpNote: '  ' }), createCtx).fields.followUpNote).toBeDefined();
    const ok = validateActionFields(valid({ followUpRequired: true, followUpNote: ' Check on Friday ' }), createCtx);
    expect(ok.fields).toEqual({});
    expect(ok.data.followUpNote).toBe('Check on Friday');
    const tooLong = 'n'.repeat(ACTION_LIMITS.followUpNote + 1);
    expect(validateActionFields(valid({ followUpRequired: true, followUpNote: tooLong }), createCtx).fields.followUpNote).toBeDefined();

    const notRequired = validateActionFields(valid({ followUpRequired: false, followUpNote: 'ignored' }), createCtx);
    expect(notRequired.fields).toEqual({});
    expect(notRequired.data.followUpNote).toBeNull();
  });

  it('UNIT-03: rejects an Action Date/Time before the Ticket creation or later than now + 5 minutes', () => {
    expect(validateActionFields(valid({ actionAt: '2026-10-27T23:59:00.000Z' }), createCtx).fields.actionAt).toBeDefined();
    expect(validateActionFields(valid({ actionAt: '2026-10-28T09:05:01.000Z' }), createCtx).fields.actionAt).toBeDefined();
    expect(validateActionFields(valid({ actionAt: '2026-10-28T09:04:59.000Z' }), createCtx).fields.actionAt).toBeUndefined();
    // Same minute as the ticket creation is accepted (datetime-local has minute precision).
    expect(validateActionFields(valid({ actionAt: '2026-10-28T03:00:00.000Z' }), createCtx).fields.actionAt).toBeUndefined();
  });

  it('UNIT-03: rejects a missing or non ISO-8601 Action Date/Time', () => {
    expect(validateActionFields(valid({ actionAt: undefined }), createCtx).fields.actionAt).toBeDefined();
    expect(validateActionFields(valid({ actionAt: '28/10/2026 08:00' }), createCtx).fields.actionAt).toBeDefined();
    expect(validateActionFields(valid({ actionAt: '2026-10-28T08:00' }), createCtx).fields.actionAt).toBeDefined();
    expect(validateActionFields(valid({ actionAt: 1730102400000 }), createCtx).fields.actionAt).toBeDefined();
  });

  it('UNIT-03: limits Result and Attachment Notes, stores empty optional text as null', () => {
    const r = validateActionFields(
      valid({ result: 'r'.repeat(ACTION_LIMITS.result + 1), attachmentNotes: 'a'.repeat(ACTION_LIMITS.attachmentNotes + 1) }),
      createCtx
    );
    expect(r.fields.result).toBeDefined();
    expect(r.fields.attachmentNotes).toBeDefined();
    const empty = validateActionFields(valid({ result: '  ', attachmentNotes: '' }), createCtx);
    expect(empty.data.result).toBeNull();
    expect(empty.data.attachmentNotes).toBeNull();
  });

  it('UNIT-03: returns every field error at once', () => {
    const { fields } = validateActionFields(
      {
        actionAt: 'nope',
        description: '',
        result: 'r'.repeat(2001),
        followUpRequired: true,
        followUpNote: '',
        attachmentNotes: 'a'.repeat(501),
        clientRequestId: 'not-a-uuid',
        performedById: 'twelve',
      },
      createCtx
    );
    expect(Object.keys(fields).sort()).toEqual(
      ['actionAt', 'attachmentNotes', 'clientRequestId', 'description', 'followUpNote', 'performedById', 'result'].sort()
    );
  });

  it('UNIT-03: rejects wrong types', () => {
    const { fields } = validateActionFields(
      valid({ description: 42, followUpRequired: 'yes', result: 7, attachmentNotes: {} }),
      createCtx
    );
    expect(fields.description).toBeDefined();
    expect(fields.followUpRequired).toBeDefined();
    expect(fields.result).toBeDefined();
    expect(fields.attachmentNotes).toBeDefined();
  });

  it('UNIT-03: update mode validates only supplied fields and applies the follow-up rule to the merged state', () => {
    const current = { followUpRequired: true, followUpNote: 'Existing note' };
    const updateCtx = { mode: 'update' as const, ticketCreatedAt, now, current };

    const onlyResult = validateActionFields({ result: 'Partially fixed' }, updateCtx);
    expect(onlyResult.fields).toEqual({});
    expect(onlyResult.data).toEqual({ result: 'Partially fixed' });

    // Clearing the note while follow-up stays required is rejected.
    expect(validateActionFields({ followUpNote: '' }, updateCtx).fields.followUpNote).toBeDefined();

    // Switching follow-up off clears the note.
    const off = validateActionFields({ followUpRequired: false }, updateCtx);
    expect(off.fields).toEqual({});
    expect(off.data).toEqual({ followUpRequired: false, followUpNote: null });

    // Switching follow-up on with no stored note requires one.
    const noNote = { mode: 'update' as const, ticketCreatedAt, now, current: { followUpRequired: false, followUpNote: null } };
    expect(validateActionFields({ followUpRequired: true }, noNote).fields.followUpNote).toBeDefined();

    // A supplied empty description is still invalid in update mode.
    expect(validateActionFields({ description: ' ' }, updateCtx).fields.description).toBeDefined();
  });
});
