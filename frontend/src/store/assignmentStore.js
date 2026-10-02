import { create } from 'zustand';
import { apiFetch } from './authStore';

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

async function safeJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { detail: `Server error ${res.status}: ${res.statusText}` };
  }
}

const PAGE_SIZE = 10;
const POLL_INTERVAL = 3000;
const MAX_POLLS = 120;
const VALID_GRADING_SYSTEMS = new Set(['US', 'UK']);

// Module-level handle so reset() and a new submission can cancel an in-flight
// poll. Previously the interval lived only in _startPolling's closure and
// could never be stopped from outside.
let pollInterval = null;

function stopPolling() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = null;
}

const INITIAL_SESSION_STATE = {
  uploading: false,
  uploadError: null,
  currentAssignmentId: null,
  status: null,
  result: null,
  lastSubmission: null,
};

export const useAssignmentStore = create((set, get) => ({
  ...INITIAL_SESSION_STATE,

  // Note: lastSubmission holds the metadata from the most recent submission
  // (or loaded assignment), kept so ResultsPage can resubmit a revised file
  // against the same subject/grading system/rubric/instructions.

  history: [],
  historyTotal: 0,
  historyLoading: false,
  historyError: null,

  // BUG FIX ("Grade Another" / "Try Again" did nothing): ResultsPage calls
  // reset(), but the store never defined it, so the click threw
  // "reset is not a function" before navigate('/') ran. Also cancels any
  // in-flight poll so a stale response can't repopulate the cleared state.
  reset: () => {
    stopPolling();
    set({ ...INITIAL_SESSION_STATE });
  },

  fetchHistory: async ({ limit = 20, offset = 0, statusFilter = null } = {}) => {
    set({ historyLoading: true, historyError: null });
    try {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (statusFilter) params.set('status_filter', statusFilter);

      // BUG FIX (auth desync): every assignment call goes through the shared,
      // refresh-aware apiFetch so an expired access token is silently renewed
      // instead of surfacing "Invalid or expired token." to the user.
      const res = await apiFetch(`/api/assignments/?${params.toString()}`);
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
    stopPolling();
    set({
      uploading: true,
      uploadError: null,
      result: null,
      status: null,
      lastSubmission: { subject, gradingSystem, rubricId, instructions },
    });

    const form = new FormData();
    form.append('file', file);
    form.append('subject', subject);
    form.append('grading_system', gradingSystem);
    if (rubricId) form.append('rubric_id', rubricId);
    if (instructions) form.append('instructions', instructions);

    try {
      // apiFetch skips the default JSON Content-Type for FormData bodies,
      // so the browser sets its own multipart boundary here — see the
      // BUG FIX 9 comment in authStore.js.
      const res = await apiFetch('/api/assignments/', { method: 'POST', body: form });
      const data = await safeJson(res);

      if (!res.ok) throw new Error(parseDetail(data.detail));

      set({ uploading: false, currentAssignmentId: data.assignment_id, status: 'pending' });
      get()._startPolling(data.assignment_id);
      return { ok: true };
    } catch (err) {
      set({ uploading: false, uploadError: err.message });
      return { ok: false, error: err.message };
    }
  },

  // Resubmits a (typically revised) file against the subject/grading
  // system/rubric/instructions of the last submission or loaded assignment.
  resubmitAssignment: (file) => {
    const { lastSubmission } = get();

    if (!lastSubmission) {
      return Promise.resolve({
        ok: false,
        error: 'No submission context available — original subject/grading system/rubric is unknown.',
      });
    }

    const { subject, gradingSystem, rubricId, instructions } = lastSubmission;

    // Guard: fail fast client-side rather than round-tripping an invalid
    // Literal["US","UK"] value to the backend and surfacing a raw 422.
    if (!VALID_GRADING_SYSTEMS.has(gradingSystem)) {
      return Promise.resolve({
        ok: false,
        error: `Cannot resubmit: grading system "${gradingSystem}" is not valid (expected US or UK). Try re-selecting it from the original assignment.`,
      });
    }

    return get().submitAssignment(file, subject, gradingSystem, rubricId, instructions);
  },

  loadAssignment: async (assignmentId) => {
    stopPolling();
    set({ uploading: false, uploadError: null, result: null, status: 'processing' });
    try {
      const res = await apiFetch(`/api/assignments/${assignmentId}`);
      const data = await safeJson(res);

      if (!res.ok) throw new Error(parseDetail(data.detail));

      set((s) => ({
        currentAssignmentId: assignmentId,
        status: data.status,
        result: data.result ?? null,
        lastSubmission: {
          subject: data.subject ?? s.lastSubmission?.subject,
          gradingSystem: data.grading_system ?? s.lastSubmission?.gradingSystem,
          rubricId: data.rubric_id ?? s.lastSubmission?.rubricId,
          instructions: data.instructions ?? s.lastSubmission?.instructions,
        },
      }));

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
      const res = await apiFetch(`/api/assignments/${assignmentId}`, { method: 'DELETE' });

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
    stopPolling();
    let count = 0;

    const interval = setInterval(async () => {
      // Stale poll: the user reset, resubmitted, or opened another assignment.
      if (get().currentAssignmentId !== assignmentId) {
        if (pollInterval === interval) stopPolling();
        else clearInterval(interval);
        return;
      }

      count++;
      if (count > MAX_POLLS) {
        stopPolling();
        set({ status: 'error', uploadError: 'Grading timed out. Please retry.' });
        return;
      }

      try {
        // Relative path via apiFetch, like every other call in this file.
        const res = await apiFetch(`/api/assignments/${assignmentId}`);
        if (!res.ok) return;

        const data = await safeJson(res);
        if (get().currentAssignmentId !== assignmentId) return;
        set({ status: data.status });

        if (data.status === 'done') {
          stopPolling();

          // Translate if user locale is not English
          const lang = localStorage.getItem('ai-grader-lang') ||
                        navigator.language?.split('-')[0] || 'en';

          let finalResult = data.result;
          if (lang !== 'en' && data.result) {
            finalResult = (await get()._translateResult(data.result, lang)) ?? data.result;
          }
          // Translation is async; the user may have reset in the meantime.
          if (get().currentAssignmentId === assignmentId) set({ result: finalResult });
        } else if (data.status === 'error') {
          stopPolling();
          set({ uploadError: 'Grading failed. Please retry.' });
        }
      } catch {
        // transient — keep polling
      }
    }, POLL_INTERVAL);

    pollInterval = interval;
  },

  _translateResult: async (result, targetLang) => {
    try {
      const res = await apiFetch('/api/translate/grading-result', {
        method: 'POST',
        body: JSON.stringify({ content: result, target_lang: targetLang }),
      });
      if (!res.ok) return null;
      const data = await safeJson(res);
      return data.translated ?? null;
    } catch {
      return null; // silently fall back to English
    }
  },
}));
