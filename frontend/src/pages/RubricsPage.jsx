import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../store/authStore';

const initialDimensions = [
  { name: 'Understanding', description: 'Accuracy and depth of understanding', weight: '0.35' },
  { name: 'Analysis', description: 'Quality of reasoning and critical analysis', weight: '0.30' },
  { name: 'Evidence', description: 'Use of relevant evidence and examples', weight: '0.20' },
  { name: 'Structure', description: 'Organization, clarity, and presentation', weight: '0.15' },
];

const styles = {
  page: { maxWidth: 1120, margin: '0 auto', padding: '32px 24px', color: '#172033' },
  heading: { margin: '8px 0', fontSize: 30 },
  muted: { color: '#64748b', fontSize: 13 },
  panel: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 22, marginBottom: 20 },
  label: { display: 'grid', gap: 6, fontWeight: 650, fontSize: 13 },
  input: { width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: 9, font: 'inherit' },
  button: { border: 0, borderRadius: 9, padding: '10px 14px', background: '#6d28d9', color: '#fff', fontWeight: 700, cursor: 'pointer' },
  secondary: { border: '1px solid #cbd5e1', borderRadius: 9, padding: '9px 12px', background: '#fff', fontWeight: 650, cursor: 'pointer' },
  error: { color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: 12, marginBottom: 16 },
  grid: { display: 'grid', gridTemplateColumns: 'minmax(140px, 0.8fr) minmax(200px, 2fr) 100px 44px', gap: 10, alignItems: 'start' },
};

export default function RubricsPage() {
  const [rubrics, setRubrics] = useState([]);
  const [name, setName] = useState('');
  const [mode, setMode] = useState('additive');
  const [dimensions, setDimensions] = useState(initialDimensions);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const totalWeight = useMemo(
    () => dimensions.reduce((sum, dimension) => sum + (Number(dimension.weight) || 0), 0),
    [dimensions],
  );

  const loadRubrics = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/api/rubrics/');
      const body = await response.json().catch(() => []);
      if (!response.ok) throw new Error(body.detail || 'Could not load rubrics.');
      setRubrics(Array.isArray(body) ? body : []);
    } catch (err) {
      setError(err.message || 'Could not load rubrics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRubrics(); }, [loadRubrics]);

  function updateDimension(index, field, value) {
    setDimensions((current) => current.map((dimension, i) => (
      i === index ? { ...dimension, [field]: value } : dimension
    )));
  }

  function addDimension() {
    setDimensions((current) => [...current, {
      name: '',
      description: '',
      weight: '',
    }]);
  }

  function removeDimension(index) {
    setDimensions((current) => current.filter((_, i) => i !== index));
  }

  async function submitRubric(event) {
    event.preventDefault();
    setError('');
    setNotice('');

    const trimmedName = name.trim();
    if (!trimmedName) return setError('Enter a name for this rubric.');
    if (dimensions.length < 1) return setError('Add at least one criterion.');
    if (dimensions.some((d) => !d.name.trim() || !d.description.trim() || !(Number(d.weight) > 0))) {
      return setError('Every criterion needs a name, description, and positive weight.');
    }
    if (Math.abs(totalWeight - 1) > 0.01) {
      return setError('Criterion weights must total 1.00 (100%). Current total: ' + totalWeight.toFixed(2) + '.');
    }

    const payload = {
      name: trimmedName,
      grading_mode: mode,
      dimensions: Object.fromEntries(dimensions.map((d) => [
        d.name.trim(),
        { description: d.description.trim(), weight: Number(d.weight) },
      ])),
    };

    if (Object.keys(payload.dimensions).length !== dimensions.length) {
      return setError('Criterion names must be unique.');
    }

    setSaving(true);
    try {
      const response = await apiFetch('/api/rubrics/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail || 'Could not save rubric.');
      setName('');
      setMode('additive');
      setDimensions(initialDimensions);
      setNotice('Rubric saved successfully.');
      await loadRubrics();
    } catch (err) {
      setError(err.message || 'Could not save rubric.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.page}>
      <p style={{ ...styles.muted, letterSpacing: '0.12em', fontWeight: 800 }}>ASSESSMENT SETTINGS</p>
      <h1 style={styles.heading}>Custom rubrics</h1>
      <p style={styles.muted}>Build reusable grading criteria. Weights must add up to 100%.</p>

      {error ? <div role="alert" style={styles.error}>{error}</div> : null}
      {notice ? <div role="status" style={{ ...styles.error, color: '#166534', background: '#f0fdf4', borderColor: '#bbf7d0' }}>{notice}</div> : null}

      <section style={styles.panel}>
        <h2 style={{ marginTop: 0 }}>Create a rubric</h2>
        <form onSubmit={submitRubric}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 2fr) minmax(160px, 1fr)', gap: 14, marginBottom: 20 }}>
            <label style={styles.label}>
              Rubric name
              <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Research essay rubric" />
            </label>
            <label style={styles.label}>
              Grading mode
              <select style={styles.input} value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="additive">Additive (award points)</option>
                <option value="deductive">Deductive (deduct points)</option>
              </select>
            </label>
          </div>

          <div style={{ ...styles.grid, fontSize: 12, color: '#64748b', fontWeight: 800, marginBottom: 8 }}>
            <span>Criterion</span><span>Description</span><span>Weight</span><span />
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {dimensions.map((dimension, index) => (
              <div key={index} style={styles.grid}>
                <input aria-label={'Criterion ' + (index + 1) + ' name'} style={styles.input} value={dimension.name} onChange={(e) => updateDimension(index, 'name', e.target.value)} placeholder="Analysis" maxLength={60} />
                <input aria-label={'Criterion ' + (index + 1) + ' description'} style={styles.input} value={dimension.description} onChange={(e) => updateDimension(index, 'description', e.target.value)} placeholder="What strong work demonstrates" maxLength={500} />
                <input aria-label={'Criterion ' + (index + 1) + ' weight'} style={styles.input} type="number" min="0.01" max="1" step="0.01" value={dimension.weight} onChange={(e) => updateDimension(index, 'weight', e.target.value)} />
                <button type="button" style={styles.secondary} onClick={() => removeDimension(index)} aria-label={'Remove criterion ' + (index + 1)}>×</button>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 18 }}>
            <button type="button" style={styles.secondary} onClick={addDimension}>+ Add criterion</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <strong style={{ color: Math.abs(totalWeight - 1) <= 0.01 ? '#166534' : '#b45309' }}>Total weight: {(totalWeight * 100).toFixed(0)}%</strong>
              <button type="submit" style={styles.button} disabled={saving}>{saving ? 'Saving…' : 'Save rubric'}</button>
            </div>
          </div>
        </form>
      </section>

      <section style={styles.panel}>
        <h2 style={{ marginTop: 0 }}>Saved rubrics</h2>
        {loading ? <p role="status">Loading rubrics…</p> : null}
        {!loading && rubrics.length === 0 ? <p style={styles.muted}>No rubrics found yet. Create your first rubric above.</p> : null}
        {!loading && rubrics.length > 0 ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {rubrics.map((rubric) => (
              <div key={rubric.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
                <div>
                  <strong>{rubric.name}</strong>
                  <div style={styles.muted}>{rubric.grading_mode || 'additive'} grading</div>
                </div>
                <span style={{ ...styles.muted, fontWeight: 700 }}>Saved</span>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
