import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { apiFetch, ApiError } from '../api/apiClient';
import ConfirmDialog from './ConfirmDialog';
import { formatDateTime, isLocked } from '../utils/actions';
import type { ActionTaken, StaffUser } from './ActionsTaken';

// Create / view / edit panel of one Action Taken (ui-spec sec 6). Values are
// kept after every failure; a create keeps one clientRequestId for retries.

interface Form {
  actionAt: string;
  description: string;
  result: string;
  performedById: string;
  followUpRequired: boolean;
  followUpNote: string;
  attachmentNotes: string;
}

/** datetime-local value (local time, minute precision) for an instant. */
function toLocalInput(d: Date) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function formFrom(a: ActionTaken | null, meId: number): Form {
  return {
    actionAt: toLocalInput(a ? new Date(a.actionAt) : new Date()),
    description: a?.description ?? '',
    result: a?.result ?? '',
    performedById: String(a?.performedBy.id ?? meId),
    followUpRequired: a?.followUpRequired ?? false,
    followUpNote: a?.followUpNote ?? '',
    attachmentNotes: a?.attachmentNotes ?? '',
  };
}

const MESSAGES = {
  stale: 'Someone else updated this action. The latest version is shown.',
  assignee: "This person can't be assigned (inactive or not IT Staff).",
  notActive: "This ticket is no longer active, so its actions can't be changed.",
  reused: 'This request was already saved. The saved action is shown.',
};

