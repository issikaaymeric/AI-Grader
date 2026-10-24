import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiFetch } from '../store/authStore';

const PALETTE = ['#6d5ce8', '#13b8a6', '#f59e0b', '#f97316', '#ec4899', '#64748b'];
const STATUS_COLORS = {
  completed: '#13b8a6',
  graded: '#13b8a6',
  pending: '#f59e0b',
  processing: '#6d5ce8',
  queued: '#818cf8',
  error: '#ef4444',
  failed: '#ef4444',
};

const number = (value) => new Intl.NumberFormat().format(value ?? 0);
const titleCase = (value) => String(value || 'Unknown').replace(/[_-]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

function MetricIcon({ name }) {
  const paths = {
    submissions: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    score: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    graded: <><path d="m5 12 4 4L19 6" /></>,
    pending: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    review: <><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v4M12 16h.01" /></>,
  };
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.submissions}</svg>;
}

function MetricCard({ label, value, hint, tone = 'violet', icon }) {
  return (
    <article className="analytics-metric">
      <div className="analytics-metric-top">
        <span className="analytics-muted">{label}</span>
        <span className={`analytics-metric-icon ${tone}`} aria-hidden="true"><MetricIcon name={icon} /></span>
      </div>
      <div className="analytics-metric-value">{value}</div>
      <p className="analytics-metric-hint">{hint}</p>
    </article>
  );
}

