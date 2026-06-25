//desktop/src/lib/api.js

import axios from 'axios';

// Resolves to your local FastAPI server in dev, and to Render in production
// (set via .env.development / .env.production)
export const BASE_URL = (
  import.meta.env.VITE_RENDER_BACKEND_URL?.trim() || 'http://localhost:8000'
).replace(/\/$/, ''); // strip trailing slash unconditionally

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 60_000,
});

// Re-attach token from localStorage on startup (Zustand persist rehydrates async)
const stored = localStorage.getItem('ai-grader-auth');
if (stored) {
  try {
    const { state } = JSON.parse(stored);
    if (state?.user?.access_token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${state.user.access_token}`;
    }
  } catch { /* ignore */ }
}

// 401 → clear auth and redirect
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('ai-grader-auth');
      window.location.hash = '#/login';
    }
    return Promise.reject(err);
  }
);

export default api;