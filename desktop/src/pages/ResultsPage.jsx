import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAssignmentStore } from '../store/assignmentStore';

// ── Grade colour mapping ─────────────────────────────────────────────────────

const US_COLORS = { A: 'green', B: 'blue', C: 'amber', D: 'orange', F: 'red' };
const UK_COLORS = {
  'First Class': 'green', '2:1': 'blue', '2:2': 'amber',
  'Third Class': 'orange', Fail: 'red',
};

const COLOR_CLASSES = {
  green:  { bg: 'bg-green-100',  text: 'text-green-700',  border: 'border-green-300',  bar: 'bg-green-500' },
  blue:   { bg: 'bg-blue-100',   text: 'text-blue-700',   border: 'border-blue-300',   bar: 'bg-blue-500' },
  amber:  { bg: 'bg-amber-100',  text: 'text-amber-700',  border: 'border-amber-300',  bar: 'bg-amber-500' },
  orange: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300', bar: 'bg-orange-500' },
  red:    { bg: 'bg-red-100',    text: 'text-red-700',    border: 'border-red-300',    bar: 'bg-red-500' },
};

function gradeColor(grade, system) {
  const map = system === 'US' ? US_COLORS : UK_COLORS;
  return COLOR_CLASSES[map[grade] ?? 'blue'];
}

function scoreColor(score) {
  if (score >= 85) return COLOR_CLASSES.green;
  if (score >= 70) return COLOR_CLASSES.blue;
  if (score >= 55) return COLOR_CLASSES.amber;
  return COLOR_CLASSES.red;
}

