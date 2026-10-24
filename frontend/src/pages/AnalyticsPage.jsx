import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../store/authStore';

function StatCard({ label, value, hint }) {
  return (
    <section style={styles.card}>
      <div style={styles.muted}>{label}</div>
      <div style={styles.stat}>{value}</div>
      {hint ? <div style={styles.hint}>{hint}</div> : null}
    </section>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    apiFetch('/api/analytics/')
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.detail || 'Could not load analytics.');
        if (active) setData(body);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Could not load analytics.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const grades = useMemo(() => {
    if (!data?.grade_distribution) return [];
    return Object.entries(data.grade_distribution).flatMap(([system, counts]) =>
      Object.entries(counts).map(([grade, count]) => ({ system, grade, count }))
    ).sort((a, b) => b.count - a.count);
  }, [data]);

  const maxCount = Math.max(1, ...grades.map((item) => item.count));

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <p style={styles.eyebrow}>REPORTING</p>
          <h1 style={styles.title}>Grading analytics</h1>
          <p style={styles.subtitle}>A summary of your submissions and grading outcomes.</p>
        </div>
        <button style={styles.refresh} onClick={() => window.location.reload()}>Refresh</button>
      </div>

      {loading ? <p role="status">Loading analytics…</p> : null}
      {error ? <div role="alert" style={styles.error}>{error}</div> : null}

      {!loading && !error && data ? (
        <>
          <div style={styles.metrics}>
            <StatCard label="Total submissions" value={data.total_assignments ?? 0} />
            <StatCard label="Flagged for review" value={data.flagged_for_review ?? 0} hint="Require human attention" />
            <StatCard label="Grade categories" value={grades.length} hint="Across your grading systems" />
          </div>

          <section style={styles.panel}>
            <h2 style={styles.sectionTitle}>Grade distribution</h2>
            {grades.length === 0 ? (
              <p style={styles.muted}>No graded submissions yet. Your results will appear here after grading.</p>
            ) : (
              <div style={styles.list}>
                {grades.map((item) => (
                  <div key={item.system + item.grade} style={styles.gradeRow}>
                    <div style={styles.gradeLabel}>
                      <strong>{item.grade}</strong>
                      <span style={styles.muted}>{item.system} grading</span>
                    </div>
                    <div style={styles.track} aria-label={item.count + ' submissions'}>
                      <div style={{ ...styles.bar, width: ((item.count / maxCount) * 100) + '%' }} />
                    </div>
                    <strong style={styles.count}>{item.count}</strong>
                  </div>
                ))}
              </div>
            )}
          </section>
          <p style={styles.note}>AI-generated grades should be reviewed by a qualified instructor before being used for final academic decisions.</p>
        </>
      ) : null}
    </div>
  );
}

const styles = {
  page: { maxWidth: 1120, margin: '0 auto', padding: '32px 24px', color: '#172033' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 28 },
  eyebrow: { margin: 0, color: '#6d28d9', fontSize: 12, fontWeight: 800, letterSpacing: '0.12em' },
  title: { margin: '8px 0', fontSize: 30, lineHeight: 1.2 },
  subtitle: { margin: 0, color: '#64748b' },
  refresh: { border: '1px solid #d8dce5', borderRadius: 10, background: '#fff', padding: '10px 15px', fontWeight: 700, cursor: 'pointer' },
  metrics: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16, marginBottom: 20 },
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 20, boxShadow: '0 4px 18px rgba(15,23,42,0.04)' },
  muted: { color: '#64748b', fontSize: 13 },
  stat: { marginTop: 12, fontSize: 32, fontWeight: 800 },
  hint: { marginTop: 5, color: '#64748b', fontSize: 12 },
  panel: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 24 },
  sectionTitle: { margin: '0 0 20px', fontSize: 19 },
  list: { display: 'grid', gap: 18 },
  gradeRow: { display: 'grid', gridTemplateColumns: 'minmax(120px, 0.8fr) minmax(120px, 2fr) 32px', alignItems: 'center', gap: 14 },
  gradeLabel: { display: 'grid', gap: 3 },
  track: { height: 10, borderRadius: 999, overflow: 'hidden', background: '#eef2ff' },
  bar: { height: '100%', borderRadius: 999, background: '#7c3aed', transition: 'width 180ms ease' },
  count: { textAlign: 'right' },
  error: { marginBottom: 20, border: '1px solid #fecaca', background: '#fef2f2', color: '#991b1b', padding: 14, borderRadius: 12 },
  note: { marginTop: 18, color: '#64748b', fontSize: 12 },
};
