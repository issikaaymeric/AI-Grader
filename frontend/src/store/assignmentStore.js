import { create } from 'zustand';

export const useAssignmentStore = create((set, get) => ({
  // Upload state
  uploading: false,
  uploadError: null,
  currentAssignmentId: null,

  // Polling state
  status: null,        // 'pending' | 'processing' | 'done' | 'error'
  result: null,

  // Actions
  submitAssignment: async (file, subject, gradingSystem, rubricId) => {
    set({ uploading: true, uploadError: null, result: null, status: null });

    const form = new FormData();
    form.append('file', file);
    form.append('subject', subject);
    form.append('grading_system', gradingSystem);
    if (rubricId) form.append('rubric_id', rubricId);

    try {
      const res = await fetch('/api/assignments/', {
        method: 'POST',
        body: form,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Upload failed');
      }

      const data = await res.json();
      set({
        uploading: false,
        currentAssignmentId: data.assignment_id,
        status: 'pending',
      });

      // Start polling
      get()._startPolling(data.assignment_id);
    } catch (err) {
      set({ uploading: false, uploadError: err.message });
    }
  },

  _startPolling: (assignmentId) => {
    const POLL_INTERVAL = 3000;
    const MAX_POLLS = 120; // 6 minutes max
    let count = 0;

    const interval = setInterval(async () => {
      count++;
      if (count > MAX_POLLS) {
        clearInterval(interval);
        set({ status: 'error', uploadError: 'Grading timed out.' });
        return;
      }

      try {
        const res = await fetch(`/api/assignments/${assignmentId}`);
        if (!res.ok) return;

        const data = await res.json();
        set({ status: data.status });

        if (data.status === 'done') {
          set({ result: data.result });
          clearInterval(interval);
        } else if (data.status === 'error') {
          set({ uploadError: 'Grading failed. Please retry.' });
          clearInterval(interval);
        }
      } catch {
        // transient network error — keep polling
      }
    }, POLL_INTERVAL);
  },

  reset: () =>
    set({
      uploading: false,
      uploadError: null,
      currentAssignmentId: null,
      status: null,
      result: null,
    }),
}));