function Panel({ title, subtitle, action, children, className = '' }) {
  return (
    <section className={`analytics-panel ${className}`}>
      <div className="analytics-panel-heading">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function EmptyChart({ title, detail }) {
  return (
    <div className="analytics-empty">
      <span aria-hidden="true">◌</span>
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}

export default function AnalyticsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [systemFilter, setSystemFilter] = useState('all');

  const loadAnalytics = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const response = await apiFetch('/api/analytics/');
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail || 'Could not load analytics.');
      setData(body);
    } catch (err) {
      setError(err.message || 'Could not load analytics.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);

  const systems = useMemo(() => Object.keys(data?.grade_distribution || {}), [data]);
  const gradeData = useMemo(() => {
    const distribution = data?.grade_distribution || {};
    return Object.entries(distribution)
      .filter(([system]) => systemFilter === 'all' || system === systemFilter)
      .flatMap(([system, grades]) => Object.entries(grades).map(([grade, count]) => ({
        grade,
        system,
        label: systemFilter === 'all' ? `${grade} · ${system}` : grade,
        count,
      })))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [data, systemFilter]);

  const statusData = useMemo(() => Object.entries(data?.status_distribution || {})
    .map(([status, value]) => ({ name: titleCase(status), value, color: STATUS_COLORS[status] || '#94a3b8' }))
    .sort((a, b) => b.value - a.value), [data]);

  const monthlyData = useMemo(() => (data?.monthly_activity || []).map((item) => {
    const [year, month] = String(item.month).split('-').map(Number);
    return { ...item, label: new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'short' }) };
  }), [data]);

  const hasRecords = (data?.total_assignments || 0) > 0;
  const scoreDisplay = data?.average_score == null ? '—' : new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(data.average_score);
  const tooltipStyle = { borderRadius: 12, border: '1px solid #e8eaf2', boxShadow: '0 8px 24px rgba(25, 30, 60, .08)' };

  return (
    <div className="analytics-page">
      <style>{styles}</style>
      <header className="analytics-header">
        <div>
          <div className="analytics-eyebrow"><span /> PERFORMANCE OVERVIEW</div>
          <h1>Grading analytics</h1>
          <p>Understand submission volume, grading outcomes, and where human review is needed.</p>
        </div>
        <button className="analytics-refresh" type="button" onClick={() => loadAnalytics({ quiet: true })} disabled={loading || refreshing}>
          <span className={refreshing ? 'analytics-spin' : ''} aria-hidden="true">↻</span>
          {refreshing ? 'Refreshing…' : 'Refresh data'}
        </button>
      </header>

      {error ? (
        <div className="analytics-error" role="alert">
          <div><strong>We couldn't load your analytics</strong><p>{error}</p></div>
          <button type="button" onClick={() => loadAnalytics()}>Try again</button>
        </div>
      ) : null}

      {loading ? (
        <div className="analytics-loading" role="status"><span className="analytics-loader" /> Loading your grading data…</div>
      ) : null}

      {!loading && !error && data ? (
        <>
          <div className="analytics-context-row">
            <div><span className="analytics-live-dot" /> Personal workspace <span className="analytics-context-separator">/</span> Based on your submissions</div>
            <div className="analytics-updated">Updated just now</div>
          </div>

          <div className="analytics-metrics-grid">
            <MetricCard label="Total submissions" value={number(data.total_assignments)} hint="All submissions in your workspace" icon="submissions" />
            <MetricCard label="Average score" value={scoreDisplay} hint={data.scored_assignments ? `Across ${number(data.scored_assignments)} numeric scores` : "No numeric scores yet"} tone="teal" icon="score" />
            <MetricCard label="Successfully graded" value={number(data.graded_assignments)} hint={data.total_assignments ? `${Math.round((data.graded_assignments / data.total_assignments) * 100)}% of all submissions` : 'No graded submissions yet'} tone="teal" icon="graded" />
            <MetricCard label="Awaiting grading" value={number(data.pending_assignments)} hint="Pending, queued, or processing" tone="amber" icon="pending" />
            <MetricCard label="Needs human review" value={number(data.flagged_for_review)} hint="Check these before final decisions" tone="rose" icon="review" />
          </div>

          <div className="analytics-main-grid">
            <Panel title="Submission activity" subtitle="Volume received over the last six months" className="analytics-wide">
              {monthlyData.some((item) => item.count > 0) ? (
                <div className="analytics-chart analytics-area-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={monthlyData} margin={{ top: 12, right: 12, left: -18, bottom: 0 }}>
                      <defs><linearGradient id="submissionFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7565e8" stopOpacity={0.24} /><stop offset="95%" stopColor="#7565e8" stopOpacity={0.015} /></linearGradient></defs>
                      <CartesianGrid stroke="#edf0f6" strokeDasharray="4 4" vertical={false} />
                      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#8b91a7', fontSize: 12 }} />
                      <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#8b91a7', fontSize: 12 }} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(value) => [value, 'Submissions']} />
                      <Area type="monotone" dataKey="count" stroke="#7565e8" strokeWidth={2.5} fill="url(#submissionFill)" activeDot={{ r: 5, strokeWidth: 0 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : <EmptyChart title="Your activity will appear here" detail="Upload your first assignment to start building a submission trend." />}
            </Panel>

            <Panel title="Submission status" subtitle="Where work stands right now">
              {statusData.length ? (
                <>
                  <div className="analytics-chart analytics-donut-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={57} outerRadius={82} paddingAngle={3} stroke="none">
                          {statusData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [value, name]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="analytics-donut-center"><strong>{number(data.total_assignments)}</strong><span>total</span></div>
                  </div>
                  <div className="analytics-legend">
                    {statusData.map((item) => (
                      <button type="button" className="analytics-legend-row analytics-legend-button" key={item.name} onClick={() => navigate('/grades')} aria-label={`Open submissions: ${item.name}`}><span className="analytics-legend-label"><i style={{ background: item.color }} />{item.name}</span><strong>{number(item.value)}</strong><span className="analytics-row-action">View</span></button>
                    ))}
                  </div>
                </>
              ) : <EmptyChart title="No status data yet" detail="Status breakdowns appear when submissions are created." />}
            </Panel>

            <Panel title="Grade distribution" subtitle="Grades returned by the grading engine" className="analytics-wide">
              <div className="analytics-filter-row">
                <span>Compare outcomes</span>
                <label className="analytics-select-label">
                  <span className="sr-only">Filter grading system</span>
                  <select value={systemFilter} onChange={(event) => setSystemFilter(event.target.value)}>
                    <option value="all">All grading systems</option>
                    {systems.map((system) => <option key={system} value={system}>{system}</option>)}
                  </select>
                </label>
              </div>
              {gradeData.length ? (
                <div className="analytics-chart analytics-bar-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={gradeData} margin={{ top: 8, right: 8, left: -18, bottom: 8 }}>
                      <CartesianGrid stroke="#edf0f6" strokeDasharray="4 4" vertical={false} />
                      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#777f96', fontSize: 11 }} interval={0} angle={gradeData.length > 7 ? -25 : 0} textAnchor={gradeData.length > 7 ? 'end' : 'middle'} height={gradeData.length > 7 ? 58 : 32} />
                      <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#8b91a7', fontSize: 12 }} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(value) => [value, 'Submissions']} />
                      <Bar dataKey="count" name="Submissions" radius={[6, 6, 0, 0]} maxBarSize={44} cursor="pointer" onClick={() => navigate('/grades')}>
                        {gradeData.map((item, index) => <Cell key={item.system + item.grade} fill={PALETTE[index % PALETTE.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <EmptyChart title="No grades to compare yet" detail="Completed grading results will appear here. Pending submissions are excluded." />}
            </Panel>

            <Panel title="Review queue" subtitle="Items requiring a closer look">
              <div className="analytics-review-summary">
                <div className="analytics-review-icon">!</div>
                <div><strong>{number(data.flagged_for_review)}</strong><span>flagged submission{data.flagged_for_review === 1 ? '' : 's'}</span></div>
              </div>
              <div className="analytics-review-copy">
                {data.flagged_for_review > 0
                  ? 'Review flagged work before using AI-generated results for academic decisions.'
                  : 'No submissions are currently flagged. Continue to review AI-generated grades before final decisions.'}
              </div>
              {data.failed_assignments > 0 ? (
                <div className="analytics-failure-note"><strong>{number(data.failed_assignments)} failed</strong><span>Check the grading history and retry after resolving the cause.</span></div>
              ) : null}
              <div className="analytics-review-footnote">AI grades are decision support, not a replacement for instructor judgment.</div>
            </Panel>
          </div>
          {!hasRecords ? <div className="analytics-first-run"><span>✦</span><div><strong>Your analytics workspace is ready</strong><p>Once you submit and grade assignments, trends and outcome comparisons will populate automatically.</p></div></div> : null}
          <footer className="analytics-footer">Metrics are calculated from submissions associated with your account.</footer>
        </>
      ) : null}
    </div>
  );
}

const styles = `
.analytics-page{--ink:#20233b;--muted:#7c8299;--line:#eaecf4;--surface:#fff;max-width:1440px;margin:0 auto;padding:32px clamp(16px,3vw,40px) 48px;color:var(--ink)}
.analytics-page *{box-sizing:border-box}
.analytics-header{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;flex-wrap:wrap;margin-bottom:24px}
.analytics-eyebrow{display:flex;align-items:center;gap:8px;font-size:10px;font-weight:800;letter-spacing:.15em;color:#7666d9}
.analytics-eyebrow span{width:7px;height:7px;border-radius:50%;background:#8c7cf0;box-shadow:0 0 0 4px #efedff}
.analytics-header h1{font-size:clamp(27px,3vw,35px);letter-spacing:-.04em;line-height:1.15;margin:13px 0 9px;font-weight:800;color:#20233b}
.analytics-header p{color:var(--muted);font-size:14px;line-height:1.6;margin:0;max-width:660px}
.analytics-refresh{display:inline-flex;align-items:center;gap:9px;border:1px solid #e2e4ef;border-radius:11px;background:#fff;color:#353851;padding:10px 14px;font-size:13px;font-weight:700;box-shadow:0 2px 5px #20233b08;cursor:pointer;transition:all .18s}
.analytics-refresh:hover:not(:disabled){border-color:#bcb3f8;background:#faf9ff;transform:translateY(-1px)}
.analytics-refresh:disabled{opacity:.65;cursor:wait}
.analytics-refresh>span{font-size:18px;line-height:12px}.analytics-spin{animation:analytics-spin 1s linear infinite}
@keyframes analytics-spin{to{transform:rotate(360deg)}}
.analytics-context-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;color:#737991;font-size:12px;margin:0 0 14px}
.analytics-live-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#10b981;margin-right:7px}
.analytics-context-separator{margin:0 9px;color:#c4c7d4}.analytics-updated{color:#999eb0}
.analytics-metrics-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:15px;margin-bottom:18px}
.analytics-metric{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:19px 20px;box-shadow:0 3px 12px #25294a04;min-width:0}
.analytics-metric-top{display:flex;justify-content:space-between;align-items:center;gap:8px}.analytics-muted{font-size:12px;color:var(--muted);font-weight:600}
.analytics-metric-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:11px;font-size:17px;font-weight:800;background:#f0edff;color:#7060d9}
.analytics-metric-icon.teal{background:#e5faf4;color:#0e9f83}.analytics-metric-icon.amber{background:#fff5df;color:#c18412}.analytics-metric-icon.rose{background:#fff0f1;color:#e25368}
.analytics-metric-value{font-size:clamp(25px,2.5vw,33px);font-weight:800;letter-spacing:-.04em;line-height:1.2;margin:14px 0 7px;color:#242741}
.analytics-metric-hint{margin:0;color:#969bad;font-size:11px;line-height:1.5}
.analytics-main-grid{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(300px,1fr);gap:17px;align-items:stretch}
.analytics-panel{min-width:0;background:#fff;border:1px solid var(--line);border-radius:16px;padding:21px;box-shadow:0 3px 12px #25294a04}
.analytics-wide{min-width:0}
.analytics-panel-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:18px}
.analytics-panel-heading h2{font-size:15px;letter-spacing:-.015em;font-weight:800;margin:0;color:#282b46}
.analytics-panel-heading p{font-size:11px;color:#9297aa;margin:6px 0 0;line-height:1.5}
.analytics-chart{width:100%;min-width:0}.analytics-area-chart{height:250px}.analytics-bar-chart{height:265px}.analytics-donut-chart{height:190px;position:relative}
.analytics-donut-center{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;pointer-events:none}
.analytics-donut-center strong{font-size:26px;letter-spacing:-.04em;color:#282b46}.analytics-donut-center span{font-size:10px;color:#9297aa;margin-top:2px}
.analytics-legend{display:grid;gap:11px;margin-top:5px}.analytics-legend-row{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:12px;color:#525871}
.analytics-legend-row strong{font-size:12px;color:#282b46}.analytics-legend-label{display:flex;align-items:center;gap:8px}
.analytics-legend-label i{display:inline-block;width:8px;height:8px;border-radius:3px;flex-shrink:0}
.analytics-filter-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:-2px 0 6px;color:#9297aa;font-size:11px}
.analytics-select-label select{border:1px solid #e5e7f0;border-radius:9px;padding:7px 10px;color:#4e536b;background:#fff;font-size:11px;outline-offset:2px;max-width:100%}
.analytics-empty{min-height:190px;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;padding:24px 12px}
.analytics-empty>span{font-size:27px;color:#b6adef}.analytics-empty strong{font-size:13px;margin-top:9px;color:#454a65}.analytics-empty p{max-width:250px;font-size:11px;color:#9297aa;line-height:1.6;margin:7px 0 0}
.analytics-review-summary{display:flex;align-items:center;gap:13px;border:1px solid #f3e5e6;background:#fffafa;border-radius:13px;padding:15px}
.analytics-review-icon{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:#ffe9ec;color:#df5266;font-weight:900;font-size:20px}
.analytics-review-summary>div:last-child{display:grid;gap:3px}.analytics-review-summary strong{font-size:25px;line-height:1;letter-spacing:-.04em}.analytics-review-summary span{font-size:11px;color:#8e91a3}
.analytics-review-copy{font-size:12px;line-height:1.65;color:#777d93;margin:14px 2px}
.analytics-failure-note{display:grid;gap:4px;background:#fff7e8;border-radius:10px;padding:11px 12px;color:#9a6612;font-size:11px;line-height:1.5}.analytics-failure-note strong{font-size:12px}
.analytics-legend-button{width:100%;border:0;background:transparent;text-align:left;cursor:pointer;border-radius:8px;padding:8px 6px;font:inherit}.analytics-legend-button:hover,.analytics-legend-button:focus-visible{background:#f5f3ff;outline:2px solid #c4b5fd;outline-offset:1px}.analytics-row-action{margin-left:auto;color:#6d5ce8;font-size:11px;font-weight:700;opacity:0;transition:opacity .15s}.analytics-legend-button:hover .analytics-row-action,.analytics-legend-button:focus-visible .analytics-row-action{opacity:1}.analytics-review-footnote{border-top:1px solid #f0f1f6;padding-top:13px;margin-top:14px;color:#989caf;font-size:10px;line-height:1.6}
.analytics-first-run{display:flex;align-items:flex-start;gap:13px;padding:18px;border:1px dashed #dcd8f9;background:#faf9ff;border-radius:14px;margin-top:17px}
.analytics-first-run>span{font-size:20px;color:#7968df}.analytics-first-run strong{font-size:13px}.analytics-first-run p{font-size:12px;color:#7c8299;line-height:1.6;margin:5px 0 0}
.analytics-footer{font-size:10px;color:#a0a4b4;text-align:center;margin-top:23px}
.analytics-error{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:15px 17px;border:1px solid #fecaca;background:#fff5f5;color:#991b1b;border-radius:12px;margin-bottom:16px}
.analytics-error strong{font-size:13px}.analytics-error p{font-size:12px;margin:4px 0 0}.analytics-error button{background:#fff;border:1px solid #f2b6b6;border-radius:8px;padding:8px 11px;color:#991b1b;font-weight:700;cursor:pointer}
.analytics-loading{display:flex;align-items:center;gap:10px;min-height:220px;justify-content:center;color:#777d93;font-size:13px}
.analytics-loader{width:19px;height:19px;border:2px solid #e5e1fb;border-top-color:#7565e8;border-radius:50%;animation:analytics-spin .8s linear infinite}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:1150px){.analytics-metrics-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.analytics-main-grid{grid-template-columns:minmax(0,1.3fr) minmax(280px,1fr)}}
@media(max-width:760px){.analytics-page{padding-top:24px}.analytics-main-grid{grid-template-columns:1fr}.analytics-metrics-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.analytics-header{align-items:flex-start}.analytics-refresh{width:100%;justify-content:center}.analytics-metric{padding:16px}.analytics-panel{padding:17px}.analytics-area-chart{height:220px}.analytics-bar-chart{height:250px}}
@media(max-width:420px){.analytics-metrics-grid{grid-template-columns:1fr 1fr;gap:9px}.analytics-metric{padding:13px}.analytics-metric-value{font-size:25px}.analytics-metric-hint{font-size:10px}.analytics-metric-top{align-items:flex-start}.analytics-metric-icon{width:29px;height:29px}.analytics-header p{font-size:13px}}
@media(prefers-reduced-motion:reduce){.analytics-page *{animation-duration:.01ms!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
`;
