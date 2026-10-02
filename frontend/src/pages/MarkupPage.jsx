import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMarkupStore } from '../store/markupStore';

const VIEW_MODES = [
  { id: 'markup', label: 'Markup' },
  { id: 'final', label: 'Final' },
  { id: 'original', label: 'Original' },
];

const SUGGESTIONS = [
  'Why were these changes made?',
  'Which issue should I fix first?',
  'What are my most common mistakes?',
];

export default function MarkupPage() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const { markup, loading, error, open, close, regenerate } = useMarkupStore();
  const [view, setView] = useState('markup');

  useEffect(() => {
    open(assignmentId);
    return () => close();
  }, [assignmentId, open, close]);

  if (loading && !markup) {
    return (
      <CenterMessage>
        <p className="text-gray-600 text-sm">Preparing your document…</p>
      </CenterMessage>
    );
  }

  if (error && !markup) {
    return (
      <CenterMessage>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 max-w-md text-center space-y-4">
          <h2 className="text-lg font-semibold text-red-700">Could not load markup</h2>
          <p className="text-sm text-red-600">{error}</p>
          <button onClick={() => navigate(-1)} className="text-sm text-indigo-600 font-medium">
            ← Back
          </button>
        </div>
      </CenterMessage>
    );
  }

  if (!markup) return null;

  const processing = markup.status === 'processing';
  const pct = markup.total_chunks > 0
    ? Math.round((markup.done_chunks / markup.total_chunks) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-7xl mx-auto space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)}
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
              ← Results
            </button>
            <h1 className="text-xl font-bold text-gray-900">Marked-up Document</h1>
            <span className="text-xs text-gray-500">
              {markup.change_count} change{markup.change_count === 1 ? '' : 's'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div role="tablist" aria-label="View mode"
              className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
              {VIEW_MODES.map((m) => (
                <button key={m.id} role="tab" aria-selected={view === m.id}
                  onClick={() => setView(m.id)}
                  className={`px-3 py-1 text-sm rounded-md font-medium ${
                    view === m.id ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:text-gray-900'
                  }`}>
                  {m.label}
                </button>
              ))}
            </div>
            <button onClick={regenerate} disabled={processing}
              className="text-sm text-gray-600 hover:text-gray-900 font-medium disabled:opacity-40">
              ↻ Re-run review
            </button>
          </div>
        </header>

        {processing && (
          <div className="bg-white border border-gray-200 rounded-xl px-5 py-3" role="status">
            <div className="flex justify-between text-xs text-gray-600 mb-1.5">
              <span>
                {markup.total_chunks === 0
                  ? 'Extracting document…'
                  : `Reviewing section ${Math.min(markup.done_chunks + 1, markup.total_chunks)} of ${markup.total_chunks}…`}
              </span>
              <span>{pct}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {markup.status === 'error' && (
          <Banner tone="red">{markup.notice ?? 'Markup generation failed.'}</Banner>
        )}
        {markup.status === 'done' && markup.notice && <Banner tone="amber">{markup.notice}</Banner>}
        {markup.truncated && (
          <Banner tone="amber">This document is long; only the first part was reviewed.</Banner>
        )}
        {error && <Banner tone="red">{error}</Banner>}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-4 items-start">
          <DocumentPanel markup={markup} view={view} />
          <ChatPanel disabled={markup.paragraphs.length === 0} />
        </div>
      </div>
    </div>
  );
}

// ── Document panel ───────────────────────────────────────────────────────────

function DocumentPanel({ markup, view }) {
  const focusIndex = useMarkupStore((s) => s.focusIndex);
  const setFocus = useMarkupStore((s) => s.setFocus);

  return (
    <article className="bg-white rounded-2xl border border-gray-200 shadow-sm
                        max-h-[calc(100vh-11rem)] overflow-y-auto px-8 py-6 space-y-2">
      {markup.paragraphs.length === 0 && (
        <p className="text-sm text-gray-500">Waiting for document text…</p>
      )}
      {markup.paragraphs.map((p) => (
        <ParagraphBlock
          key={p.index}
          p={p}
          view={view}
          selected={focusIndex === p.index}
          onSelect={() => setFocus(focusIndex === p.index ? null : p.index)}
        />
      ))}
    </article>
  );
}

function ParagraphBlock({ p, view, selected, onSelect }) {
  const isHeading = p.kind === 'heading';
  const showMarks = view === 'markup' && p.changed;

  return (
    <div
      id={`para-${p.index}`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`rounded-lg px-3 py-2 cursor-pointer transition-colors
        ${selected ? 'bg-indigo-50 ring-2 ring-indigo-300' : 'hover:bg-gray-50'}
        ${showMarks ? 'border-l-2 border-red-300' : 'border-l-2 border-transparent'}`}
    >
      <div className={isHeading ? 'text-lg font-semibold text-gray-900' : 'text-sm leading-relaxed text-gray-800'}>
        {view === 'markup' && <Segments segments={p.segments} />}
        {view === 'final' && p.corrected}
        {view === 'original' && p.original}
      </div>
      {showMarks && p.reason && (
        <p className="mt-1 text-xs text-gray-500">
          <span className="font-semibold uppercase text-red-600">{p.category}</span> · {p.reason}
        </p>
      )}
    </div>
  );
}

function Segments({ segments }) {
  return segments.map((s, i) => {
    if (s.type === 'insert') {
      return <ins key={i} className="text-red-600 underline decoration-red-400">{s.text}</ins>;
    }
    if (s.type === 'delete') {
      return <del key={i} className="text-red-600 line-through decoration-red-400">{s.text}</del>;
    }
    return <span key={i}>{s.text}</span>;
  });
}

// ── Chat panel ───────────────────────────────────────────────────────────────

function ChatPanel({ disabled }) {
  const messages = useMarkupStore((s) => s.messages);
  const sending = useMarkupStore((s) => s.chatSending);
  const chatError = useMarkupStore((s) => s.chatError);
  const focusIndex = useMarkupStore((s) => s.focusIndex);
  const setFocus = useMarkupStore((s) => s.setFocus);
  const sendMessage = useMarkupStore((s) => s.sendMessage);

  const [draft, setDraft] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  const submit = async (text) => {
    const value = (text ?? draft).trim();
    if (!value || sending || disabled) return;
    setDraft('');
    const { ok } = await sendMessage(value);
    if (!ok) setDraft(value); // restore on failure so nothing is lost
  };

  return (
    <aside className="bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col
                      h-[calc(100vh-11rem)] lg:sticky lg:top-6">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-800">Ask about your feedback</h2>
        <p className="text-xs text-gray-500 mt-0.5">Click a paragraph to ask about it specifically.</p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3" role="log" aria-live="polite">
        {messages.length === 0 && (
          <div className="space-y-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => submit(s)} disabled={disabled || sending}
                className="block w-full text-left text-sm px-3 py-2 rounded-lg border border-gray-200
                           text-gray-700 hover:bg-gray-50 disabled:opacity-40">
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m) => <ChatBubble key={m.id} message={m} />)}
        {sending && <p className="text-xs text-gray-400 animate-pulse">Thinking…</p>}
        <div ref={endRef} />
      </div>

      {chatError && <p className="px-5 pb-2 text-xs text-red-600">{chatError}</p>}

      <div className="border-t border-gray-100 p-3 space-y-2">
        {focusIndex !== null && (
          <span className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700
                           rounded-full px-2.5 py-1">
            Asking about P{focusIndex}
            <button onClick={() => setFocus(null)} aria-label="Clear paragraph focus"
              className="font-bold hover:text-indigo-900">×</button>
          </span>
        )}
        <div className="flex gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            maxLength={2000}
            disabled={disabled}
            placeholder="Ask a question…"
            className="flex-1 resize-none text-sm border border-gray-200 rounded-lg px-3 py-2
                       focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:bg-gray-50"
          />
          <button onClick={() => submit()} disabled={disabled || sending || !draft.trim()}
            className="self-end px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white
                       hover:bg-indigo-700 disabled:opacity-40">
            Send
          </button>
        </div>
      </div>
    </aside>
  );
}

function ChatBubble({ message }) {
  const mine = message.role === 'user';
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap leading-relaxed ${
        mine ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-800'
      }`}>
        {message.content}
      </div>
    </div>
  );
}

// ── Shared ───────────────────────────────────────────────────────────────────

function Banner({ tone, children }) {
  const cls = tone === 'red'
    ? 'bg-red-50 border-red-200 text-red-700'
    : 'bg-amber-50 border-amber-300 text-amber-800';
  return <div className={`border rounded-xl px-4 py-2.5 text-sm ${cls}`}>{children}</div>;
}

function CenterMessage({ children }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">{children}</div>
  );
}
