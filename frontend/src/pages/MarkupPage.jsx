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
  const changedParagraphs = markup?.paragraphs?.filter((paragraph) => paragraph.changed).length ?? 0;

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
    <div className="min-h-screen bg-slate-50 px-3 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <button onClick={() => navigate(-1)} className="mb-2 rounded text-sm font-medium text-indigo-700 hover:text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500">Back to results</button>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Document review</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Review suggested edits, compare versions, and ask questions about specific paragraphs.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <SummaryStat label="Suggested changes" value={markup.change_count ?? 0} />
            <SummaryStat label="Paragraphs reviewed" value={markup.paragraphs.length} />
            <SummaryStat label="Paragraphs changed" value={changedParagraphs} />
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div role="tablist" aria-label="Document view mode" className="grid grid-cols-3 rounded-xl border border-slate-200 bg-slate-100 p-1 sm:inline-flex">
              {VIEW_MODES.map((m) => (
                <button key={m.id} role="tab" aria-selected={view === m.id}
                  onClick={() => setView(m.id)}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                    view === m.id ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:text-slate-900'
                  }`}>
                  {m.label}
                </button>
              ))}
            </div>
            <button onClick={regenerate} disabled={processing} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50">
              {processing ? 'Review in progress…' : 'Run review again'}
            </button>
          </div></div>
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

        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
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
    <article className="min-w-0 space-y-3 overflow-y-auto rounded-2xl border border-slate-200 bg-white px-4 py-5 shadow-sm sm:px-8 sm:py-7 max-h-[none] xl:max-h-[calc(100vh-2rem)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4"><div><h2 className="font-semibold text-slate-900">Submission text</h2><p className="mt-1 text-xs text-slate-500">Select a paragraph to attach it to your question.</p></div>{view === "markup" && <div className="flex flex-wrap gap-3 text-xs"><span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500"></span>Suggested addition</span><span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-rose-500"></span>Suggested deletion</span></div>}</div>
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
      return <ins key={i} className="rounded-sm bg-emerald-50 px-0.5 text-emerald-800 underline decoration-emerald-500 decoration-2 underline-offset-2">{s.text}</ins>;
    }
    if (s.type === 'delete') {
      return <del key={i} className="rounded-sm bg-rose-50 px-0.5 text-rose-700 line-through decoration-rose-500 decoration-2">{s.text}</del>;
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
                      min-h-[420px] max-h-[70vh] xl:sticky xl:top-4 xl:h-[calc(100vh-2rem)] xl:max-h-none">
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

function SummaryStat({ label, value }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"><p className="text-xs text-slate-500">{label}</p><p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{value}</p></div>;
}

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
