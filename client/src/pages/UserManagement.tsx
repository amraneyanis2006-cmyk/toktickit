import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { apiFetch, ApiError } from '../api/apiClient';
import { useAuth } from '../context/AuthContext';

type Role = 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR';

interface UserRow {
  id: number;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
}

type PanelState = null | { mode: 'create' } | { mode: 'edit'; user: UserRow };
type FetchState = 'loading' | 'success' | 'error';

const ROLES: Role[] = ['REQUESTER', 'IT_STAFF', 'ADMINISTRATOR'];
const ROLE_LABEL: Record<Role, string> = {
  REQUESTER: 'Requester',
  IT_STAFF: 'IT Staff',
  ADMINISTRATOR: 'Administrator',
};
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CONSOLE_NOTE = 'It was written to the server console (local testing only).';

// Badge classes live in zen-green.css (.zg-badge-role-*, .zg-badge-active-*),
// consolidated there during the #20 visual QA pass per ui-spec.md sec 2.
function RoleBadge({ role }: { role: Role }) {
  return <span className={`zg-badge zg-badge-role-${role.toLowerCase()}`}>{ROLE_LABEL[role]}</span>;
}

function ActiveBadge({ isActive }: { isActive: boolean }) {
  return (
    <span className={`zg-badge zg-badge-active-${isActive}`}>{isActive ? 'Active' : 'Inactive'}</span>
  );
}

