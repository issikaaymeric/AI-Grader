import { useState } from 'react';

const metricCards = [
  { label: 'Submissions', value: '1,284', delta: '+12.4%' },
  { label: 'Average score', value: '84.7%', delta: '+3.1%' },
  { label: 'Flagged', value: '41', delta: '-8.2%' },
  { label: 'Rubrics', value: '14', delta: '+2' },
];

const scoreBands = [
  { label: 'A', value: 58, color: '#60a5fa' },
  { label: 'B', value: 74, color: '#38bdf8' },
  { label: 'C', value: 82, color: '#34d399' },
  { label: 'D', value: 91, color: '#a78bfa' },
  { label: 'F', value: 68, color: '#fbbf24' },
];

const recentRuns = [
  { student: 'Alicia R.', id: 'ESS-2041', score: 91, status: 'Completed', slot: '2m ago' },
  { student: 'David K.', id: 'ESS-2042', score: 84, status: 'Review', slot: '7m ago' },
  { student: 'Nadia M.', id: 'ESS-2043', score: 76, status: 'Queued', slot: '11m ago' },
  { student: 'Owen T.', id: 'ESS-2044', score: 88, status: 'Completed', slot: '14m ago' },
];

const rubricBreakdown = [
  { name: 'Analysis', score: 88, tone: '#10b981' },
  { name: 'Evidence', score: 82, tone: '#38bdf8' },
  { name: 'Structure', score: 91, tone: '#8b5cf6' },
  { name: 'Referencing', score: 76, tone: '#f59e0b' },
];

const reviewSample = `The argument is coherent and the thesis is clearly stated. However, the evidence base could be deepened with more direct support from academic sources. The strongest section is the critical analysis of policy implications, which shows strong understanding of the topic.`;

