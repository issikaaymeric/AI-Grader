import { useEffect, useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PolarRadiusAxis,
} from 'recharts';
import { useAuthStore } from '../store/authStore';
import { useAssignmentStore } from '../store/assignmentStore';


// ── AI insight fetch ────────────────────────────────────────────────────────
async function fetchAIInsight(history, token) {
  const summary = history.map((a) => ({
    subject: a.subject,
    score: getScore(a),
    date: a.created_at,
    swot: a.result?.swot ?? null,
  }));

  const res = await fetch(`/api/translate/insight`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ history: summary }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.insight ?? null;
}

// ── Data helpers ────────────────────────────────────────────────────────────
// History payloads can expose the grade at the top level or inside result.
// Normalize once so every profile chart and statistic uses the same score.
function getScore(assignment) {
  const candidates = [assignment?.score, assignment?.result?.score, assignment?.result?.raw_score];
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === '') continue;
    const score = Number(candidate);
    if (Number.isFinite(score) && score >= 0 && score <= 100) return score;
  }
  return null;
}

function buildTrend(history) {
  return history
    .map((a) => ({ assignment: a, score: getScore(a) }))
    .filter(({ score }) => score !== null)
    .map(({ assignment, score }, i) => ({
      index: i + 1,
      score: Math.round(score),
      subject: assignment.subject?.slice(0, 20) || 'Assignment',
      date: assignment.created_at ? new Date(assignment.created_at).toLocaleDateString() : 'Date unavailable',
    }));
}

function buildSubjectBreakdown(history) {
  const map = {};
  history.forEach((a) => {
    const score = getScore(a);
    if (score === null) return;
    const subject = a.subject || 'Uncategorized';
    if (!map[subject]) map[subject] = { total: 0, count: 0 };
    map[subject].total += score;
    map[subject].count += 1;
  });
  return Object.entries(map).map(([subject, { total, count }]) => ({
    subject: subject.length > 22 ? subject.slice(0, 22) + '…' : subject,
    avg: Math.round(total / count),
  })).sort((a, b) => b.avg - a.avg);
}

function buildDistribution(history) {
  const buckets = { '0-49': 0, '50-59': 0, '60-69': 0, '70-79': 0, '80-89': 0, '90-100': 0 };
  history.forEach((assignment) => {
    const score = getScore(assignment);
    if (score === null) return;
    if (score < 50) buckets['0-49']++;
    else if (score < 60) buckets['50-59']++;
    else if (score < 70) buckets['60-69']++;
    else if (score < 80) buckets['70-79']++;
    else if (score < 90) buckets['80-89']++;
    else buckets['90-100']++;
  });
  return Object.entries(buckets).map(([range, count]) => ({ range, count }));
}

function buildSwotRadar(history) {
  const dims = {};
  history.forEach((a) => {
    const ds = a.result?.dimension_scores;
    if (!ds) return;
    Object.entries(ds).forEach(([k, v]) => {
      if (!dims[k]) dims[k] = { total: 0, count: 0 };
      dims[k].total += v.score ?? 0;
      dims[k].count += 1;
    });
  });
  return Object.entries(dims).map(([dim, { total, count }]) => ({
    dim: dim.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 18),
    score: Math.round(total / count),
  }));
}

function aggregateSwot(history) {
  const swot = { strengths: [], weaknesses: [], opportunities: [], threats: [] };
  history.forEach((a) => {
    const s = a.result?.swot;
    if (!s) return;
    Object.keys(swot).forEach((k) => {
      if (Array.isArray(s[k])) swot[k].push(...s[k]);
    });
  });
  // deduplicate loosely by first 40 chars
  Object.keys(swot).forEach((k) => {
    const seen = new Set();
    swot[k] = swot[k].filter((item) => {
      const key = item.slice(0, 40);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 4);
  });
  return swot;
}

// ── Components ──────────────────────────────────────────────────────────────
function DistributionTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  const count = Number(point.count);
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-sm font-semibold text-gray-900">{label}</p>
      <p className="mt-1 text-sm text-pink-600">Assignments: {Number.isFinite(count) ? count : 0}</p>
    </div>
  );
}

