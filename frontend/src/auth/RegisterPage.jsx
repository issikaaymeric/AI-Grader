import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/auth/AuthLayout';
import { useAuthStore } from '../store/authStore';

const ROLES = [
  { value: 'student', label: 'Student', desc: 'Submit assignments and review feedback' },
];

const PW_RULES = [
  { label: '8+ characters', test: (p) => p.length >= 8 },
  { label: 'Uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'Number', test: (p) => /[0-9]/.test(p) },
];

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register, loading, error } = useAuthStore();

  const [form, setForm] = useState({
    name: '', email: '', password: '', role: 'student',
  });
  const [showPw, setShowPw]     = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const pwStrength = PW_RULES.filter((r) => r.test(form.password)).length;
  const pwValid    = pwStrength === PW_RULES.length;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    if (!pwValid) return;
    const result = await register(form);
    if (result.ok) navigate('/', { replace: true });
  };

  return (
    <AuthLayout title="Create your account" subtitle="Start learning with clearer, actionable feedback.">
      <form onSubmit={handleSubmit} className="space-y-4">

        <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-3.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Account type</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">Student</p>
          <p className="mt-0.5 text-xs leading-5 text-slate-600">Submit assignments and review feedback.</p>
        </div>

        {/* Full name */}
        <Field label="Full name">
          <input
            type="text"
            required
            autoComplete="name"
            value={form.name}
            onChange={set('name')}
            placeholder="Jane Smith"
            className="input"
          />
        </Field>

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
              autoComplete="new-password"
              value={form.password}
              onChange={set('password')}
              placeholder="••••••••"
              className="input pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500" aria-label={showPw ? "Hide password" : "Show password"}
            >
              {showPw ? 'Hide' : 'Show'}
            </button>
          </div>

          {/* Strength meter */}
          {form.password.length > 0 && (
            <div className="mt-2 space-y-1.5">
              <div className="flex gap-1">
                {PW_RULES.map((_, i) => (
                  <div
                    key={i}
                    className={`flex-1 h-1 rounded-full transition-colors
                      ${i < pwStrength
                        ? pwStrength === 3 ? 'bg-green-500' : 'bg-yellow-400'
                        : 'bg-gray-200'}`}
                  />
                ))}
              </div>
              <ul className="space-y-0.5">
                {PW_RULES.map((r) => (
                  <li key={r.label}
                    className={`text-xs flex items-center gap-1
                      ${r.test(form.password) ? 'text-green-600' : 'text-gray-400'}`}
                  >
                    {r.test(form.password) ? '✓' : '○'} {r.label}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {submitted && !pwValid && (
            <p className="text-xs text-red-600 mt-1">Password doesn't meet all requirements.</p>
          )}
        </Field>

        {/* API / server error */}
        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full py-3.5 shadow-md shadow-indigo-200 focus:outline-none focus:ring-4 focus:ring-indigo-200">
          {loading ? 'Creating account…' : 'Create account'}
        </button>

        <div className="border-t border-slate-100 pt-4"><p className="text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link to="/login" className="text-indigo-600 font-medium hover:underline">
            Sign in
          </Link>
        </p></div>
      </form>
    </AuthLayout>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</label>
      {children}
    </div>
  );
}