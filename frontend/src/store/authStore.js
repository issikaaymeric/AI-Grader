import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const API = '/api/auth';

function parseDetail(detail) {
  if (!detail) return 'Request failed';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((e) => {
      const field = Array.isArray(e.loc) ? e.loc[e.loc.length - 1] : 'field';
      return `${field}: ${e.msg}`;
    }).join(', ');
  }
  return JSON.stringify(detail);
}

// Used by other stores (assignmentStore) — attaches Bearer token + handles 401 refresh
export async function apiFetch(path, options = {}) {
  const token = useAuthStore.getState().accessToken;
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers });

  if (res.status === 401 && !options._retried) {
    const refreshed = await useAuthStore.getState().refresh();
    if (refreshed) {
      return apiFetch(path, { ...options, _retried: true });
    }
    useAuthStore.getState().clearAuth();
  }

  return res;
}

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user:         null,
      accessToken:  null,
      refreshToken: null,
      expiresAt:    null,
      loading:      false,
      error:        null,

      // ── Register ────────────────────────────────────────────────
      register: async ({ email, password, name, role }) => {
        set({ loading: true, error: null });
        try {
          const res = await fetch(`${API}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, name, role }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(parseDetail(data.detail));
          get()._storeTokens(data);
          await get()._fetchMe(data.access_token);
          return { ok: true };
        } catch (err) {
          set({ error: err.message, loading: false });
          return { ok: false, error: err.message };
        }
      },

      // ── Login ───────────────────────────────────────────────────
      login: async ({ email, password }) => {
        set({ loading: true, error: null });
        try {
          const res = await fetch(`${API}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(parseDetail(data.detail));
          get()._storeTokens(data);
          await get()._fetchMe(data.access_token);
          return { ok: true };
        } catch (err) {
          set({ error: err.message, loading: false });
          return { ok: false, error: err.message };
        }
      },

      // ── Logout ──────────────────────────────────────────────────
      logout: async () => {
        try {
          await apiFetch(`${API}/logout`, { method: 'POST' });
        } finally {
          get().clearAuth();
        }
      },

      // ── Refresh ─────────────────────────────────────────────────
      refresh: async () => {
        const { refreshToken } = get();
        if (!refreshToken) return false;
        try {
          const res = await fetch(`${API}/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
          });
          if (!res.ok) return false;
          const data = await res.json();
          get()._storeTokens(data);
          return true;
        } catch {
          return false;
        }
      },

      // ── Helpers ─────────────────────────────────────────────────
      _storeTokens: ({ access_token, refresh_token, expires_in }) => {
        set({
          accessToken:  access_token,
          refreshToken: refresh_token,
          expiresAt:    Date.now() + expires_in * 1000,
          loading:      false,
          error:        null,
        });
      },

      _fetchMe: async (token) => {
        const res = await fetch(`${API}/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const user = await res.json();
          set({ user });
        }
      },

      clearAuth: () =>
        set({ user: null, accessToken: null, refreshToken: null, expiresAt: null }),

      isTokenExpired: () => {
        const { expiresAt } = get();
        return !expiresAt || Date.now() > expiresAt - 60_000;
      },
    }),
    {
      name: 'ai-grader-auth',
      partialize: (s) => ({
        accessToken:  s.accessToken,
        refreshToken: s.refreshToken,
        expiresAt:    s.expiresAt,
        user:         s.user,
      }),
    }
  )
);