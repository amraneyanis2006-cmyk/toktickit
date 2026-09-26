import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../api/apiClient';

export default function Login() {
  const { user, status, login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (status === 'ready' && user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invalid email or password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="d-flex justify-content-center align-items-start"
      style={{ minHeight: '80vh', paddingTop: '4rem' }}
    >
      <div className="zg-card p-4" style={{ maxWidth: '400px', width: '100%' }}>
        <h1 className="h4 fw-semibold text-center mb-4">TokTickIT</h1>

        {error && (
          <div className="zg-callout-error mb-3" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-3">
            <label htmlFor="email" className="zg-label">
              Email
            </label>
            <input
              id="email"
              type="email"
              className="form-control"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
              required
            />
          </div>
          <div className="mb-4">
            <label htmlFor="password" className="zg-label">
              Password
            </label>
            <div className="input-group">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className="form-control"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                required
              />
              <button
                type="button"
                className="btn btn-zg-secondary"
                onClick={() => setShowPassword((s) => !s)}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <button
            type="submit"
            className="btn btn-zg-primary w-100"
            disabled={submitting || !email || !password}
          >
            {submitting ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
                Signing in...
              </>
            ) : (
              'Log In'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
