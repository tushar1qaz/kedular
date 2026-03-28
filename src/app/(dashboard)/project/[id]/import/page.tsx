'use client';

import { useState, useRef, use } from 'react';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ImportPage({ params }: PageProps) {
  const { id } = use(params);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    const allowed = ['.xer', '.csv', '.xml'];
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    if (!allowed.includes(ext)) {
      setUploadResult({ success: false, message: `Unsupported file type: ${ext}. Please upload .xer, .csv, or .xml files.` });
      return;
    }

    setUploading(true);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('projectId', id);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');
      setUploadResult({ success: true, message: `File uploaded successfully. Version ${data.versionNumber} created.` });
    } catch (err) {
      setUploadResult({ success: false, message: err instanceof Error ? err.message : 'Upload failed' });
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Import Schedule</h1>
        <p className="text-slate-500 text-sm mt-1">
          Upload a P6 XER, MS Project XML, or CSV file to create a new schedule version.
        </p>
      </div>

      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-16 text-center cursor-pointer transition-all ${
          dragOver
            ? 'border-amber-400 bg-amber-50'
            : 'border-slate-300 bg-white hover:border-amber-400 hover:bg-amber-50/30'
        } ${uploading ? 'pointer-events-none opacity-60' : ''}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xer,.csv,.xml"
          className="hidden"
          onChange={handleInputChange}
        />

        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-600 font-medium">Uploading and parsing…</p>
            <p className="text-slate-400 text-sm">This may take a moment for large files</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-3xl">
              📁
            </div>
            <div>
              <p className="text-slate-700 font-semibold text-lg">
                {dragOver ? 'Drop to upload' : 'Drag & drop your schedule file'}
              </p>
              <p className="text-slate-400 text-sm mt-1">
                or click to browse · .xer, .csv, .xml supported
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Result */}
      {uploadResult && (
        <div
          className={`mt-4 p-4 rounded-lg border ${
            uploadResult.success
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          <div className="flex items-start gap-2">
            <span className="text-lg">{uploadResult.success ? '✅' : '❌'}</span>
            <p className="text-sm font-medium">{uploadResult.message}</p>
          </div>
        </div>
      )}

      <div className="mt-8 bg-slate-50 border border-slate-200 rounded-xl p-6">
        <h3 className="font-semibold text-slate-800 text-sm mb-3">Supported formats</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { ext: '.xer', name: 'Primavera P6', desc: 'Versions 15.2–19.12', icon: '🔷' },
            { ext: '.csv', name: 'CSV Export', desc: 'P6 or generic CSV', icon: '📊' },
            { ext: '.xml', name: 'MS Project', desc: 'XML format', icon: '🟦' },
          ].map((fmt) => (
            <div key={fmt.ext} className="flex items-start gap-3">
              <span className="text-2xl">{fmt.icon}</span>
              <div>
                <p className="text-slate-800 text-sm font-medium">{fmt.name}</p>
                <p className="text-slate-500 text-xs">{fmt.desc}</p>
                <span className="inline-block mt-1 px-1.5 py-0.5 bg-slate-200 text-slate-600 text-xs rounded font-mono">
                  {fmt.ext}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
