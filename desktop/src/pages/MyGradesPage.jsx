import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAssignmentStore } from '../store/assignmentStore';
import { useAuthStore } from '../store/authStore';

const PAGE_SIZE = 10;

const US_COLORS = { A: 'green', B: 'blue', C: 'yellow', D: 'orange', F: 'red' };
const UK_COLORS = {
  'First Class': 'green', '2:1': 'blue', '2:2': 'yellow',
  'Third Class': 'orange', Fail: 'red',
};

const COLOR_CLASSES = {
  green:  { bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500' },
  blue:   { bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-500' },
  yellow: { bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  orange: { bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
  red:    { bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500' },
  gray:   { bg: 'bg-gray-100',   text: 'text-gray-600',   dot: 'bg-gray-400' },
};

function gradeColor(grade, system) {
  if (!grade) return COLOR_CLASSES.gray;
  const map = system === 'US' ? US_COLORS : UK_COLORS;
  return COLOR_CLASSES[map[grade] ?? 'gray'];
}

const STATUS_LABEL = {
  pending:    { text: 'Queued',   color: COLOR_CLASSES.gray },
  processing: { text: 'Grading…', color: COLOR_CLASSES.blue },
  done:       { text: 'Done',     color: COLOR_CLASSES.green },
  error:      { text: 'Failed',   color: COLOR_CLASSES.red },
};

const STATUS_FILTERS = [
  { value: null,         label: 'All' },
  { value: 'done',       label: 'Graded' },
  { value: 'pending',    label: 'Queued' },
  { value: 'processing', label: 'Grading' },
  { value: 'error',      label: 'Failed' },
];

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function TrashIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

export default function MyGradesPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    history, historyTotal, historyLoading, historyError,
    fetchHistory, loadAssignment, deleteAssignment,
  } = useAssignmentStore();

  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState(null);
  const [confirmingDelete, setConfirmingDelete] = useState(null); // holds assignment id

  useEffect(() => {
    fetchHistory({ limit: PAGE_SIZE, offset: page * PAGE_SIZE, statusFilter });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(historyTotal / PAGE_SIZE)),
    [historyTotal]
  );

  const handleOpen = async (assignmentId) => {
    await loadAssignment(assignmentId);
    navigate('/results');
  };

  const handleDelete = async (assignmentId) => {
    setConfirmingDelete(null);
    await deleteAssignment(assignmentId);
  };

  const isProfessor = user?.role === 'professor' || user?.role === 'admin';

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isProfessor ? 'All Submissions' : 'My Grades'}
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              {historyTotal} {historyTotal === 1 ? 'assignment' : 'assignments'} total
            </p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="text-sm font-medium px-4 py-2 rounded-lg bg-indigo-600 text-white
                       hover:bg-indigo-700 transition-colors w-fit"
          >
            + New Submission
          </button>
        </div>

        {/* Status filter pills */}
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map(({ value, label }) => (
            <button
              key={label}
              onClick={() => { setStatusFilter(value); setPage(0); }}
              className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors
                ${statusFilter === value
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Error */}
        {historyError && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {historyError}
          </div>
        )}

        {/* Loading skeleton */}
        {historyLoading && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-1/4" />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!historyLoading && history.length === 0 && !historyError && (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-gray-700 font-medium">No assignments yet</p>
            <p className="text-gray-400 text-sm mt-1">
              Submit your first assignment to see results here.
            </p>
            <button
              onClick={() => navigate('/')}
              className="mt-4 text-sm font-medium px-4 py-2 rounded-lg bg-indigo-600 text-white
                         hover:bg-indigo-700 transition-colors"
            >
              Grade an Assignment
            </button>
          </div>
        )}

        {/* List */}
        {!historyLoading && history.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-100 overflow-hidden">
            {history.map((item) => {
              const isDone = item.status === 'done';
              const gColors = gradeColor(item.grade, item.grading_system);
              const sInfo = STATUS_LABEL[item.status] ?? STATUS_LABEL.pending;
              const isConfirming = confirmingDelete === item.id;

              if (isConfirming) {
                return (
                  <div
                    key={item.id}
                    className="w-full px-5 py-4 flex items-center justify-between gap-4 bg-red-50"
                  >
                    <p className="text-sm font-medium text-red-800 truncate">
                      Delete <span className="font-semibold">{item.subject}</span>? This can't be undone.
                    </p>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-600 text-white
                                   hover:bg-red-700 transition-colors"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setConfirmingDelete(null)}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200
                                   text-gray-600 hover:border-gray-300 transition-colors bg-white"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div key={item.id} className="flex items-center group">
                  <button
                    onClick={() => handleOpen(item.id)}
                    disabled={item.status === 'error'}
                    className="flex-1 text-left px-5 py-4 flex items-center justify-between gap-4
                               hover:bg-gray-50 transition-colors disabled:opacity-60
                               disabled:cursor-not-allowed disabled:hover:bg-white"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900 truncate">{item.subject}</p>
                        {item.flagged_for_review && (
                          <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5
                                           rounded bg-amber-100 text-amber-700">
                            REVIEW
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-400">
                          {item.grading_system} System
                        </span>
                        <span className="text-gray-300">·</span>
                        <span className="text-xs text-gray-400">
                          {formatDate(item.created_at)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {isDone && item.grade ? (
                        <span className={`text-sm font-bold px-3 py-1 rounded-full ${gColors.bg} ${gColors.text}`}>
                          {item.grade}
                        </span>
                      ) : (
                        <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${sInfo.color.bg} ${sInfo.color.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${sInfo.color.dot} ${item.status === 'processing' ? 'animate-pulse' : ''}`} />
                          {sInfo.text}
                        </span>
                      )}
                      <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>

                  {/* Trash button — revealed on hover */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmingDelete(item.id); }}
                    className="shrink-0 mr-3 p-2 rounded-lg text-gray-300 hover:text-red-500
                               hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                    aria-label="Delete submission"
                  >
                    <TrashIcon />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {!historyLoading && historyTotal > PAGE_SIZE && (
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="text-sm font-medium text-gray-600 disabled:text-gray-300 disabled:cursor-not-allowed
                         hover:text-gray-900 transition-colors px-3 py-1.5"
            >
              ← Previous
            </button>
            <span className="text-sm text-gray-400">
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="text-sm font-medium text-gray-600 disabled:text-gray-300 disabled:cursor-not-allowed
                         hover:text-gray-900 transition-colors px-3 py-1.5"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}