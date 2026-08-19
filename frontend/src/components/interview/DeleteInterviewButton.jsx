import { useState } from 'react';
import { api } from '../../api/client.js';

export function DeleteInterviewButton({ interviewId, onDeleted }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(e) {
    e.preventDefault();
    e.stopPropagation();

    if (!confirming) {
      setConfirming(true);
      return;
    }

    setDeleting(true);
    try {
      await api.delete(`/api/interviews/${interviewId}`);
      onDeleted?.(interviewId);
    } catch {
      setDeleting(false);
      setConfirming(false);
    }
  }

  function handleCancel(e) {
    e.preventDefault();
    e.stopPropagation();
    setConfirming(false);
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5" onClick={(e) => e.preventDefault()}>
        <span className="text-xs text-white/50">Delete permanently?</span>
        <button onClick={handleDelete} disabled={deleting} className="rounded-md bg-red-500/20 px-2 py-1 text-xs font-medium text-red-300 hover:bg-red-500/30 disabled:opacity-50">
          {deleting ? 'Deleting…' : 'Confirm'}
        </button>
        <button onClick={handleCancel} className="rounded-md px-2 py-1 text-xs text-white/50 hover:text-white/80">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button onClick={handleDelete} className="rounded-md p-1.5 text-white/30 hover:bg-red-500/10 hover:text-red-400" title="Delete interview" aria-label="Delete interview">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
      </svg>
    </button>
  );
}
