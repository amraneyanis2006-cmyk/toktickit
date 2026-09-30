import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiFetch, ApiError } from '../api/apiClient';

export default function ChangePassword() {
  const { user, refresh, logout } = useAuth();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [bannerError, setBannerError] = useState('');

  if (user && !user.mustChangePassword) {
    return <Navigate to="/tickets" replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setBannerError('');

    if (newPassword.length < 8) {
      setFieldErrors({ newPassword: 'Must be at least 8 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setFieldErrors({ confirmPassword: 'Passwords do not match.' });
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      await refresh();
      navigate('/tickets');
    } catch (err) {
      if (err instanceof ApiError && err.fields) {
        setFieldErrors(err.fields);
      } else {
        setBannerError(err instanceof ApiError ? err.message : 'Unable to change password.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="d-flex justify-content-center align-items-start"
      style={{ minHeight: '80vh', paddingTop: '4rem' }}
    >
      <div className="zg-card p-4" style={{ maxWidth: '440px', width: '100%' }}>
        <h1 className="h4 fw-semibold mb-2">Change Your Password</h1>
        <p className="text-muted small mb-4">You must set a new password to continue.</p>

        {bannerError && (
          <div className="zg-callout-error mb-3" role="alert">
            {bannerError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-3">
            <label htmlFor="currentPassword" className="zg-label">
              Current (temporary) password
            </label>
            <input
              id="currentPassword"
              type="password"
              className={`form-control ${fieldErrors.currentPassword ? 'is-invalid' : ''}`}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              disabled={submitting}
              required
            />
            {fieldErrors.currentPassword && (
              <div className="zg-field-error">{fieldErrors.currentPassword}</div>
            )}
          </div>
          <div className="mb-1">
            <label htmlFor="newPassword" className="zg-label">
              New password
            </label>
            <input
              id="newPassword"
              type="password"
              className={`form-control ${fieldErrors.newPassword ? 'is-invalid' : ''}`}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={submitting}
              required
            />
            {fieldErrors.newPassword && <div className="zg-field-error">{fieldErrors.newPassword}</div>}
          </div>
          <div className="form-text mb-3">
            Must be at least 8 characters and different from your current password.
          </div>
          <div className="mb-4">
            <label htmlFor="confirmPassword" className="zg-label">
              Confirm new password
            </label>
            <input
              id="confirmPassword"
              type="password"
              className={`form-control ${fieldErrors.confirmPassword ? 'is-invalid' : ''}`}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={submitting}
              required
            />
            {fieldErrors.confirmPassword && (
              <div className="zg-field-error">{fieldErrors.confirmPassword}</div>
            )}
          </div>
          <button type="submit" className="btn btn-zg-primary w-100 mb-2" disabled={submitting}>
            {submitting ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
                Saving...
              </>
            ) : (
              'Save New Password'
            )}
          </button>
          <button type="button" className="btn btn-zg-tertiary w-100" onClick={() => logout()}>
            Logout
          </button>
        </form>
      </div>
    </div>
  );
}