function useIsMobile(): boolean {
  const query = '(max-width: 767.98px)';
  const supported = typeof window !== 'undefined' && typeof window.matchMedia === 'function';
  const [mobile, setMobile] = useState(() => (supported ? window.matchMedia(query).matches : false));

  useEffect(() => {
    if (!supported) return;
    const mq = window.matchMedia(query);
    const onChange = () => setMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [supported]);

  return mobile;
}

interface UserPanelProps {
  mode: 'create' | 'edit';
  user: UserRow | null;
  currentUserId: number | undefined;
  lastActiveAdmin: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}

function UserPanel({ mode, user, currentUserId, lastActiveAdmin, onClose, onSaved }: UserPanelProps) {
  const isMobile = useIsMobile();
  const dialogRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(document.activeElement as HTMLElement | null);

  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  // New users default to the least-privileged role rather than forcing a blank choice.
  const [role, setRole] = useState<Role>(user?.role ?? 'REQUESTER');
  const [isActive, setIsActive] = useState(user?.isActive ?? true);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [bannerError, setBannerError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  const isSelf = mode === 'edit' && user !== null && user.id === currentUserId;
  const lockedReason: string | null = isSelf
    ? 'You cannot change your own role or deactivate your own account.'
    : mode === 'edit' && lastActiveAdmin
      ? 'This is the last active Administrator, so role and activation are locked.'
      : null;
  const locked = lockedReason !== null;

  useEffect(() => {
    nameRef.current?.focus();
    const previous = opener.current;
    return () => previous?.focus?.();
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled])'
    );
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const reportError = (err: unknown) => {
    if (err instanceof ApiError) {
      if (err.code === 'DUPLICATE_EMAIL') setFieldErrors({ email: err.message });
      else if (err.code === 'VALIDATION_ERROR' && err.fields) setFieldErrors(err.fields);
      else setBannerError(err.message);
    } else {
      setBannerError('Unable to save. Please try again.');
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBannerError('');

    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = 'Name is required.';
    if (!email.trim()) errors.email = 'Email is required.';
    else if (!EMAIL_PATTERN.test(email.trim())) errors.email = 'Enter a valid email address.';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      if (mode === 'create') {
        await apiFetch('/admin/users', {
          method: 'POST',
          body: JSON.stringify({ name: name.trim(), email: email.trim(), role, isActive }),
        });
        onSaved(`User created. Their initial password was issued. ${CONSOLE_NOTE}`);
      } else if (user) {
        const patch: Record<string, unknown> = {};
        if (name.trim() !== user.name) patch.name = name.trim();
        if (email.trim().toLowerCase() !== user.email.toLowerCase()) patch.email = email.trim();
        if (!locked && role !== user.role) patch.role = role;
        if (!locked && isActive !== user.isActive) patch.isActive = isActive;

        if (Object.keys(patch).length === 0) {
          onClose();
          return;
        }
        await apiFetch(`/admin/users/${user.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
        onSaved('User updated.');
      }
    } catch (err) {
      reportError(err);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!user) return;
    setResetting(true);
    setBannerError('');
    try {
      await apiFetch(`/admin/users/${user.id}/reset-password`, { method: 'PATCH' });
      onSaved(`New initial password issued for ${user.name}. ${CONSOLE_NOTE} They must change it at next login.`);
    } catch (err) {
      setConfirmReset(false);
      reportError(err);
    } finally {
      setResetting(false);
    }
  };

  const busy = saving || resetting;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(31, 42, 36, 0.45)',
        zIndex: 1050,
        overflowY: 'auto',
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-panel-title"
        onKeyDown={handleKeyDown}
        className="zg-card p-4 mx-auto"
        style={
          isMobile
            ? { minHeight: '100%', width: '100%', borderRadius: 0 }
            : { maxWidth: '520px', marginTop: '4rem', marginBottom: '4rem' }
        }
      >
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h2 id="user-panel-title" className="h5 mb-0">
            {mode === 'create' ? 'Create User' : 'Edit User'}
          </h2>
          <button type="button" className="btn btn-zg-tertiary" onClick={onClose} aria-label="Close" title="Close">
            &#x2715;
          </button>
        </div>

        {bannerError && (
          <div className="zg-callout-error mb-3" role="alert">
            {bannerError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-3">
            <label htmlFor="user-name" className="zg-label">
              Full Name<span className="zg-required-asterisk">*</span>
            </label>
            <input
              id="user-name"
              ref={nameRef}
              type="text"
              className={`form-control ${fieldErrors.name ? 'is-invalid' : ''}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
            {fieldErrors.name && <div className="zg-field-error">{fieldErrors.name}</div>}
          </div>

          <div className="mb-3">
            <label htmlFor="user-email" className="zg-label">
              Email Address<span className="zg-required-asterisk">*</span>
            </label>
            <input
              id="user-email"
              type="email"
              className={`form-control ${fieldErrors.email ? 'is-invalid' : ''}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
            {fieldErrors.email && <div className="zg-field-error">{fieldErrors.email}</div>}
          </div>

          <div className="mb-3">
            <label htmlFor="user-role" className="zg-label">
              Role<span className="zg-required-asterisk">*</span>
            </label>
            <span title={lockedReason ?? undefined} className="d-block">
              <select
                id="user-role"
                className={`form-select ${fieldErrors.role ? 'is-invalid' : ''}`}
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                disabled={busy || locked}
                aria-describedby={lockedReason ? 'user-locked-hint' : undefined}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </span>
            {fieldErrors.role && <div className="zg-field-error">{fieldErrors.role}</div>}
          </div>

          <div className="mb-3">
            <span title={lockedReason ?? undefined} className="d-block">
              <div className="form-check form-switch">
                <input
                  id="user-active"
                  className="form-check-input"
                  type="checkbox"
                  role="switch"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  disabled={busy || locked}
                  aria-describedby={lockedReason ? 'user-locked-hint' : undefined}
                />
                <label htmlFor="user-active" className="form-check-label">
                  Active
                </label>
              </div>
            </span>
            {lockedReason && (
              <div id="user-locked-hint" className="form-text">
                {lockedReason}
              </div>
            )}
          </div>

          {mode === 'create' && (
            <div className="zg-callout-info small mb-3">
              An initial password will be generated for this user. They must change it at first login.
            </div>
          )}

          {mode === 'edit' && user && (
            <div className="mb-3">
              {!confirmReset ? (
                <button
                  type="button"
                  className="btn btn-zg-secondary btn-sm"
                  onClick={() => setConfirmReset(true)}
                  disabled={busy}
                >
                  Set New Initial Password
                </button>
              ) : (
                <div className="zg-callout-error" role="alertdialog" aria-label="Confirm password reset">
                  <p className="mb-1 fw-semibold">Issue a new initial password for {user.name}?</p>
                  <p className="small mb-2">
                    Their current password stops working and they must choose a new one at next login.
                  </p>
                  <div className="d-flex gap-2">
                    <button
                      type="button"
                      className="btn btn-sm btn-zg-primary"
                      onClick={handleReset}
                      disabled={resetting}
                    >
                      {resetting ? 'Issuing...' : 'Yes, issue new password'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-zg-secondary"
                      onClick={() => setConfirmReset(false)}
                      disabled={resetting}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="d-flex justify-content-end gap-2">
            <button type="button" className="btn btn-zg-secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn btn-zg-primary" disabled={busy}>
              {saving ? 'Saving...' : mode === 'create' ? 'Create User' : 'Save User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function UserManagement() {
  const { user: me } = useAuth();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>('loading');
  const latestRequestId = useRef(0);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [activeAdminCount, setActiveAdminCount] = useState<number | null>(null);
  const [panel, setPanel] = useState<PanelState>(null);
  const [notice, setNotice] = useState('');

  const filtersActive = Boolean(search.trim() || roleFilter);

  const loadUsers = useCallback(async () => {
    const requestId = ++latestRequestId.current;
    setFetchState('loading');
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (roleFilter) params.set('role', roleFilter);
      const qs = params.toString();
      const data = await apiFetch<UserRow[]>(`/admin/users${qs ? `?${qs}` : ''}`);
      if (requestId !== latestRequestId.current) return; // a newer request has already superseded this one
      setUsers(data);
      setFetchState('success');
    } catch {
      if (requestId === latestRequestId.current) setFetchState('error');
    }
  }, [search, roleFilter]);

  // Separate, UNFILTERED request: the "last active Administrator" lock must not depend on
  // the current search/role filter. UX only - the server enforces BR-22 regardless.
  const loadActiveAdminCount = useCallback(async () => {
    try {
      const admins = await apiFetch<UserRow[]>('/admin/users?role=ADMINISTRATOR');
      setActiveAdminCount(admins.filter((a) => a.isActive).length);
    } catch {
      setActiveAdminCount(null);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    loadActiveAdminCount();
  }, [loadActiveAdminCount]);

  const clearFilters = () => {
    setSearch('');
    setRoleFilter('');
  };

  const handleSaved = (message: string) => {
    setPanel(null);
    setNotice(message);
    loadUsers();
    loadActiveAdminCount();
  };

  const isLastActiveAdmin = (u: UserRow) => u.role === 'ADMINISTRATOR' && u.isActive && activeAdminCount === 1;

  return (
    <div className="zg-card p-4">
      <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-4">
        <div>
          <h1 className="h4 mb-1">Users</h1>
          <p className="text-muted small mb-0">Create accounts, assign one role, and activate or deactivate users.</p>
        </div>
        <button type="button" className="btn btn-zg-primary" onClick={() => setPanel({ mode: 'create' })}>
          + Create User
        </button>
      </div>

      {notice && (
        <div className="zg-callout-info d-flex justify-content-between align-items-start gap-2 mb-3" role="status">
          <span>{notice}</span>
          <button type="button" className="btn btn-sm btn-zg-tertiary" onClick={() => setNotice('')} aria-label="Dismiss">
            &#x2715;
          </button>
        </div>
      )}

      <div className="row g-2 mb-4">
        <div className="col-12 col-md-6">
          <input
            type="search"
            className="form-control"
            placeholder="Search by name or email..."
            aria-label="Search users"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="col-8 col-md-4">
          <select
            className="form-select"
            aria-label="Filter by role"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="">All Roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        <div className="col-4 col-md-2">
          {filtersActive && (
            <button type="button" className="btn btn-zg-tertiary w-100" onClick={clearFilters}>
              Clear
            </button>
          )}
        </div>
      </div>

      {fetchState === 'error' && (
        <div className="zg-callout-error text-center py-4" role="alert">
          <p className="mb-3 fw-semibold">Unable to load users.</p>
          <button type="button" className="btn btn-zg-secondary" onClick={loadUsers}>
            Retry
          </button>
        </div>
      )}

      {fetchState === 'loading' && <div className="text-center text-muted py-5">Loading users...</div>}

      {fetchState === 'success' && users.length === 0 && !filtersActive && (
        <div className="text-center py-5">
          <p className="text-muted mb-0">No users yet.</p>
        </div>
      )}

      {fetchState === 'success' && users.length === 0 && filtersActive && (
        <div className="text-center py-5">
          <p className="text-muted mb-3">No users match your search.</p>
          <button type="button" className="btn btn-zg-secondary" onClick={clearFilters}>
            Clear Filters
          </button>
        </div>
      )}

      {fetchState === 'success' && users.length > 0 && (
        <>
          <div className="table-responsive d-none d-md-block">
            <table className="table align-middle">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="fw-semibold">
                      {u.name}
                      {u.id === me?.id && <span className="text-muted small"> (you)</span>}
                    </td>
                    <td>{u.email}</td>
                    <td>
                      <RoleBadge role={u.role} />
                    </td>
                    <td>
                      <ActiveBadge isActive={u.isActive} />
                    </td>
                    <td className="text-end">
                      <button
                        type="button"
                        className="btn btn-sm btn-zg-secondary"
                        aria-label={`Edit ${u.name}`}
                        onClick={() => setPanel({ mode: 'edit', user: u })}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="d-md-none d-flex flex-column gap-3">
            {users.map((u) => (
              <div key={u.id} className="zg-card p-3">
                <div className="d-flex justify-content-between align-items-start mb-2">
                  <div>
                    <div className="fw-semibold">
                      {u.name}
                      {u.id === me?.id && <span className="text-muted small"> (you)</span>}
                    </div>
                    <div className="text-muted small">{u.email}</div>
                  </div>
                  <div className="d-flex gap-1 flex-wrap justify-content-end">
                    <RoleBadge role={u.role} />
                    <ActiveBadge isActive={u.isActive} />
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-zg-secondary w-100"
                  aria-label={`Edit ${u.name}`}
                  onClick={() => setPanel({ mode: 'edit', user: u })}
                >
                  Edit
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {panel && (
        <UserPanel
          key={panel.mode === 'edit' ? `edit-${panel.user.id}` : 'create'}
          mode={panel.mode}
          user={panel.mode === 'edit' ? panel.user : null}
          currentUserId={me?.id}
          lastActiveAdmin={panel.mode === 'edit' && isLastActiveAdmin(panel.user)}
          onClose={() => setPanel(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
