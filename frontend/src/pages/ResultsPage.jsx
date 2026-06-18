import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAssignmentStore } from '../store/assignmentStore';

// Grade colour mapping
const US_COLORS = { A: 'green', B: 'blue', C: 'yellow', D: 'orange', F: 'red' };
const UK_COLORS = {
  'First Class': 'green',
  '2:1': 'blue',
  '2:2': 'yellow',
  'Third Class': 'orange',
  Fail: 'red',
};

const COLOR_CLASSES = {
  green:  { bg: 'bg-green-100',  text: 'text-green-700',  border: 'border-green-300',  bar: 'bg-green-500' },
  blue:   { bg: 'bg-blue-100',   text: 'text-blue-700',   border: 'border-blue-300',   bar: 'bg-blue-500' },
  yellow: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300', bar: 'bg-yellow-500' },
  orange: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300', bar: 'bg-orange-500' },
  red:    { bg: 'bg-red-100',    text: 'text-red-700',    border: 'border-red-300',    bar: 'bg-red-500' },
};

function gradeColor(grade, system) {
  const map = system === 'US' ? US_COLORS : UK_COLORS;
  return COLOR_CLASSES[map[grade] ?? 'blue'];
}

export default function ResultsPage() {
  const navigate = useNavigate();
  const { result, status, uploadError, reset } = useAssignmentStore();

  useEffect(() => {
    // If user lands here without a submission in progress, redirect
    if (!status && !result) navigate('/');
  }, [status, result, navigate]);

  const handleReset = () => {
    reset();
    navigate('/');
  };

  // ── Loading state ──────────────────────────────────────────────────────────
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

  // ── Error state ────────────────────────────────────────────────────────────
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

  const { letter_grade, raw_score, grading_system, dimension_scores, swot,
          anchored_feedback, flag_for_review, chain_of_thought } = result;

  const colors = gradeColor(letter_grade, grading_system);

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

        {/* ── Human Review Banner ──────────────────────────────────────────── */}
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

        {/* ── Grade Card ───────────────────────────────────────────────────── */}
        <div className={`rounded-2xl border-2 ${colors.border} ${colors.bg} p-8
                         flex flex-col sm:flex-row items-center gap-6`}>
          <div className={`text-7xl font-black ${colors.text} leading-none`}>
            {letter_grade}
          </div>
          <div className="text-center sm:text-left">
            <p className="text-gray-600 text-sm font-medium uppercase tracking-wide">
              {grading_system} System · {grading_system === 'US' ? 'Additive' : 'Deductive'}
            </p>
            <p className="text-4xl font-bold text-gray-900 mt-1">
              {raw_score.toFixed(1)}<span className="text-xl text-gray-400">/100</span>
            </p>
          </div>
        </div>

        {/* ── Dimension Scores ─────────────────────────────────────────────── */}
        <Section title="Dimension Breakdown">
          <div className="space-y-4">
            {Object.entries(dimension_scores).map(([dim, data]) => (
              <DimensionRow key={dim} name={dim} data={data} colors={colors} />
            ))}
          </div>
        </Section>

        {/* ── SWOT Analysis ────────────────────────────────────────────────── */}
        <Section title="SWOT Analysis">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SWOTQuadrant label="Strengths" emoji="💪" items={swot.strengths} color="green" />
            <SWOTQuadrant label="Weaknesses" emoji="⚠️" items={swot.weaknesses} color="red" />
            <SWOTQuadrant label="Opportunities" emoji="🚀" items={swot.opportunities} color="blue" />
            <SWOTQuadrant label="Threats" emoji="🔻" items={swot.threats} color="orange" />
          </div>
        </Section>

        {/* ── Anchored Feedback ────────────────────────────────────────────── */}
        <Section title="Detailed Feedback">
          <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap leading-relaxed">
            {anchored_feedback}
          </div>
        </Section>

        {/* ── Evidence Quotes ──────────────────────────────────────────────── */}
        <Section title="Evidence from Your Submission">
          {Object.entries(dimension_scores).map(([dim, data]) =>
            data.evidence?.length ? (
              <div key={dim} className="mb-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                  {dim}
                </h4>
                {data.evidence.map((quote, i) => (
                  <blockquote key={i}
                    className="border-l-4 border-indigo-300 pl-4 py-1 text-sm text-gray-600 italic mb-2">
                    "{quote}"
                  </blockquote>
                ))}
              </div>
            ) : null
          )}
        </Section>

        {/* ── Chain of Thought (collapsible) ───────────────────────────────── */}
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

// ── Sub-components ──────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
      <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
      {children}
    </div>
  );
}

function DimensionRow({ name, data, colors }) {
  const pct = data.score;
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm font-medium text-gray-700 capitalize">{name}</span>
        <span className="text-sm font-semibold text-gray-900">{pct.toFixed(0)}/100</span>
      </div>
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-2 rounded-full transition-all duration-700 ${colors.bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {data.chain_of_thought && (
        <p className="text-xs text-gray-500 mt-1">{data.chain_of_thought}</p>
      )}
    </div>
  );
}

function SWOTQuadrant({ label, emoji, items, color }) {
  const palette = COLOR_CLASSES[color];
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
