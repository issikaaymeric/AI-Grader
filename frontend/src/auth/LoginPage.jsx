import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/auth/AuthLayout';
import { useAuthStore } from '../store/authStore';

export default function LoginPage() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { login, loading, error } = useAuthStore();

  const from = location.state?.from?.pathname ?? '/';

  const [form, setForm] = useState({ email: '', password: '' });
  const [showPw, setShowPw] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await login(form);
    if (result.ok) navigate(from, { replace: true });
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to continue grading"
    >
      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Redirect notice */}
        {location.state?.from && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200
                          rounded-lg px-3 py-2">
            Please sign in to access that page.
          </div>
        )}

        {/* Email */}
        <Field label="Email address">
          <input
            type="email"
            required
            autoComplete="email"
            value={form.email}
            onChange={set('email')}
            placeholder="you@university.edu"
            className="input"
          />
        </Field>

        {/* Password */}
        <Field label="Password">
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              required
              autoComplete="current-password"
              value={form.password}
              onChange={set('password')}
              placeholder="••••••••"
              className="input pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400
                         hover:text-gray-600 text-sm"
            >
              {showPw ? 'Hide' : 'Show'}
            </button>
          </div>
        </Field>

        {/* Error */}
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200
                        rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {/* Submit */}
        <button type="submit" disabled={loading} className="btn-primary w-full py-3">
          {loading ? <Spinner /> : 'Sign in'}
        </button>

        {/* Footer */}
        <p className="text-center text-sm text-gray-500">
          No account?{' '}
          <Link to="/register" className="text-indigo-600 font-medium hover:underline">
            Create one
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <span className="flex items-center justify-center gap-2">
      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
      Signing in…
    </span>
  );
}