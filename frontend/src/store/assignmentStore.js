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

async function safeJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { detail: `Server error ${res.status}: ${res.statusText}` };
  }
}

const PAGE_SIZE = 10;

export const useAssignmentStore = create((set, get) => ({
  uploading: false,
  uploadError: null,
  currentAssignmentId: null,
  status: null,
  result: null,

  history: [],
  historyTotal: 0,
  historyLoading: false,
  historyError: null,

  fetchHistory: async ({ limit = 20, offset = 0, statusFilter = null } = {}) => {
    set({ historyLoading: true, historyError: null });
    try {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (statusFilter) params.set('status_filter', statusFilter);

      const res = await authFetch(`/api/assignments?${params.toString()}`);
      const data = await safeJson(res);

      if (!res.ok) throw new Error(parseDetail(data.detail));

      set({
        history: data.items ?? [],
        historyTotal: data.total ?? 0,
        historyLoading: false,
      });
      return { ok: true };
    } catch (err) {
      set({ historyLoading: false, historyError: err.message });
      return { ok: false };
    }
  },

  submitAssignment: async (file, subject, gradingSystem, rubricId, instructions) => {
    set({ uploading: true, uploadError: null, result: null, status: null });

    const form = new FormData();
    form.append('file', file);
    form.append('subject', subject);
    form.append('grading_system', gradingSystem);
    if (rubricId) form.append('rubric_id', rubricId);
    if (instructions) form.append('instructions', instructions);

    try {
      const res = await authFetch('/api/assignments', { method: 'POST', body: form });
      const data = await safeJson(res);

      if (!res.ok) throw new Error(parseDetail(data.detail));

      set({ uploading: false, currentAssignmentId: data.assignment_id, status: 'pending' });
      get()._startPolling(data.assignment_id);
      return { ok: true };
    } catch (err) {
      set({ uploading: false, uploadError: err.message });
      return { ok: false };
    }
  },

  loadAssignment: async (assignmentId) => {
    set({ uploading: false, uploadError: null, result: null, status: 'processing' });
    try {
      const res = await authFetch(`/api/assignments/${assignmentId}`);
      const data = await safeJson(res);

      if (!res.ok) throw new Error(parseDetail(data.detail));

      set({
        currentAssignmentId: assignmentId,
        status: data.status,
        result: data.result ?? null,
      });

      if (data.status === 'pending' || data.status === 'processing') {
        get()._startPolling(assignmentId);
      }
      return { ok: true };
    } catch (err) {
      set({ status: 'error', uploadError: err.message });
      return { ok: false };
    }
  },

  deleteAssignment: async (assignmentId) => {
    set((s) => ({
      history: s.history.filter((a) => a.id !== assignmentId),
      historyTotal: Math.max(0, s.historyTotal - 1),
    }));

    try {
      const res = await authFetch(`/api/assignments/${assignmentId}`, { method: 'DELETE' });

      if (!res.ok) {
        const data = await safeJson(res);
        throw new Error(parseDetail(data.detail));
      }

      return { ok: true };
    } catch (err) {
      get().fetchHistory({ limit: PAGE_SIZE, offset: 0 });
      return { ok: false, error: err.message };
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