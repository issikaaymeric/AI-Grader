import React, { useEffect, useMemo, useState } from 'react';

const initialRubric = [
  { id: 1, name: 'Analysis', weight: 35 },
  { id: 2, name: 'Evidence', weight: 25 },
  { id: 3, name: 'Structure', weight: 25 },
  { id: 4, name: 'Referencing', weight: 15 },
];

const defaultRuns = [
  { student: 'Alicia R.', id: 'ESS-2041', score: 91, status: 'Completed', slot: '2m ago' },
  { student: 'David K.', id: 'ESS-2042', score: 84, status: 'Review', slot: '7m ago' },
  { student: 'Nadia M.', id: 'ESS-2043', score: 76, status: 'Queued', slot: '11m ago' },
  { student: 'Owen T.', id: 'ESS-2044', score: 88, status: 'Completed', slot: '14m ago' },
];

const scoreBands = [
  { label: 'A', value: 58, color: '#60a5fa' },
  { label: 'B', value: 74, color: '#38bdf8' },
  { label: 'C', value: 82, color: '#34d399' },
  { label: 'D', value: 91, color: '#a78bfa' },
  { label: 'F', value: 68, color: '#fbbf24' },
];

const rubricBreakdown = [
  { name: 'Analysis', score: 88, tone: '#10b981' },
  { name: 'Evidence', score: 82, tone: '#38bdf8' },
  { name: 'Structure', score: 91, tone: '#8b5cf6' },
  { name: 'Referencing', score: 76, tone: '#f59e0b' },
];

const reviewSample = `The argument is coherent and the thesis is clearly stated. However, the evidence base could be deepened with more direct support from academic sources. The strongest section is the critical analysis of policy implications, which shows strong understanding of the topic.`;