function StatCard({ label, value, sub, color = '#7C3AED' }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col gap-1">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-bold" style={{ color }}>{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

function SectionTitle({ children }) {
  return <h2 className="text-base font-semibold text-gray-800 mb-3">{children}</h2>;
}

function SwotCard({ label, items, color, bg }) {
  return (
    <div className="rounded-xl p-4" style={{ background: bg }}>
      <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color }}>{label}</p>
      <ul className="space-y-1">
        {items.length === 0
          ? <li className="text-xs text-gray-400 italic">Not enough data yet</li>
          : items.map((item, i) => (
            <li key={i} className="text-xs text-gray-700 flex gap-1">
              <span style={{ color }}>•</span> {item}
            </li>
          ))}
      </ul>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const { user, accessToken } = useAuthStore();
  const { history = [], fetchHistory } = useAssignmentStore();

  const [insight, setInsight] = useState(null);
  const [insightLoading, setInsightLoading] = useState(false);

  useEffect(() => {
    fetchHistory({ limit: 100, offset: 0 });
  }, []);

  useEffect(() => {
    if (history.length === 0) return;
    setInsightLoading(true);
    fetchAIInsight(history, accessToken)
      .then((result) => setInsight(result))
      .catch(() => setInsight(null))
      .finally(() => setInsightLoading(false));
  }, [history]);

  const done = history.filter((assignment) => getScore(assignment) !== null);
  const scores = done.map(getScore);
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : '—';
  const best = scores.length ? Math.round(Math.max(...scores)) : '—';
  const trend = buildTrend(done);
  const breakdown = buildSubjectBreakdown(done);
  const distribution = buildDistribution(done);
  const radarData = buildSwotRadar(done);
  const swot = aggregateSwot(done);

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6 sm:px-6 lg:py-8">
      <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
          <div className="w-14 h-14 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xl">
            {user?.name?.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">Academic overview</p>
            <h1 className="mt-1 text-2xl font-bold text-gray-900 sm:text-3xl">{user?.name || 'Your profile'}</h1>
            <p className="mt-1 break-words text-sm text-gray-500">{user?.email || 'Account details unavailable'}{user?.role ? <> · <span className="capitalize">{user.role}</span></> : null}</p>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600">Track your grading history, understand your score patterns, and identify subjects where you can improve.</p>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label="Assignments" value={done.length} sub="graded" />
          <StatCard label="Average Score" value={avg} sub="across all subjects" color="#7C3AED" />
          <StatCard label="Best Score" value={best} sub="personal record" color="#10B981" />
          <StatCard label="Subjects" value={new Set(done.map((a) => a.subject)).size} sub="covered" color="#EC4899" />
        </div>

        {/* AI Insight */}
        <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-purple-50 p-5 sm:p-6">
          <div className="mb-3 flex items-center gap-3">
            <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-200 bg-white text-xs font-bold tracking-wide text-indigo-700">AI</span>
            <div>
              <h2 className="text-sm font-semibold text-indigo-800">AI Academic Insight</h2>
              <p className="text-xs text-indigo-500">Personalized feedback based on your graded work</p>
            </div>
          </div>
          {insightLoading ? (
            <div className="flex items-center gap-2 text-sm text-indigo-400">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Analyzing your performance…
            </div>
          ) : insight ? (
            <p className="text-sm text-gray-700 leading-relaxed">{insight}</p>
          ) : (
            <p className="text-sm text-gray-400 italic">Submit more assignments to unlock AI insights.</p>
          )}
        </div>

        {/* Grade trend */}
        {trend.length > 1 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <SectionTitle>Grade Trend</SectionTitle>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v) => [`${v}%`, 'Score']}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.subject ?? ''}
                />
                <Line type="monotone" dataKey="score" stroke="#7C3AED" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Subject breakdown + Score distribution */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {breakdown.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <SectionTitle>Subject Performance</SectionTitle>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={breakdown} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="subject" width={130} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v) => [`${v}%`, 'Avg Score']} />
                  <Bar dataKey="avg" fill="#7C3AED" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6">
            <div className="mb-1 flex items-start justify-between gap-3">
              <SectionTitle>Score Distribution</SectionTitle>
              <span className="rounded-full bg-pink-50 px-2.5 py-1 text-xs font-medium text-pink-700">{scores.length} graded</span>
            </div>
            <p className="mb-4 text-sm text-gray-500">Number of assignments in each score range.</p>
            {scores.length === 0 ? (
              <div className="flex h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 px-5 text-center">
                <p className="text-sm font-semibold text-gray-700">No scores to chart yet</p>
                <p className="mt-1 max-w-xs text-xs leading-5 text-gray-500">Your score distribution will appear here after an assignment has a valid score from 0 to 100.</p>
              </div>
            ) : <ResponsiveContainer width="100%" height={220}>
              <BarChart data={distribution} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip content={<DistributionTooltip />} cursor={{ fill: '#fdf2f8' }} />
                <Bar dataKey="count" fill="#EC4899" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>}
          </div>
        </div>

        {/* Radar + SWOT */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {radarData.length > 2 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <SectionTitle>Skill Dimensions</SectionTitle>
              <ResponsiveContainer width="100%" height={260}>
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="dim" tick={{ fontSize: 10 }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                  <Radar dataKey="score" stroke="#7C3AED" fill="#7C3AED" fillOpacity={0.25} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <SectionTitle>SWOT Summary</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <SwotCard label="Strengths" items={swot.strengths} color="#059669" bg="#ECFDF5" />
              <SwotCard label="Weaknesses" items={swot.weaknesses} color="#DC2626" bg="#FEF2F2" />
              <SwotCard label="Opportunities" items={swot.opportunities} color="#2563EB" bg="#EFF6FF" />
              <SwotCard label="Threats" items={swot.threats} color="#D97706" bg="#FFFBEB" />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
