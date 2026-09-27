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
const VALID_GRADING_SYSTEMS = new Set(['US', 'UK']);

export const useAssignmentStore = create((set, get) => ({
  uploading: false,
  uploadError: null,
  currentAssignmentId: null,
  status: null,
  result: null,

  // Metadata from the most recent submission (or loaded assignment), kept
  // around so a page like ResultsPage can resubmit a revised file against
  // the same subject/grading system/rubric/instructions without the caller
  // having to pass any of that back in.
  lastSubmission: null,

  history: [],
  historyTotal: 0,
  historyLoading: false,
  historyError: null,

  fetchHistory: async ({ limit = 20, offset = 0, statusFilter = null } = {}) => {
    set({ historyLoading: true, historyError: null });
    try {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (statusFilter) params.set('status_filter', statusFilter);

      // BUG FIX (auth desync): was calling a locally-defined `authFetch`
      // that attached the access token but never refreshed it on a 401 —
      // unlike `apiFetch` in authStore.js, which does. Every assignment
      // call now goes through the same shared, refresh-aware client so an
      // expired access token is silently renewed instead of surfacing
      // "Invalid or expired token." to the user.
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
      return { ok: false };
    }
  },

  // Resubmits a (typically revised) file against the subject/grading
  // system/rubric/instructions of the last submission or loaded assignment.
  // Used by ResultsPage so a user can re-grade without navigating away and
  // re-entering all the assignment metadata by hand.
  resubmitAssignment: (file) => {
    const { lastSubmission } = get();

    if (!lastSubmission) {
      return Promise.resolve({
        ok: false,
        error: 'No submission context available — original subject/grading system/rubric is unknown.',
      });
    }

    const { subject, gradingSystem, rubricId, instructions } = lastSubmission;

    // Guard: fail fast client-side rather than round-tripping an
    // invalid Literal["US","UK"] value to the backend and surfacing a
    // raw 422. Catches the case where lastSubmission was populated from
    // an assignment-detail response that doesn't carry a valid
    // grading_system field.
    if (!VALID_GRADING_SYSTEMS.has(gradingSystem)) {
      return Promise.resolve({
        ok: false,
        error: `Cannot resubmit: grading system "${gradingSystem}" is not valid (expected US or UK). Try re-selecting it from the original assignment.`,
      });
    }

    return get().submitAssignment(file, subject, gradingSystem, rubricId, instructions);
  },

  loadAssignment: async (assignmentId) => {
    set({ uploading: false, uploadError: null, result: null, status: 'processing' });
    try {
      const res = await apiFetch(`/api/assignments/${assignmentId}`);
      const data = await safeJson(res);

      if (!res.ok) throw new Error(parseDetail(data.detail));

      set((s) => ({
        currentAssignmentId: assignmentId,
        status: data.status,
        result: data.result ?? null,
        // Only overwrite fields the detail endpoint actually returned, so a
        // partial payload doesn't stomp on metadata we already have.
        // TODO(unconfirmed): field names/casing below are a guess pending
        // the real GET /api/assignments/{id} response shape.
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
        // BUG FIX (undefined BASE_URL): this referenced an undefined
        // `BASE_URL` global, throwing a ReferenceError on every tick. That
        // threw *inside* this try block, so it was swallowed by the catch
        // below ("transient — keep polling") and the interval ran forever
        // without ever reaching the backend. Every other call in this file
        // uses a relative path — matched that here.
        const res = await apiFetch(`/api/assignments/${assignmentId}`);
        if (!res.ok) return;

        const data = await safeJson(res);
        set({ status: data.status });

        if (data.status === 'done') {
          clearInterval(interval);

          // Translate if user locale is not English
          const lang = localStorage.getItem('ai-grader-lang') ||
                        navigator.language?.split('-')[0] || 'en';

          if (lang !== 'en' && data.result) {
            const translated = await get()._translateResult(data.result, lang);
            set({ result: translated ?? data.result });
          } else {
            set({ result: data.result });
          }
        } else if (data.status === 'error') {
          set({ uploadError: 'Grading failed. Please retry.' });
          clearInterval(interval);
        }
      } catch {
        // transient — keep polling
      }
    }, POLL_INTERVAL);
  },

  _translateResult: async (result, targetLang) => {
    try {
      // Same BASE_URL fix as _startPolling above; Content-Type header
      // dropped since apiFetch already sets it by default for non-FormData
      // bodies.
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
