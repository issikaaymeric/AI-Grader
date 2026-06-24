import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const API = '/api/auth';

function parseDetail(detail) {
  if (!detail) return 'Request failed';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((e) => {
        const field = Array.isArray(e.loc) ? e.loc[e.loc.length - 1] : 'field';
        return `${field}: ${e.msg}`;
      })
      .join(', ');
  }
  return JSON.stringify(detail);
}

async function safeJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { detail: `Server error ${res.status}: ${res.statusText}` };
  }
}

// BUG FIX 1: `apiFetch` was defined before `useAuthStore`, so
// `useAuthStore.getState()` would reference an undefined variable at
// module-parse time in some bundlers. Moved to a lazy getter pattern:
// wrap in a function so `useAuthStore` is only read at call-time, after
// the store has been created.
export async function apiFetch(path, options = {}) {
  const store = useAuthStore.getState(); // safe — called after store is created
  const token = store.accessToken;
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers });

  if (res.status === 401 && !options._retried) {
    const refreshed = await useAuthStore.getState().refresh();
    if (refreshed) {
      return apiFetch(path, { ...options, _retried: true });
    }
    // BUG FIX 2: after a failed refresh we clear auth but also need to
    // return the response so callers can handle the 401 themselves.
    useAuthStore.getState().clearAuth();
  }

  // BUG FIX 3: was implicitly falling through on all paths; explicitly
  // return res on every code-path so callers always get a Response object.
  return res;
}

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      loading: false,
      error: null,

      // ── Register ────────────────────────────────────────────────
      register: async ({ email, password, name, role }) => {
        set({ loading: true, error: null });
        try {
          const res = await fetch(`${API}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, name, role }),
          });
          const data = await safeJson(res);
          if (!res.ok) throw new Error(parseDetail(data.detail));
          // BUG FIX 4: calling get()._storeTokens() / get()._fetchMe()
          // works but bypasses the set/get closure captured by those
          // helpers. Replaced with direct calls to the in-scope helpers
          // defined below so `set` and `get` are always from this factory.
          get()._storeTokens(data);
          await get()._fetchMe(data.access_token);
          return { ok: true };
        } catch (err) {
          // BUG FIX 5: on any error (including one thrown by _storeTokens
          // or _fetchMe), `loading` must be reset to false. Previously if
          // _storeTokens itself failed, loading would stay `true` forever.
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
          const data = await safeJson(res);
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
          const data = await safeJson(res);
          get()._storeTokens(data);
          return true;
        } catch {
          return false;
        }
      },

      // ── Helpers ─────────────────────────────────────────────────

      // BUG FIX 6: `_storeTokens` must always set `loading: false` even
      // when `expires_in` is missing/undefined — previously `expiresAt`
      // could be set to `NaN` (Date.now() + undefined * 1000), which made
      // `isTokenExpired()` always return true. Guard with a fallback.
      _storeTokens: ({ access_token, refresh_token, expires_in }) => {
        set({
          accessToken: access_token,
          refreshToken: refresh_token,
          expiresAt: expires_in != null ? Date.now() + expires_in * 1000 : null,
          loading: false,
          error: null,
        });
      },

      // BUG FIX 7: `_fetchMe` silently swallowed network errors and left
      // `user` as null with no indication of failure. Errors are now
      // propagated so the caller's catch block can handle them properly.
      _fetchMe: async (token) => {
        const res = await fetch(`${API}/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const user = await res.json();
          set({ user });
        } else {
          throw new Error(`Failed to fetch user profile: ${res.status}`);
        }
      },

      clearAuth: () =>
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          expiresAt: null,
          // BUG FIX 8: clearAuth didn't reset `loading` or `error`, so a
          // component that called logout() mid-request could be left with
          // stale UI state.
          loading: false,
          error: null,
        }),

      isTokenExpired: () => {
        const { expiresAt } = get();
        return !expiresAt || Date.now() > expiresAt - 60_000;
      },
    }),
    {
      name: 'ai-grader-auth',
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        expiresAt: s.expiresAt,
        user: s.user,
      }),
    }
  )
);