export default function ActionPanel({
  ticketNumber, action, staffUsers, currentUser, onClose, onSaved,
}: {
  ticketNumber: string;
  action: ActionTaken | null;
  staffUsers: StaffUser[];
  currentUser: { id: number; name: string };
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [current, setCurrent] = useState(action);
  const [form, setForm] = useState(() => formFrom(action, currentUser.id));
  const [clientRequestId] = useState(() => crypto.randomUUID());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const [unsaved, setUnsaved] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  const resultRef = useRef<HTMLTextAreaElement>(null);

  const locked = current !== null && isLocked(current);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const base = `/staff/tickets/${ticketNumber}/actions`;

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.description.trim()) e.description = 'Action Description is required.';
    if (form.followUpRequired && !form.followUpNote.trim()) e.followUpNote = 'Follow-up Note is required when follow-up is needed.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const fail = (err: unknown) => {
    const api = err instanceof ApiError ? err : null;
    const latest = api?.details?.current as ActionTaken | undefined;
    if (api?.code === 'STALE_UPDATE' && latest) {
      setUnsaved(form);
      setCurrent(latest);
      setForm(formFrom(latest, currentUser.id));
      setBanner({ kind: 'info', text: MESSAGES.stale });
    } else if (api?.code === 'IDEMPOTENCY_KEY_REUSED' && latest) {
      setCurrent(latest);
      setForm(formFrom(latest, currentUser.id));
      setBanner({ kind: 'info', text: MESSAGES.reused });
      setNeedsReload(true);
    } else if (api?.code === 'INVALID_ASSIGNEE') {
      setErrors({ performedById: MESSAGES.assignee });
    } else if (api?.code === 'TICKET_NOT_ACTIVE') {
      setBanner({ kind: 'error', text: MESSAGES.notActive });
      setNeedsReload(true);
    } else if (api?.fields) {
      setErrors(api.fields);
    } else {
      setBanner({ kind: 'error', text: api?.message ?? 'Unable to save the action.' });
    }
  };

  const send = async (path: string, method: 'POST' | 'PATCH', body: Record<string, unknown>) => {
    setBusy(true);
    setBanner(null);
    try {
      await apiFetch(path, { method, body: JSON.stringify(body) });
      await onSaved();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const fields = () => ({
    actionAt: new Date(form.actionAt).toISOString(),
    description: form.description,
    result: form.result.trim() || null,
    followUpRequired: form.followUpRequired,
    followUpNote: form.followUpRequired ? form.followUpNote : null,
    attachmentNotes: form.attachmentNotes.trim() || null,
    performedById: Number(form.performedById),
  });

  const save = () => {
    if (!validate()) return;
    if (current) send(`${base}/${current.id}`, 'PATCH', { ...fields(), expectedUpdatedAt: current.updatedAt });
    else send(base, 'POST', { ...fields(), clientRequestId });
  };

  const changeStatus = (status: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED') => {
    if (!current) return;
    if (status === 'COMPLETED' && !form.result.trim()) {
      setErrors({ result: 'A Result is required to complete the action.' });
      resultRef.current?.focus();
      return;
    }
    setConfirmCancel(false);
    send(`${base}/${current.id}/status`, 'PATCH', {
      status, ...(status === 'COMPLETED' ? { result: form.result.trim() } : {}), expectedUpdatedAt: current.updatedAt,
    });
  };

  const close = () => (needsReload ? onSaved() : onClose());

  const field = (key: keyof Form, label: string, input: ReactNode, required = false) => (
    <div className="mb-3">
      <label htmlFor={`action-${key}`} className="zg-label">
        {label}{required && <span className="zg-required-asterisk" aria-hidden="true"> *</span>}
      </label>
      {input}
      {errors[key] && <div id={`${key}-error`} className="zg-field-error" role="alert">{errors[key]}</div>}
    </div>
  );
  const a11y = (key: keyof Form, required = false) => ({
    id: `action-${key}`,
    'aria-required': required || undefined,
    'aria-invalid': errors[key] ? true : undefined,
    'aria-describedby': errors[key] ? `${key}-error` : undefined,
  });

  return (
    <div className="zg-card p-3 mb-3" aria-label={current ? 'Action details' : 'New action'} role="region">
      <h3 className="h6">{current ? (locked ? 'Action (locked)' : 'Edit action') : 'Add action'}</h3>
      {banner && <div className={`zg-callout-${banner.kind} p-2 mb-3`} role={banner.kind === 'error' ? 'alert' : 'status'}>{banner.text}</div>}

      {locked && current ? (
        <dl className="mb-3">
          {([
            ['Action Date/Time', formatDateTime(current.actionAt)], ['Action Description', current.description],
            ['Result', current.result ?? '—'], ['Performed by', current.performedBy.name],
            ['Follow-up Note', current.followUpRequired ? current.followUpNote : 'No follow-up'],
            ['Attachment Notes', current.attachmentNotes ?? '—'], ['Recorded by', current.createdBy.name],
          ] as Array<[string, string | null]>).map(([label, value]) => (
            <div key={label} className="mb-2"><dt className="zg-label">{label}</dt><dd className="zg-readonly-field mb-0">{value}</dd></div>
          ))}
        </dl>
      ) : (
        <>
          <p className="small text-muted mb-3">Recorded by {current ? current.createdBy.name : currentUser.name}</p>
          {field('actionAt', 'Action Date/Time', <input type="datetime-local" className="form-control" value={form.actionAt} onChange={(e) => set('actionAt', e.target.value)} {...a11y('actionAt', true)} />, true)}
          {field('description', 'Action Description', (
            <textarea className="form-control" rows={3} maxLength={2000} value={form.description} onChange={(e) => set('description', e.target.value)} {...a11y('description', true)} />
          ), true)}
          <div className="text-muted small text-end mb-2" style={{ marginTop: '-0.75rem' }}>{form.description.length}/2000</div>
          {field('result', 'Result', (
            <textarea ref={resultRef} className="form-control" rows={2} maxLength={2000} value={form.result} onChange={(e) => set('result', e.target.value)} {...a11y('result')} />
          ))}
          {field('performedById', 'Performed by (defaults to you)', (
            <select className="form-select" value={form.performedById} onChange={(e) => set('performedById', e.target.value)} {...a11y('performedById')}>
              {(staffUsers.some((u) => u.id === currentUser.id) ? staffUsers : [currentUser, ...staffUsers]).map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          ))}
          <div className="form-check mb-3">
            <input type="checkbox" className="form-check-input" id="action-followUpRequired" checked={form.followUpRequired} onChange={(e) => set('followUpRequired', e.target.checked)} />
            <label htmlFor="action-followUpRequired" className="form-check-label">Follow-up Required?</label>
          </div>
          {form.followUpRequired && field('followUpNote', 'Follow-up Note', (
            <textarea className="form-control" rows={2} maxLength={1000} value={form.followUpNote} onChange={(e) => set('followUpNote', e.target.value)} {...a11y('followUpNote', true)} />
          ), true)}
          {field('attachmentNotes', 'Attachment Notes', (
            <input type="text" className="form-control" maxLength={500} placeholder="Which file shows the evidence, e.g. wifi-error.png" value={form.attachmentNotes} onChange={(e) => set('attachmentNotes', e.target.value)} {...a11y('attachmentNotes')} />
          ))}
        </>
      )}

      {unsaved && (
        <div className="zg-callout-neutral p-2 mb-3 small">
          <div className="fw-semibold">Your unsaved text:</div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{unsaved.description}</div>
          {unsaved.result && <div style={{ whiteSpace: 'pre-wrap' }}>{unsaved.result}</div>}
        </div>
      )}

      <div className="d-flex flex-wrap gap-2">
        {!locked && (
          <button type="button" className="btn btn-sm btn-zg-primary" disabled={busy} onClick={save}>
            {busy ? 'Saving...' : current ? 'Save changes' : 'Save'}
          </button>
        )}
        {current && !locked && current.status === 'PLANNED' && (
          <button type="button" className="btn btn-sm btn-zg-secondary" disabled={busy} onClick={() => changeStatus('IN_PROGRESS')}>Start</button>
        )}
        {current && !locked && (
          <>
            <button type="button" className="btn btn-sm btn-zg-secondary" disabled={busy} onClick={() => changeStatus('COMPLETED')}>Complete</button>
            <button type="button" className="btn btn-sm btn-zg-tertiary" disabled={busy} onClick={() => setConfirmCancel(true)}>Cancel action</button>
          </>
        )}
        <button type="button" className="btn btn-sm btn-zg-tertiary ms-auto" onClick={close}>Close</button>
      </div>

      {confirmCancel && (
        <ConfirmDialog
          title="Cancel this action? It stays in the history and can't be edited."
          confirmLabel="Yes, cancel action"
          cancelLabel="Keep action"
          busy={busy}
          onConfirm={() => changeStatus('CANCELLED')}
          onCancel={() => setConfirmCancel(false)}
        />
      )}
    </div>
  );
}
