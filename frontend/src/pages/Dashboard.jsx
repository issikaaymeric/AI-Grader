import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import { useAssignmentStore } from '../store/assignmentStore';

const ACCEPTED_TYPES = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'text/plain': ['.txt'],
};

const SUBJECTS = [
  "Basic Issues in Philosophy",
  "Understanding Business Organizations",
  "Discrete Mathematics",
  "Financing and Investing Activities",
  "Foundations in Finance",
  "Human Geography",
  "Introduction to Sociology",
  "Essentials of Management",
  "Macroeconomics",
  "Contemporary Short Story",
  "World History",
  "Writing in the Disciplines",
  "World Religions",
  "Information System and Organisations",
  "Financial Management",
  "The Economics of Discrimination and Poverty",
  "Accounting for Business Operations",
  "Business Ethics",
  "Business Math",
  "Business Statistics",
  "Principles of Business Operations",
  "Introduction to Computer Science",
  "Introduction to Databases",
  "Microeconomics",
  "Microsoft Essential Solutions",
  "Organizational Communication",
  "Interpersonal Communication",
  "Earth Sciences",
  "International Trade",
  "Ecommerce / E-Commerce (eBusiness)",
  "International Finance",
  "Calculus I",
  "Calculus II",
  "Introduction to Networking",
  "Data Analysis and Visualisation with Python",
  "Introduction to Programming",
  "Front End Development",
  "Data Science and Big Data",
  "IT Project Management",
  "Mobile End Development",
  "Network Security and Cryptography",
  "Agile Development",
  "Back End Development",
];

const MAX_INSTRUCTIONS_CHARS = 5000 * 2;
const MAX_SUBJECT_CHARS = 100;
const MAX_SUBMISSION_BYTES = 20 * 1024 * 1024;
const MAX_BRIEF_BYTES = 5 * 1024 * 1024;