export default function AssessmentWorkbench() {
  const [batchFiles, setBatchFiles] = useState([]);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0b1020 0%, #111827 100%)',
      color: '#e5eefb',
      fontFamily: 'Inter, system-ui, sans-serif',
      padding: '24px',
    }}>
      <div style={{ maxWidth: 1380, margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#93c5fd' }}>Academic grading workspace</div>
            <h1 style={{ margin: '10px 0 0', fontSize: 34, fontWeight: 700 }}>Assessment Hub</h1>
          </div>
          <button style={{
            border: '1px solid rgba(148,163,184,0.35)',
            background: 'rgba(15,23,42,0.72)',
            color: '#e2e8f0',
            borderRadius: 12,
            padding: '11px 18px',
            fontWeight: 600,
            cursor: 'pointer',
          }}>
            Export cohort report
          </button>
        </header>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 18, marginBottom: 22 }}>
          {metricCards.map((card) => (
            <div key={card.label} style={{
              background: 'rgba(15,23,42,0.72)',
              border: '1px solid rgba(148,163,184,0.18)',
              borderRadius: 18,
              padding: 20,
            }}>
              <div style={{ color: '#94a3b8', fontSize: 13 }}>{card.label}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14 }}>
                <strong style={{ fontSize: 28 }}>{card.value}</strong>
                <span style={{ color: '#34d399', fontSize: 12, fontWeight: 700 }}>{card.delta}</span>
              </div>
            </div>
          ))}
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20, marginBottom: 22 }}>
          <div style={{
            background: 'rgba(15,23,42,0.72)',
            border: '1px solid rgba(148,163,184,0.18)',
            borderRadius: 18,
            padding: 22,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h2 style={{ margin: 0, fontSize: 20 }}>Class distribution</h2>
              <span style={{ color: '#93c5fd', fontSize: 12 }}>Current cohort</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', alignItems: 'end', gap: 12, height: 220 }}>
              {scoreBands.map((band) => (
                <div key={band.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                    <div style={{ width: '68%', height: `${band.value}%`, borderRadius: '10px 10px 0 0', background: band.color }} />
                  </div>
                  <span style={{ marginTop: 10, color: '#cbd5e1', fontSize: 12 }}>{band.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{
            background: 'rgba(15,23,42,0.72)',
            border: '1px solid rgba(148,163,184,0.18)',
            borderRadius: 18,
            padding: 22,
          }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 20 }}>Batch upload</h2>
            <label style={{
              display: 'block',
              border: '1px dashed rgba(148,163,184,0.4)',
              borderRadius: 16,
              background: 'rgba(15,23,42,0.55)',
              minHeight: 180,
              padding: 18,
              cursor: 'pointer',
            }}>
              <input
                type="file"
                multiple
                onChange={(event) => setBatchFiles(Array.from(event.target.files || []))}
                style={{ display: 'none' }}
              />
              <div style={{ color: '#cbd5e1', fontWeight: 600, marginBottom: 12 }}>Drop files here or click to upload</div>
              <div style={{ color: '#94a3b8', fontSize: 13 }}>PDF • DOCX • TXT • ZIP batch</div>
              <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {batchFiles.length ? batchFiles.slice(0, 4).map((file) => (
                  <span key={file.name} style={{
                    background: 'rgba(96,165,250,0.14)',
                    border: '1px solid rgba(96,165,250,0.28)',
                    color: '#bfdbfe',
                    fontSize: 12,
                    borderRadius: 999,
                    padding: '6px 10px',
                  }}>{file.name}</span>
                )) : <span style={{ color: '#64748b', fontSize: 12 }}>No files selected</span>}
              </div>
            </label>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18, gap: 12 }}>
              <button style={{ flex: 1, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 12, padding: '11px 14px', fontWeight: 700, cursor: 'pointer' }}>Queue batch</button>
              <button style={{ flex: 1, background: 'rgba(15,23,42,0.9)', color: '#e2e8f0', border: '1px solid rgba(148,163,184,0.3)', borderRadius: 12, padding: '11px 14px', fontWeight: 600, cursor: 'pointer' }}>Schedule</button>
            </div>
          </div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', gap: 20 }}>
          <div style={{
            background: 'rgba(15,23,42,0.72)',
            border: '1px solid rgba(148,163,184,0.18)',
            borderRadius: 18,
            padding: 22,
          }}>
            <h2 style={{ margin: '0 0 18px', fontSize: 20 }}>Recent grading runs</h2>
            <div style={{ display: 'grid', gap: 12 }}>
              {recentRuns.map((run) => (
                <div key={run.id} style={{
                  display: 'grid',
                  gridTemplateColumns: '1.2fr 0.7fr 0.7fr 0.5fr',
                  alignItems: 'center',
                  background: 'rgba(15,23,42,0.5)',
                  border: '1px solid rgba(148,163,184,0.12)',
                  borderRadius: 12,
                  padding: '12px 14px',
                }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{run.student}</div>
                    <div style={{ color: '#94a3b8', fontSize: 12 }}>{run.id}</div>
                  </div>
                  <div style={{ color: '#dbeafe', fontWeight: 600 }}>{run.score}%</div>
                  <div style={{ color: run.status === 'Completed' ? '#34d399' : run.status === 'Review' ? '#fbbf24' : '#93c5fd', fontWeight: 600 }}>{run.status}</div>
                  <div style={{ color: '#94a3b8', fontSize: 12, textAlign: 'right' }}>{run.slot}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{
            background: 'rgba(15,23,42,0.72)',
            border: '1px solid rgba(148,163,184,0.18)',
            borderRadius: 18,
            padding: 22,
          }}>
            <h2 style={{ margin: '0 0 18px', fontSize: 20 }}>Side-by-side review</h2>

            <div style={{ border: '1px solid rgba(148,163,184,0.18)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                <div style={{ background: 'rgba(15,23,42,0.6)', padding: 14, borderRight: '1px solid rgba(148,163,184,0.18)' }}>
                  <div style={{ fontSize: 12, color: '#93c5fd', marginBottom: 10 }}>Submission excerpt</div>
                  <div style={{ color: '#dbeafe', lineHeight: 1.7, fontSize: 14 }}>{reviewSample}</div>
                </div>
                <div style={{ background: 'rgba(15,23,42,0.6)', padding: 14 }}>
                  <div style={{ fontSize: 12, color: '#93c5fd', marginBottom: 10 }}>Rubric score</div>
                  <div style={{ display: 'grid', gap: 12 }}>
                    {rubricBreakdown.map((item) => (
                      <div key={item.name}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span>{item.name}</span>
                          <span>{item.score}%</span>
                        </div>
                        <div style={{ height: 10, background: 'rgba(148,163,184,0.14)', borderRadius: 999 }}>
                          <div style={{ height: '100%', width: `${item.score}%`, borderRadius: 999, background: item.tone }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
