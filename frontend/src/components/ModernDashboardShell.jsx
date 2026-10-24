import React from 'react';

const shellCards = [
  { label: 'Submissions', value: '1,284', trend: '+12.4%' },
  { label: 'Avg. score', value: '84.7%', trend: '+3.1%' },
  { label: 'Flagged', value: '41', trend: '-8.2%' },
  { label: 'Rubrics', value: '14', trend: '+2' },
];

const rubricCards = [
  { name: 'Analysis', score: 88, tone: 'bg-emerald-500' },
  { name: 'Evidence', score: 82, tone: 'bg-sky-500' },
  { name: 'Structure', score: 91, tone: 'bg-violet-500' },
  { name: 'Referencing', score: 76, tone: 'bg-amber-500' },
];

export default function ModernDashboardShell() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0b1020 0%, #121a2b 100%)',
      color: '#edf2ff',
      padding: '32px',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{ maxWidth: 1300, margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <div>
            <p style={{ margin: 0, color: '#93c5fd', fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Academic workspace
            </p>
            <h1 style={{ margin: '8px 0 0', fontSize: 34, fontWeight: 700 }}>Assessment Dashboard</h1>
          </div>
          <button
            style={{
              border: '1px solid rgba(148,163,184,0.4)',
              borderRadius: 12,
              background: 'rgba(15,23,42,0.8)',
              color: '#e2e8f0',
              padding: '10px 16px',
              fontWeight: 600,
            }}
          >
            Export report
          </button>
        </header>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 18, marginBottom: 28 }}>
          {shellCards.map((card) => (
            <div key={card.label} style={{ background: 'rgba(15,23,42,0.72)', border: '1px solid rgba(148,163,184,0.18)', borderRadius: 16, padding: 20 }}>
              <div style={{ color: '#94a3b8', fontSize: 13 }}>{card.label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 14 }}>
                <strong style={{ fontSize: 28 }}>{card.value}</strong>
                <span style={{ color: '#34d399', fontSize: 12, fontWeight: 700 }}>{card.trend}</span>
              </div>
            </div>
          ))}
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.9fr', gap: 20 }}>
          <div style={{ background: 'rgba(15,23,42,0.72)', border: '1px solid rgba(148,163,184,0.18)', borderRadius: 18, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 20 }}>Class distribution</h2>
              <span style={{ color: '#93c5fd', fontSize: 12 }}>This cohort</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', alignItems: 'end', gap: 12, height: 220, paddingTop: 24 }}>
              {[58, 74, 82, 91, 68].map((height, index) => (
                <div key={height} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                    <div style={{ width: '68%', height: `${height}%`, borderRadius: '10px 10px 0 0', background: ['#60a5fa', '#38bdf8', '#34d399', '#a78bfa', '#fbbf24'][index] }} />
                  </div>
                  <span style={{ color: '#cbd5e1', fontSize: 12, marginTop: 8 }}>{['A', 'B', 'C', 'D', 'F'][index]}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: 'rgba(15,23,42,0.72)', border: '1px solid rgba(148,163,184,0.18)', borderRadius: 18, padding: 24 }}>
            <h2 style={{ margin: '0 0 20px', fontSize: 20 }}>Rubric performance</h2>
            <div style={{ display: 'grid', gap: 18 }}>
              {rubricCards.map((item) => (
                <div key={item.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{item.name}</span>
                    <span style={{ color: '#cbd5e1' }}>{item.score}%</span>
                  </div>
                  <div style={{ height: 10, background: 'rgba(148,163,184,0.12)', borderRadius: 999 }}>
                    <div style={{ height: '100%', width: `${item.score}%`, borderRadius: 999, background: item.tone.replace('bg-', '') === 'emerald-500' ? '#10b981' : item.tone.replace('bg-', '') === 'sky-500' ? '#38bdf8' : item.tone.replace('bg-', '') === 'violet-500' ? '#8b5cf6' : '#f59e0b' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