export default function Dashboard() {
  const navigate = useNavigate();
  const { submitAssignment, uploading, uploadError, status } = useAssignmentStore();

  const [file, setFile] = useState(null);
  const [subject, setSubject] = useState('');
  const [gradingSystem, setGradingSystem] = useState('US');
  const [instructions, setInstructions] = useState('');
  const [instructionsFile, setInstructionsFile] = useState(null);

  const onDrop = useCallback((accepted) => {
    if (accepted.length > 0) setFile(accepted[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxFiles: 1,
    maxSize: MAX_SUBMISSION_BYTES,
  });

  const onBriefDrop = useCallback((accepted) => {
    if (accepted.length > 0) setInstructionsFile(accepted[0]);
  }, []);

  const {
    getRootProps: getBriefRootProps,
    getInputProps: getBriefInputProps,
    isDragActive: isBriefDragActive,
    fileRejections: briefRejections,
  } = useDropzone({
    onDrop: onBriefDrop,
    accept: ACCEPTED_TYPES,
    maxFiles: 1,
    maxSize: MAX_BRIEF_BYTES,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedSubject = subject.trim();
    if (!file || !trimmedSubject) return;
    const result = await submitAssignment(
      file,
      trimmedSubject,
      gradingSystem,
      null,                        // rubricId
      instructions.trim() || null, // optional typed assignment brief
      instructionsFile             // optional attached assignment brief
    );
    if (result?.ok) navigate('/results');
  };

  const isProcessing = uploading || status === 'pending' || status === 'processing';
  const instructionsOverLimit = instructions.length > MAX_INSTRUCTIONS_CHARS;
  const trimmedSubject = subject.trim();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-lg p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">MindMark</h1>
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

          {/* Assignment Instructions */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">
                Assignment Instructions <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <span className={`text-xs ${instructionsOverLimit ? 'text-red-500' : 'text-gray-400'}`}>
                {instructions.length}/{MAX_INSTRUCTIONS_CHARS}
              </span>
            </div>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Paste the assignment brief or prompt here so the grader evaluates against what was actually asked (e.g. 'Write a 1500-word essay comparing Keynesian and Austrian responses to the 2008 crisis, citing at least 3 peer-reviewed sources')."
              rows={4}
              maxLength={MAX_INSTRUCTIONS_CHARS + 200}
              className={`w-full rounded-lg border px-4 py-2.5 text-gray-900 text-sm resize-y
                         focus:outline-none focus:ring-2 focus:ring-indigo-500
                         ${instructionsOverLimit ? 'border-red-300' : 'border-gray-300'}`}
            />

            {/* Brief as a file */}
            {instructionsFile ? (
              <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border
                              border-green-300 bg-green-50 px-4 py-2.5 text-sm">
                <span className="truncate text-green-700">
                  📎 {instructionsFile.name}{' '}
                  <span className="text-gray-500">({(instructionsFile.size / 1024).toFixed(1)} KB)</span>
                </span>
                <button
                  type="button"
                  onClick={() => setInstructionsFile(null)}
                  className="shrink-0 text-xs font-medium text-red-600 hover:text-red-800"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div
                {...getBriefRootProps()}
                className={`mt-2 rounded-lg border border-dashed px-4 py-2.5 text-sm cursor-pointer transition-colors
                  ${isBriefDragActive
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-gray-300 text-gray-500 hover:border-indigo-400 hover:bg-gray-50'}`}
              >
                <input {...getBriefInputProps()} />
                📎 {isBriefDragActive
                  ? 'Drop the brief here'
                  : 'Or attach the brief as a file — PDF, DOCX, TXT (max 5 MB)'}
              </div>
            )}

            {briefRejections.length > 0 && (
              <p className="text-sm text-red-600 mt-1">
                {briefRejections[0].errors[0].message}
              </p>
            )}

            <p className="text-xs text-gray-400 mt-1">
              {instructions || instructionsFile
                ? 'If you provide both, the typed text and the file contents are combined.'
                : 'Leave blank to grade generally against the subject and rubric only.'}
            </p>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
            <SubjectCombobox
              subjects={SUBJECTS}
              value={subject}
              onChange={setSubject}
              maxLength={MAX_SUBJECT_CHARS}
            />
            <p className="text-xs text-gray-400 mt-1">
              Don't see your subject? Type it and pick "Use as custom subject" — it'll still be graded against a sensible default rubric.
            </p>
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
            disabled={!file || !trimmedSubject || isProcessing || instructionsOverLimit}
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

// ── Searchable subject combobox (list + free text) ──────────────────────────
//
// Controlled by `value`/`onChange` like a plain input. Renders a filtered
// dropdown of `subjects`; if the current text doesn't exactly match an entry
// (case-insensitive), an extra "Use '<text>' as custom subject" row lets the
// user commit an arbitrary subject name. Selecting a row (click or Enter)
// commits `value` and closes the dropdown; blurring outside the component
// also closes it without discarding what was typed.
function SubjectCombobox({ subjects, value, onChange, maxLength = 100 }) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef(null);
  const listRef = useRef(null);

  const query = value.trim();
  const normalizedQuery = query.toLowerCase();

  const filteredSubjects = useMemo(() => {
    if (!normalizedQuery) return subjects;
    return subjects.filter((s) => s.toLowerCase().includes(normalizedQuery));
  }, [subjects, normalizedQuery]);

  const hasExactMatch = subjects.some((s) => s.toLowerCase() === normalizedQuery);
  const showCustomOption = query.length > 0 && !hasExactMatch;

  // Combined, indexable list of rows: subjects first, then the custom-entry row.
  const rows = showCustomOption
    ? [...filteredSubjects, { custom: true, value: query }]
    : filteredSubjects;

  useEffect(() => {
    setHighlightedIndex(0);
  }, [normalizedQuery, isOpen]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const commit = (val) => {
    onChange(val);
    setIsOpen(false);
  };

  const handleKeyDown = (e) => {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setIsOpen(true);
      return;
    }
    if (!isOpen) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((i) => Math.min(i + 1, rows.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter': {
        e.preventDefault();
        const row = rows[highlightedIndex];
        if (row) commit(typeof row === 'string' ? row : row.value);
        break;
      }
      case 'Escape':
        setIsOpen(false);
        break;
      default:
        break;
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        value={value}
        maxLength={maxLength}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Search or type a subject…"
        required
        className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900
                   focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />

      {isOpen && rows.length > 0 && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute z-10 mt-1 w-full max-h-64 overflow-auto rounded-lg
                     border border-gray-200 bg-white shadow-lg py-1"
        >
          {rows.map((row, index) => {
            const isCustom = typeof row !== 'string';
            const label = isCustom ? row.value : row;
            const isHighlighted = index === highlightedIndex;
            return (
              <li
                key={isCustom ? `__custom__${label}` : label}
                role="option"
                aria-selected={isHighlighted}
                onMouseDown={(e) => {
                  // onMouseDown (not onClick) so this fires before the input's onBlur.
                  e.preventDefault();
                  commit(label);
                }}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`px-4 py-2 text-sm cursor-pointer flex items-center gap-2
                  ${isHighlighted ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700'}`}
              >
                {isCustom ? (
                  <>
                    <PlusIcon className="text-indigo-500 shrink-0" />
                    <span>
                      Use <span className="font-medium">"{label}"</span> as custom subject
                    </span>
                  </>
                ) : (
                  label
                )}
              </li>
            );
          })}
        </ul>
      )}

      {isOpen && rows.length === 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200
                        bg-white shadow-lg py-3 px-4 text-sm text-gray-400">
          No matches — keep typing to add a custom subject.
        </div>
      )}
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

function PlusIcon({ className }) {
  return (
    <svg className={`w-4 h-4 ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
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
