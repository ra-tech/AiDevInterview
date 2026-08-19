import { useRef, useState } from 'react';
import { api } from '../../api/client.js';

export function UploadOrPasteField({ value, onChange, placeholder, rows = 8 }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState(null);
  const [error, setError] = useState(null);

  async function handleFile(file) {
    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const { text } = await api.postForm('/api/uploads/extract-text', formData);
      onChange(text);
      setFileName(file.name);
    } catch (err) {
      setError(err.message || 'Could not read this file.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1 text-xs text-white/60 hover:bg-white/5 disabled:opacity-50"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3v12m0-12l-4 4m4-4l4 4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
          </svg>
          {uploading ? 'Reading file…' : 'Upload PDF, DOCX, or TXT'}
        </button>
        {fileName && !uploading && <span className="text-xs text-white/40">Loaded: {fileName}</span>}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />
      </div>

      {error && <p className="mb-2 text-xs text-red-400">{error}</p>}

      <textarea
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setFileName(null);
        }}
        rows={rows}
        placeholder={placeholder}
        className="w-full resize-none rounded-lg border border-white/10 bg-white/5 p-3 text-sm outline-none focus:border-brand-500"
      />
    </div>
  );
}
