import { create } from 'zustand';
import { apiFetch } from './authStore';
import { parseDetail, safeJson } from '../lib/http';

const POLL_MS = 2000;
const MAX_CONSECUTIVE_FAILURES = 10;

let pollTimer = null;

const stopPolling = () => {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
};

export const useMarkupStore = create((set, get) => ({
  assignmentId: null,
  markup: null,
  loading: false,
  error: null,

  focusIndex: null,
  messages: [],
  chatSending: false,
  chatError: null,

  open: async (assignmentId) => {
    get().close();
    set({
      assignmentId, markup: null, loading: true, error: null,
      focusIndex: null, messages: [], chatSending: false, chatError: null,
    });
    try {
      const res = await apiFetch(`/api/assignments/${assignmentId}/markup`, { method: 'POST' });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(parseDetail(data.detail));
      if (get().assignmentId !== assignmentId) return;

      set({ markup: data, loading: false });
      if (data.status === 'processing') get()._poll(assignmentId);
      get().loadChat(assignmentId);
    } catch (err) {
      if (get().assignmentId === assignmentId) set({ loading: false, error: err.message });
    }
  },

  close: () => {
    stopPolling();
    set({ assignmentId: null });
  },

  regenerate: async () => {
    const { assignmentId } = get();
    if (!assignmentId) return;
    stopPolling();
    set({ error: null });
    try {
      const res = await apiFetch(`/api/assignments/${assignmentId}/markup?force=true`, { method: 'POST' });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(parseDetail(data.detail));
      if (get().assignmentId !== assignmentId) return;
      set({ markup: data, focusIndex: null });
      if (data.status === 'processing') get()._poll(assignmentId);
    } catch (err) {
      set({ error: err.message });
    }
  },

  setFocus: (index) => set({ focusIndex: index }),

  _poll: (assignmentId) => {
    stopPolling();
    let failures = 0;

    const tick = async () => {
      if (get().assignmentId !== assignmentId) return;
      try {
        const res = await apiFetch(`/api/assignments/${assignmentId}/markup`);
        const data = await safeJson(res);
        if (!res.ok) throw new Error(parseDetail(data.detail));
        if (get().assignmentId !== assignmentId) return;

        failures = 0;
        set({ markup: data });
        if (data.status !== 'processing') return;
      } catch (err) {
        failures += 1;
        if (failures >= MAX_CONSECUTIVE_FAILURES) {
          set({ error: `Lost connection while generating markup: ${err.message}` });
          return;
        }
      }
      pollTimer = setTimeout(tick, POLL_MS);
    };

    pollTimer = setTimeout(tick, POLL_MS);
  },

  loadChat: async (assignmentId) => {
    try {
      const res = await apiFetch(`/api/assignments/${assignmentId}/markup/chat`);
      const data = await safeJson(res);
      if (!res.ok) throw new Error(parseDetail(data.detail));
      if (get().assignmentId === assignmentId) set({ messages: data });
    } catch (err) {
      if (get().assignmentId === assignmentId) set({ chatError: err.message });
    }
  },

  sendMessage: async (content) => {
    const { assignmentId, focusIndex, chatSending } = get();
    const text = content.trim();
    if (!assignmentId || !text || chatSending) return { ok: false };

    const tempId = `tmp-${Date.now()}`;
    set((s) => ({
      messages: [...s.messages, { id: tempId, role: 'user', content: text, created_at: new Date().toISOString() }],
      chatSending: true,
      chatError: null,
    }));

    try {
      const res = await apiFetch(`/api/assignments/${assignmentId}/markup/chat`, {
        method: 'POST',
        body: JSON.stringify({ message: text, paragraph_index: focusIndex }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(parseDetail(data.detail));
      if (get().assignmentId !== assignmentId) return { ok: true };

      set((s) => ({
        messages: [...s.messages.filter((m) => m.id !== tempId), data.user_message, data.assistant_message],
        chatSending: false,
      }));
      return { ok: true };
    } catch (err) {
      if (get().assignmentId === assignmentId) {
        set((s) => ({
          messages: s.messages.filter((m) => m.id !== tempId),
          chatSending: false,
          chatError: err.message,
        }));
      }
      return { ok: false };
    }
  },
}));