export default function ResultsPage() {
  const navigate = useNavigate();
  const { result, status, uploadError, reset } = useAssignmentStore();

  useEffect(() => {
    if (!status && !result) navigate('/');
  }, [status, result, navigate]);

  const handleReset = () => {
    reset();
    navigate('/');
  };

  // ── Loading state ────────────────────────────────────────────────────────
  if (status === 'pending' || status === 'processing') {
    return (
      <FullPageCenter>
        <div className="text-center space-y-4">
          <PulsingBrain />
          <h2 className="text-xl font-semibold text-gray-800">
            {status === 'pending' ? 'Queued for grading…' : 'Analysing your submission…'}
          </h2>
          <p className="text-gray-500 text-sm">This usually takes 15–45 seconds.</p>
          <ProgressBar />
        </div>
      </FullPageCenter>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (status === 'error' || uploadError) {
    return (
      <FullPageCenter>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 max-w-md text-center space-y-4">
          <p className="text-4xl">⚠️</p>
          <h2 className="text-xl font-semibold text-red-700">Grading Failed</h2>
          <p className="text-red-600 text-sm">{uploadError ?? 'An unexpected error occurred.'}</p>
          <button onClick={handleReset} className="btn-primary">Try Again</button>
        </div>
      </FullPageCenter>
    );
  }

  if (!result) return null;

  const {
    letter_grade, raw_score, grading_system, summary,
    dimension_scores, swot, anchored_feedback, next_steps,
    instructions_alignment, flag_for_review, chain_of_thought,
  } = result;

  const colors = gradeColor(letter_grade, grading_system);
  const dimEntries = Object.entries(dimension_scores);

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* ── Top Bar ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Grading Results</h1>
          <button onClick={handleReset}
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
            ← Grade Another
          </button>
        </div>

        {/* ── Human Review Banner ────────────────────────────────────────── */}
        {flag_for_review && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-300
                          rounded-xl px-5 py-4 text-amber-800 text-sm">
            <span className="text-xl">🔍</span>
            <div>
              <p className="font-semibold">Borderline Grade — Human Review Recommended</p>
              <p className="text-amber-700">
                This submission is within ±2 points of a classification boundary.
                An instructor should verify before finalising.
              </p>
            </div>
          </div>
        )}

        {/* ── Grade Card + Summary ───────────────────────────────────────── */}
        <div className={`rounded-2xl border-2 ${colors.border} ${colors.bg} p-8`}>
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className={`text-7xl font-black ${colors.text} leading-none shrink-0`}>
              {letter_grade}
            </div>
            <div className="text-center sm:text-left flex-1">
              <p className="text-gray-600 text-sm font-medium uppercase tracking-wide">
                {grading_system} System · {grading_system === 'US' ? 'Additive' : 'Deductive'}
              </p>
              <p className="text-4xl font-bold text-gray-900 mt-1">
                {raw_score.toFixed(1)}<span className="text-xl text-gray-400">/100</span>
              </p>
            </div>
          </div>
          {summary && (
            <p className="mt-5 pt-5 border-t border-black/10 text-gray-800 font-medium leading-relaxed">
              {summary}
            </p>
          )}
        </div>

        {/* ── Instructions Alignment (only if instructions were given) ─────── */}
        {instructions_alignment && (
          <div className="flex items-start gap-3 bg-indigo-50 border border-indigo-200
                          rounded-xl px-5 py-4 text-sm">
            <span className="text-lg shrink-0">📋</span>
            <div>
              <p className="font-semibold text-indigo-900 mb-0.5">Assignment Brief Alignment</p>
              <p className="text-indigo-800">{instructions_alignment}</p>
            </div>
          </div>
        )}

        {/* ── Dimension Score Grid ──────────────────────────────────────── */}
        <Section title="Dimension Scores" noPadding>
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-gray-100">
            {dimEntries.map(([dim, data]) => {
              const sc = scoreColor(data.score);
              return (
                <div key={dim} className="p-4">
                  <p className="text-xs text-gray-500 capitalize mb-1 truncate">{dim}</p>
                  <p className="text-xl font-bold text-gray-900 mb-2">{data.score.toFixed(0)}</p>
                  <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-1.5 rounded-full ${sc.bar}`} style={{ width: `${data.score}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        {/* ── Per-Dimension Detail (rationale + evidence together) ─────────── */}
        <Section title="Evaluator Rationale">
          <div className="space-y-5">
            {dimEntries.map(([dim, data]) => (
              <DimensionDetail key={dim} name={dim} data={data} />
            ))}
          </div>
        </Section>

        {/* ── Next Steps ────────────────────────────────────────────────── */}
        {next_steps?.length > 0 && (
          <Section title="Next Steps">
            <ol className="space-y-3">
              {next_steps.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700
                                   text-xs font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-sm text-gray-700 leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </Section>
        )}

        {/* ── SWOT Analysis ─────────────────────────────────────────────── */}
        <Section title="SWOT Analysis">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SWOTQuadrant label="Strengths" emoji="💪" items={swot.strengths} color="green" />
            <SWOTQuadrant label="Weaknesses" emoji="⚠️" items={swot.weaknesses} color="red" />
            <SWOTQuadrant label="Opportunities" emoji="🚀" items={swot.opportunities} color="blue" />
            <SWOTQuadrant label="Threats" emoji="🔻" items={swot.threats} color="orange" />
          </div>
        </Section>

        {/* ── Anchored Feedback Narrative ───────────────────────────────── */}
        <Section title="Detailed Feedback">
          <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
            {anchored_feedback}
          </div>
        </Section>

        {/* ── Chain of Thought (collapsible) ─────────────────────────────── */}
        {chain_of_thought?.length > 0 && (
          <details className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <summary className="px-6 py-4 font-semibold text-gray-700 cursor-pointer
                                hover:bg-gray-50 rounded-xl">
              🔗 AI Chain of Thought (Transparency Log)
            </summary>
            <ol className="px-6 pb-6 mt-2 space-y-2 list-decimal list-inside">
              {chain_of_thought.map((step, i) => (
                <li key={i} className="text-sm text-gray-600">{step}</li>
              ))}
            </ol>
          </details>
        )}

      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, children, noPadding = false }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <h2 className="text-lg font-semibold text-gray-800 px-6 pt-6 pb-3">{title}</h2>
      <div className={noPadding ? '' : 'px-6 pb-6'}>{children}</div>
    </div>
  );
}

function DimensionDetail({ name, data }) {
  const sc = scoreColor(data.score);
  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-gray-800 capitalize">{name}</span>
        <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${sc.bg} ${sc.text}`}>
          {data.score.toFixed(0)}/100
        </span>
      </div>
      {data.chain_of_thought && (
        <p className="text-sm text-gray-600 leading-relaxed mb-3">{data.chain_of_thought}</p>
      )}
      {data.evidence?.length > 0 && (
        <div className="space-y-1.5">
          {data.evidence.map((quote, i) => (
            <blockquote key={i}
              className="border-l-2 border-gray-300 pl-3 py-0.5 text-xs text-gray-500 italic">
              "{quote}"
            </blockquote>
          ))}
        </div>
      )}
    </div>
  );
}

function SWOTQuadrant({ label, emoji, items, color }) {
  const palette = COLOR_CLASSES[color];
  if (!items?.length) return null;
  return (
    <div className={`rounded-xl border ${palette.border} ${palette.bg} p-4`}>
      <h3 className={`font-semibold text-sm mb-2 ${palette.text}`}>
        {emoji} {label}
      </h3>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-gray-700 flex gap-2">
            <span className="text-gray-400">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FullPageCenter({ children }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      {children}
    </div>
  );
}

function PulsingBrain() {
  return (
    <div className="relative w-16 h-16 mx-auto">
      <div className="absolute inset-0 rounded-full bg-indigo-200 animate-ping opacity-60" />
      <div className="relative w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center text-3xl">
        🧠
      </div>
    </div>
  );
}

function ProgressBar() {
  return (
    <div className="w-64 mx-auto h-1.5 bg-gray-200 rounded-full overflow-hidden">
      <div className="h-full bg-indigo-500 rounded-full animate-[progress_3s_ease-in-out_infinite]"
        style={{ width: '60%' }} />
    </div>
  );
}