function buildDocxBlob(content) {
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" mc:Ignorable="w14 w15 wp14">
      <w:body>
        <w:p><w:r><w:t>${content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</w:t></w:r></w:p>
        <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>
      </w:body>
    </w:document>`;

  return new Blob([xml], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

export default function AssessmentWorkbench() {
  const [darkMode, setDarkMode] = useState(true);
  const [rubric, setRubric] = useState(initialRubric);
  const [history, setHistory] = useState([]);
  const [batchFiles, setBatchFiles] = useState([]);

  useEffect(() => {
    const saved = localStorage.getItem('ai-grader-history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (error) {
        console.error('Failed to parse history', error);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('ai-grader-history', JSON.stringify(history));
  }, [history]);

  const totalWeight = useMemo(() => rubric.reduce((sum, item) => sum + Number(item.weight || 0), 0), [rubric]);

  const updateRubricRow = (id, field, value) => {
    setRubric((current) => current.map((item) => item.id === id ? { ...item, [field]: value } : item));
  };

  const addCriterion = () => {
    setRubric((current) => [...current, { id: Date.now(), name: `Criterion ${current.length + 1}`, weight: 0 }]);
  };

  const removeCriterion = (id) => {
    setRubric((current) => current.filter((item) => item.id !== id));
  };

  const saveSnapshot = () => {
    const entry = {
      student_name: 'New cohort sample',
      assignment_id: `A-${Date.now()}`,
      score: 86.4,
      grade: 'A',
      section: 'History',
      summary: 'Strong evidence and coherent argument; refine referencing depth.',
      created_at: new Date().toISOString(),
    };
    setHistory((current) => [entry, ...current].slice(0, 6));
  };

  const exportJson = () => {
    const payload = JSON.stringify({ rubric, exportedAt: new Date().toISOString(), totalWeight, history }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'ai-grader-report.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportDocx = () => {
    const content = `AI Grader Report\n\nRubric summary:\n${rubric.map((item) => `${item.name}: ${item.weight}%`).join('\n')}\n\nTotal weighting: ${totalWeight}%`;
    const blob = buildDocxBlob(content);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'ai-grader-report.docx';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const palette = darkMode
    ? {
        page: 'linear-gradient(135deg, #0b1020 0%, #111827 100%)',
        panel: 'rgba(15,23,42,0.72)',
        panelBorder: 'rgba(148,163,184,0.18)',
        text: '#e5eefb',
        muted: '#94a3b8',
        soft: '#cbd5e1',
        button: 'rgba(15,23,42,0.9)',
      }
    : {
        page: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
        panel: 'rgba(255,255,255,0.9)',
        panelBorder: 'rgba(148,163,184,0.28)',
        text: '#0f172a',
        muted: '#475569',
        soft: '#334155',
        button: '#ffffff',
      };

  return (
    <div style={{ minHeight: '100vh', background: palette.page, color: palette.text, fontFamily: 'Inter, system-ui, sans-serif', padding: 24 }}>
      <div style={{ maxWidth: 1380, margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#93c5fd' }}>Academic grading workspace</div>
            <h1 style={{ margin: '10px 0 0', fontSize: 34, fontWeight: 700 }}>Assessment Hub</h1>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              onClick={() => setDarkMode((current) => !current)}
              style={{
                border: `1px solid ${palette.panelBorder}`,
                background: palette.button,
                color: palette.text,
                borderRadius: 12,
                padding: '10px 14px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {darkMode ? 'Light mode' : 'Dark mode'}
            </button>
            <button style={{ border: `1px solid ${palette.panelBorder}`, background: palette.button, color: palette.text, borderRadius: 12, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' }}>
              Export cohort report
            </button>
          </div>
        </header>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 18, marginBottom: 22 }}>
          {[
            { label: 'Submissions', value: '1,284', delta: '+12.4%' },
            { label: 'Average score', value: '84.7%', delta: '+3.1%' },
            { label: 'Flagged', value: '41', delta: '-8.2%' },
            { label: 'Rubrics', value: '14', delta: '+2' },
          ].map((card) => (
            <div key={card.label} style={{ background: palette.panel, border: `1px solid ${palette.panelBorder}`, borderRadius: 18, padding: 20 }}>
              <div style={{ color: palette.muted, fontSize: 13 }}>{card.label}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14 }}>
                <strong style={{ fontSize: 28 }}>{card.value}</strong>
                <span style={{ color: '#34d399', fontSize: 12, fontWeight: 700 }}>{card.delta}</span>
              </div>
            </div>
          ))}
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20, marginBottom: 22 }}>
          <div style={{ background: palette.panel, border: `1px solid ${palette.panelBorder}`, borderRadius: 18, padding: 22 }}>
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
                  <span style={{ marginTop: 10, color: palette.soft, fontSize: 12 }}>{band.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: palette.panel, border: `1px solid ${palette.panelBorder}`, borderRadius: 18, padding: 22 }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 20 }}>Batch upload</h2>
            <label style={{ display: 'block', border: `1px dashed ${palette.panelBorder}`, borderRadius: 16, background: 'rgba(15,23,42,0.12)', minHeight: 180, padding: 18, cursor: 'pointer' }}>
              <input
                type="file"
                multiple
                onChange={(event) => setBatchFiles(Array.from(event.target.files || []))}
                style={{ display: 'none' }}
              />
              <div style={{ color: palette.soft, fontWeight: 600, marginBottom: 12 }}>Drop files here or click to upload</div>
              <div style={{ color: palette.muted, fontSize: 13 }}>PDF • DOCX • TXT • ZIP batch</div>
              <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {batchFiles.length ? batchFiles.slice(0, 4).map((file) => (
                  <span key={file.name} style={{ background: 'rgba(96,165,250,0.14)', border: '1px solid rgba(96,165,250,0.28)', color: '#bfdbfe', fontSize: 12, borderRadius: 999, padding: '6px 10px' }}>{file.name}</span>
                )) : <span style={{ color: '#64748b', fontSize: 12 }}>No files selected</span>}
              </div>
            </label>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18, gap: 12 }}>
              <button style={{ flex: 1, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 12, padding: '11px 14px', fontWeight: 700, cursor: 'pointer' }}>Queue batch</button>
              <button style={{ flex: 1, background: palette.button, color: palette.text, border: `1px solid ${palette.panelBorder}`, borderRadius: 12, padding: '11px 14px', fontWeight: 600, cursor: 'pointer' }}>Schedule</button>
            </div>
          </div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', gap: 20 }}>
          <div style={{ background: palette.panel, border: `1px solid ${palette.panelBorder}`, borderRadius: 18, padding: 22 }}>
            <h2 style={{ margin: '0 0 18px', fontSize: 20 }}>Recent grading runs</h2>
            <div style={{ display: 'grid', gap: 12 }}>
              {defaultRuns.map((run) => (
                <div key={run.id} style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.7fr 0.7fr 0.5fr', alignItems: 'center', background: 'rgba(15,23,42,0.08)', border: `1px solid ${palette.panelBorder}`, borderRadius: 12, padding: '12px 14px' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{run.student}</div>
                    <div style={{ color: palette.muted, fontSize: 12 }}>{run.id}</div>
                  </div>
                  <div style={{ color: palette.text, fontWeight: 600 }}>{run.score}%</div>
                  <div style={{ color: run.status === 'Completed' ? '#34d399' : run.status === 'Review' ? '#fbbf24' : '#93c5fd', fontWeight: 600 }}>{run.status}</div>
                  <div style={{ color: palette.muted, fontSize: 12, textAlign: 'right' }}>{run.slot}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: palette.panel, border: `1px solid ${palette.panelBorder}`, borderRadius: 18, padding: 22 }}>
            <h2 style={{ margin: '0 0 18px', fontSize: 20 }}>Side-by-side review</h2>
            <div style={{ border: `1px solid ${palette.panelBorder}`, borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                <div style={{ background: 'rgba(15,23,42,0.08)', padding: 14, borderRight: `1px solid ${palette.panelBorder}` }}>
                  <div style={{ fontSize: 12, color: '#93c5fd', marginBottom: 10 }}>Submission excerpt</div>
                  <div style={{ color: palette.text, lineHeight: 1.7, fontSize: 14 }}>{reviewSample}</div>
                </div>
                <div style={{ background: 'rgba(15,23,42,0.08)', padding: 14 }}>
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

        <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 22 }}>
          <div style={{ background: palette.panel, border: `1px solid ${palette.panelBorder}`, borderRadius: 18, padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 20 }}>Rubric builder</h2>
              <button onClick={addCriterion} style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 12px', cursor: 'pointer' }}>Add criterion</button>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              {rubric.map((criterion) => (
                <div key={criterion.id} style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.6fr auto', gap: 10, alignItems: 'center' }}>
                  <input
                    value={criterion.name}
                    onChange={(event) => updateRubricRow(criterion.id, 'name', event.target.value)}
                    style={{ background: palette.button, color: palette.text, border: `1px solid ${palette.panelBorder}`, borderRadius: 10, padding: '10px 12px' }}
                  />
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={criterion.weight}
                    onChange={(event) => updateRubricRow(criterion.id, 'weight', Number(event.target.value))}
                    style={{ background: palette.button, color: palette.text, border: `1px solid ${palette.panelBorder}`, borderRadius: 10, padding: '10px 12px' }}
                  />
                  <button onClick={() => removeCriterion(criterion.id)} style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.28)', borderRadius: 10, padding: '10px 12px', cursor: 'pointer' }}>Remove</button>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 14, color: palette.muted, fontSize: 13 }}>Total weighting: {totalWeight}%</div>
          </div>

          <div style={{ background: palette.panel, border: `1px solid ${palette.panelBorder}`, borderRadius: 18, padding: 22 }}>
            <h2 style={{ margin: '0 0 18px', fontSize: 20 }}>Export & history</h2>
            <div style={{ display: 'grid', gap: 12 }}>
              <button onClick={exportJson} style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 12, padding: '11px 14px', fontWeight: 700, cursor: 'pointer' }}>Download JSON report</button>
              <button onClick={exportDocx} style={{ background: palette.button, color: palette.text, border: `1px solid ${palette.panelBorder}`, borderRadius: 12, padding: '11px 14px', fontWeight: 600, cursor: 'pointer' }}>Download DOCX report</button>
              <button onClick={saveSnapshot} style={{ background: 'rgba(16,185,129,0.12)', color: '#34d399', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 12, padding: '11px 14px', fontWeight: 600, cursor: 'pointer' }}>Save cohort snapshot</button>
            </div>

            <div style={{ marginTop: 20, display: 'grid', gap: 8 }}>
              {(history.length ? history : [{ student_name: 'Sample student', grade: 'A', score: 86, assignment_id: 'HIST-001', summary: 'Strong overall performance and clear evidence.' }]).map((item, index) => (
                <div key={`${item.assignment_id}-${index}`} style={{ background: 'rgba(15,23,42,0.08)', border: `1px solid ${palette.panelBorder}`, borderRadius: 12, padding: '10px 12px' }}>
                  <div style={{ fontWeight: 700 }}>{item.student_name}</div>
                  <div style={{ color: palette.muted, fontSize: 12 }}>{item.assignment_id} • {item.grade} • {item.score}%</div>
                  <div style={{ color: palette.soft, fontSize: 13, marginTop: 6 }}>{item.summary}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
