import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/auth/AuthLayout';
import { useAuthStore } from '../store/authStore';

const ROLES = [
  {
    value: 'student',
    label: 'Student',
    desc: 'Submit assignments for AI grading',
    icon: '🎓',
  },
  {
    value: 'professor',
    label: 'Professor',
    desc: 'Create rubrics, review flagged grades',
    icon: '📚',
  },
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
    <AuthLayout title="Create your account" subtitle="Free to get started">
      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Role selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">I am a…</label>
          <div className="grid grid-cols-2 gap-3">
            {ROLES.map(({ value, label, desc, icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setForm((f) => ({ ...f, role: value }))}
                className={`rounded-xl border-2 p-3 text-left transition-all
                  ${form.role === value
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200 hover:border-gray-300'}`}
              >
                <span className="text-xl">{icon}</span>
                <p className="font-semibold text-sm text-gray-800 mt-1">{label}</p>
                <p className="text-xs text-gray-500">{desc}</p>
              </button>
            ))}
          </div>
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
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400
                         hover:text-gray-600 text-sm"
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
          <p className="text-sm text-red-600 bg-red-50 border border-red-200
                        rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full py-3">
          {loading ? 'Creating account…' : 'Create account'}
        </button>

        <p className="text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link to="/login" className="text-indigo-600 font-medium hover:underline">
            Sign in
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