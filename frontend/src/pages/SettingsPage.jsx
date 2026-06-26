import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/authStore';


async function authFetch(path, options = {}, token) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(path, { ...options, headers });
}

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{title}</h2>
      {children}
    </div>
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

function Input(props) {
  return (
    <input
      {...props}
      className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900
                 focus:outline-none focus:ring-2 focus:ring-indigo-500"
    />
  );
}

function SaveButton({ loading, children }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium
                 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
    >
      {loading ? 'Saving…' : children}
    </button>
  );
}

function Toast({ msg, error }) {
  if (!msg) return null;
  return (
    <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl text-sm font-medium shadow-lg
      ${error ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
      {msg}
    </div>
  );
}

export default function SettingsPage() {
  const { user, accessToken, clearAuth } = useAuthStore();
  const navigate = useNavigate();
  const { i18n, t } = useTranslation();

  const [toast, setToast] = useState({ msg: '', error: false });
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Profile form
  const [profile, setProfile] = useState({ name: user?.name ?? '', email: user?.email ?? '' });
  const [profileLoading, setProfileLoading] = useState(false);

  // Password form
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwLoading, setPwLoading] = useState(false);

  // Notifications
  const [notifications, setNotifications] = useState({
    grading_done: true,
    weekly_summary: false,
  });

  const showToast = (msg, error = false) => {
    setToast({ msg, error });
    setTimeout(() => setToast({ msg: '', error: false }), 3000);
  };

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setProfileLoading(true);
    try {
      const res = await authFetch(
        `/api/auth/me`,
        { method: 'PATCH', body: JSON.stringify(profile) },
        accessToken
      );
      if (!res.ok) throw new Error();
      showToast('Profile updated.');
    } catch {
      showToast('Failed to update profile.', true);
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePasswordSave = async (e) => {
    e.preventDefault();
    if (pw.next !== pw.confirm) return showToast('Passwords do not match.', true);
    if (pw.next.length < 8) return showToast('Password must be at least 8 characters.', true);
    setPwLoading(true);
    try {
      const res = await authFetch(
        `/api/auth/change-password`,
        { method: 'POST', body: JSON.stringify({ current_password: pw.current, new_password: pw.next }) },
        accessToken
      );
      if (!res.ok) throw new Error();
      setPw({ current: '', next: '', confirm: '' });
      showToast('Password changed.');
    } catch {
      showToast('Failed to change password.', true);
    } finally {
      setPwLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== user?.email) return showToast('Email does not match.', true);
    setDeleting(true);
    try {
      const res = await authFetch(
        `/api/auth/me`,
        { method: 'DELETE' },
        accessToken
      );
      if (!res.ok) throw new Error();
      clearAuth();
      navigate('/login', { replace: true });
    } catch {
      showToast('Failed to delete account.', true);
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

        {/* Profile */}
        <Section title="Profile">
          <form onSubmit={handleProfileSave} className="space-y-4">
            <Field label="Full name">
              <Input
                value={profile.name}
                onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                required
              />
            </Field>
            <Field label="Email address">
              <Input
                type="email"
                value={profile.email}
                onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
                required
              />
            </Field>
            <SaveButton loading={profileLoading}>Save profile</SaveButton>
          </form>
        </Section>

        {/* Password */}
        <Section title="Change Password">
          <form onSubmit={handlePasswordSave} className="space-y-4">
            <Field label="Current password">
              <Input type="password" value={pw.current} onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))} required />
            </Field>
            <Field label="New password">
              <Input type="password" value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} required />
            </Field>
            <Field label="Confirm new password">
              <Input type="password" value={pw.confirm} onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))} required />
            </Field>
            <SaveButton loading={pwLoading}>Change password</SaveButton>
          </form>
        </Section>

        {/* Language */}
        <Section title="Language">
          <Field label="Display language">
            <select
              value={i18n.resolvedLanguage}
              onChange={(e) => i18n.changeLanguage(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm
                         focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="en">English</option>
              <option value="fr">Français</option>
            </select>
          </Field>
        </Section>

        {/* Notifications */}
        <Section title="Notifications">
          {[
            { key: 'grading_done', label: 'Notify me when grading is complete' },
            { key: 'weekly_summary', label: 'Send weekly performance summary' },
          ].map(({ key, label }) => (
            <label key={key} className="flex items-center justify-between cursor-pointer">
              <span className="text-sm text-gray-700">{label}</span>
              <div
                onClick={() => setNotifications((n) => ({ ...n, [key]: !n[key] }))}
                className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer
                  ${notifications[key] ? 'bg-indigo-600' : 'bg-gray-200'}`}
              >
                <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform
                  ${notifications[key] ? 'translate-x-5' : 'translate-x-0'}`} />
              </div>
            </label>
          ))}
        </Section>

        {/* Danger zone */}
        <Section title="Danger Zone">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-3">
            <p className="text-sm text-red-700 font-medium">Delete account</p>
            <p className="text-xs text-red-500">
              This permanently deletes your account and all grading history. This cannot be undone.
              Type your email address to confirm.
            </p>
            <Input
              placeholder={user?.email}
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
            />
            <button
              onClick={handleDeleteAccount}
              disabled={deleting || deleteConfirm !== user?.email}
              className="px-5 py-2 rounded-lg bg-red-600 text-white text-sm font-medium
                         hover:bg-red-700 disabled:opacity-40 transition-colors"
            >
              {deleting ? 'Deleting…' : 'Delete my account'}
            </button>
          </div>
        </Section>

      </div>
      <Toast msg={toast.msg} error={toast.error} />
    </div>
  );
}
