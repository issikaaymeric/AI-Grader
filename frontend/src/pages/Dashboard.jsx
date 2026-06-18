import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import { useAssignmentStore } from '../store/assignmentStore';

const ACCEPTED_TYPES = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'text/plain': ['.txt'],
};

const SUBJECTS = [
  'Computer Science', 'Literature', 'History', 'Biology',
  'Economics', 'Philosophy', 'Psychology', 'Engineering',
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { submitAssignment, uploading, uploadError, status } = useAssignmentStore();

  const [file, setFile] = useState(null);
  const [subject, setSubject] = useState('');
  const [gradingSystem, setGradingSystem] = useState('US');

  const onDrop = useCallback((accepted) => {
    if (accepted.length > 0) setFile(accepted[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxFiles: 1,
    maxSize: 20 * 1024 * 1024,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file || !subject) return;
    await submitAssignment(file, subject, gradingSystem, null);
    navigate('/results');
  };

  const isProcessing = uploading || status === 'pending' || status === 'processing';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-lg p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">AI Grader</h1>
          <p className="text-gray-500 mt-1">
            Upload an assignment and receive evidence-based feedback in seconds.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Dropzone */}
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
              ${isDragActive ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50'}
              ${file ? 'border-green-400 bg-green-50' : ''}`}
          >
            <input {...getInputProps()} />
            {file ? (
              <div className="space-y-1">
                <DocumentIcon className="mx-auto text-green-500" />
                <p className="font-medium text-green-700">{file.name}</p>
                <p className="text-sm text-gray-500">
                  {(file.size / 1024).toFixed(1)} KB — click or drag to replace
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <UploadIcon className="mx-auto text-gray-400" />
                <p className="text-gray-600 font-medium">
                  {isDragActive ? 'Drop your file here' : 'Drag & drop or click to upload'}
                </p>
                <p className="text-sm text-gray-400">PDF, DOCX, TXT — max 20 MB</p>
              </div>
            )}
          </div>

          {fileRejections.length > 0 && (
            <p className="text-sm text-red-600">
              {fileRejections[0].errors[0].message}
            </p>
          )}

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900
                         focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Select a subject…</option>
              {SUBJECTS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Grading System Toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Grading System</label>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden">
              {['US', 'UK'].map((sys) => (
                <button
                  key={sys}
                  type="button"
                  onClick={() => setGradingSystem(sys)}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors
                    ${gradingSystem === sys
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  {sys === 'US' ? '🇺🇸 American (A–F)' : '🇬🇧 British (1st–3rd)'}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {gradingSystem === 'US'
                ? 'Additive: points awarded for meeting criteria.'
                : 'Deductive: starts at 100, deductions for gaps.'}
            </p>
          </div>

          {/* Error */}
          {uploadError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {uploadError}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!file || !subject || isProcessing}
            className="w-full py-3 px-6 rounded-xl bg-indigo-600 text-white font-semibold
                       hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <>
                <Spinner />
                {status === 'processing' ? 'Grading…' : 'Uploading…'}
              </>
            ) : (
              'Grade Assignment'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Inline SVG icons (no extra dependency) ──────────────────────────────────

function UploadIcon({ className }) {
  return (
    <svg className={`w-10 h-10 mx-auto ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  );
}

function DocumentIcon({ className }) {
  return (
    <svg className={`w-10 h-10 mx-auto ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
