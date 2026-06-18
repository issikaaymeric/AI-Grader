import { create } from 'zustand';
import { useAuthStore } from './authStore';

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

async function authFetch(path, options = {}) {
  const token = useAuthStore.getState().accessToken;
  const headers = { ...(options.headers ?? {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(path, { ...options, headers });
}

// Safe JSON parse — never throws on HTML error pages
async function safeJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    // Backend returned HTML (e.g. 500 page) — surface the HTTP status instead
    return { detail: `Server error ${res.status}: ${res.statusText}` };
  }
}

export const useAssignmentStore = create((set, get) => ({
  uploading: false,
  uploadError: null,
  currentAssignmentId: null,
  status: null,
  result: null,

  submitAssignment: async (file, subject, gradingSystem, rubricId) => {
    set({ uploading: true, uploadError: null, result: null, status: null });

    const form = new FormData();
    form.append('file', file);
    form.append('subject', subject);
    form.append('grading_system', gradingSystem);
    if (rubricId) form.append('rubric_id', rubricId);

    try {
      const res = await authFetch('/api/assignments/', { method: 'POST', body: form });
      const data = await safeJson(res);

      if (!res.ok) {
        throw new Error(parseDetail(data.detail));
      }

      set({ uploading: false, currentAssignmentId: data.assignment_id, status: 'pending' });
      get()._startPolling(data.assignment_id);
      return { ok: true };
    } catch (err) {
      set({ uploading: false, uploadError: err.message });
      return { ok: false };
    }
  },

  _startPolling: (assignmentId) => {
    const POLL_INTERVAL = 3000;
    const MAX_POLLS = 120;
    let count = 0;

    const interval = setInterval(async () => {
      count++;
      if (count > MAX_POLLS) {
        clearInterval(interval);
        set({ status: 'error', uploadError: 'Grading timed out. Please retry.' });
        return;
      }

      try {
        const res = await authFetch(`/api/assignments/${assignmentId}`);
        if (!res.ok) return;

        const data = await safeJson(res);
        set({ status: data.status });

        if (data.status === 'done') {
          set({ result: data.result });
          clearInterval(interval);
        } else if (data.status === 'error') {
          set({ uploadError: 'Grading failed. Please retry.' });
          clearInterval(interval);
        }
      } catch {
        // transient — keep polling
      }
    }, POLL_INTERVAL);
  },

  reset: () => set({
    uploading: false, uploadError: null,
    currentAssignmentId: null, status: null, result: null,
  }),
}));