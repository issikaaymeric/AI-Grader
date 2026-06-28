import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LineChart, Line, BarChart, Bar, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PolarRadiusAxis,
} from 'recharts';
import { useAuthStore } from '../store/authStore';
import { useAssignmentStore } from '../store/assignmentStore';


// ── AI insight fetch ────────────────────────────────────────────────────────
async function fetchAIInsight(history, token) {
  const summary = history.map((a) => ({
    subject: a.subject,
    score: a.result?.score ?? null,
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
function buildTrend(history) {
  return history
    .filter((a) => a.result?.score != null)
    .map((a, i) => ({
      index: i + 1,
      score: Math.round(a.result.score),
      subject: a.subject?.slice(0, 20),
      date: new Date(a.created_at).toLocaleDateString(),
    }));
}

function buildSubjectBreakdown(history) {
  const map = {};
  history.forEach((a) => {
    if (a.result?.score == null) return;
    if (!map[a.subject]) map[a.subject] = { total: 0, count: 0 };
    map[a.subject].total += a.result.score;
    map[a.subject].count += 1;
  });
  return Object.entries(map).map(([subject, { total, count }]) => ({
    subject: subject.length > 22 ? subject.slice(0, 22) + '…' : subject,
    avg: Math.round(total / count),
  })).sort((a, b) => b.avg - a.avg);
}

function buildDistribution(history) {
  const buckets = { '0-49': 0, '50-59': 0, '60-69': 0, '70-79': 0, '80-89': 0, '90-100': 0 };
  history.forEach((a) => {
    const s = a.result?.score;
    if (s == null) return;
    if (s < 50) buckets['0-49']++;
    else if (s < 60) buckets['50-59']++;
    else if (s < 70) buckets['60-69']++;
    else if (s < 80) buckets['70-79']++;
    else if (s < 90) buckets['80-89']++;
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
  const { history, fetchHistory } = useAssignmentStore();
  const { t } = useTranslation();

  const [insight, setInsight] = useState(null);
  const [insightLoading, setInsightLoading] = useState(false);

  useEffect(() => {
    fetchHistory({ limit: 100, offset: 0 });
  }, []);

  useEffect(() => {
    if (history.length === 0) return;
    setInsightLoading(true);
    fetchAIInsight(history, accessToken)
      .then((result) => {
        console.log('[insight]', result);  // add this
        setInsight(result);
      })
      .catch((err) => console.error('[insight error]', err))  // and this
      .finally(() => setInsightLoading(false));
  }, [history]);

  const done = history.filter((a) => (a.score ?? a.result?.score) != null);
  const scores = done.map((a) => a.result?.score).filter((s) => s != null);
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : '—';
  const best = scores.length ? Math.round(Math.max(...scores)) : '—';
  const trend = buildTrend(done);
  const breakdown = buildSubjectBreakdown(done);
  const distribution = buildDistribution(done);
  const radarData = buildSwotRadar(done);
  const swot = aggregateSwot(done);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xl">
            {user?.name?.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{user?.name}</h1>
            <p className="text-sm text-gray-500">{user?.email} · <span className="capitalize">{user?.role}</span></p>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Assignments" value={done.length} sub="graded" />
          <StatCard label="Average Score" value={avg} sub="across all subjects" color="#7C3AED" />
          <StatCard label="Best Score" value={best} sub="personal record" color="#10B981" />
          <StatCard label="Subjects" value={new Set(done.map((a) => a.subject)).size} sub="covered" color="#EC4899" />
        </div>

        {/* AI Insight */}
        <div className="bg-linear-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🧠</span>
            <h2 className="text-sm font-semibold text-indigo-700">AI Academic Insight</h2>
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

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <SectionTitle>Score Distribution</SectionTitle>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={distribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => [v, 'Assignments']} />
                <Bar dataKey="count" fill="#EC4899" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
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
