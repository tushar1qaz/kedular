'use client';

import { useState, useRef, use } from 'react';

interface ExtractedActivity {
  code: string;
  name: string;
  duration: number;
  predecessors: string[];
  isMilestone: boolean;
}

interface ExtractionResult {
  projectName: string;
  activities: ExtractedActivity[];
  relationships: { predecessorCode: string; successorCode: string; type: string; lagDays: number }[];
  confidence: number;
  notes: string;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ImportPage({ params }: PageProps) {
  const { id } = use(params);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Extract from document state
  const [activeTab, setActiveTab] = useState<'upload' | 'extract'>('upload');
  const [extractDragOver, setExtractDragOver] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractResult, setExtractResult] = useState<ExtractionResult | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const extractInputRef = useRef<HTMLInputElement>(null);

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

  async function handleExtractFile(file: File) {
    const allowed = ['.txt', '.pdf'];
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    if (!allowed.includes(ext)) {
      setExtractError(`Unsupported file type: ${ext}. Please upload .txt or .pdf files.`);
      return;
    }

    setExtracting(true);
    setExtractResult(null);
    setExtractError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('projectId', id);

      const res = await fetch('/api/extract', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Extraction failed');
      setExtractResult(data as ExtractionResult);
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : 'Extraction failed');
    } finally {
      setExtracting(false);
    }
  }

  function handleExtractDrop(e: React.DragEvent) {
    e.preventDefault();
    setExtractDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleExtractFile(file);
  }

  function handleExtractInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleExtractFile(file);
    e.target.value = '';
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Import Schedule</h1>
        <p className="text-slate-500 text-sm mt-1">
          Upload a P6 XER file or extract activities from a document.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border border-slate-200 rounded-xl p-1 bg-slate-50">
        <button
          onClick={() => setActiveTab('upload')}
          className={`flex-1 text-sm py-2 rounded-lg font-medium transition-all ${
            activeTab === 'upload'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Upload Schedule File
        </button>
        <button
          onClick={() => setActiveTab('extract')}
          className={`flex-1 text-sm py-2 rounded-lg font-medium transition-all ${
            activeTab === 'extract'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Extract from Document
        </button>
      </div>

      {activeTab === 'upload' && (
        <>
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
        </>
      )}

      {activeTab === 'extract' && (
        <div>
          <p className="text-slate-500 text-sm mb-4">
            Upload a .txt or .pdf document. AI will extract activities, durations, and relationships
            and create a draft schedule for review.
          </p>

          {/* Extract upload zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setExtractDragOver(true); }}
            onDragLeave={() => setExtractDragOver(false)}
            onDrop={handleExtractDrop}
            onClick={() => extractInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
              extractDragOver
                ? 'border-amber-400 bg-amber-50'
                : 'border-slate-300 bg-white hover:border-amber-400 hover:bg-amber-50/30'
            } ${extracting ? 'pointer-events-none opacity-60' : ''}`}
          >
            <input
              ref={extractInputRef}
              type="file"
              accept=".txt,.pdf"
              className="hidden"
              onChange={handleExtractInputChange}
            />

            {extracting ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-600 font-medium">Extracting schedule…</p>
                <p className="text-slate-400 text-sm">Claude is reading the document</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-3xl">
                  📄
                </div>
                <div>
                  <p className="text-slate-700 font-semibold text-lg">
                    {extractDragOver ? 'Drop to extract' : 'Upload a document to extract'}
                  </p>
                  <p className="text-slate-400 text-sm mt-1">
                    or click to browse · .txt, .pdf supported
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Extract error */}
          {extractError && (
            <div className="mt-4 p-4 rounded-lg border bg-red-50 border-red-200 text-red-700">
              <div className="flex items-start gap-2">
                <span className="text-lg">❌</span>
                <p className="text-sm font-medium">{extractError}</p>
              </div>
            </div>
          )}

          {/* Extract results */}
          {extractResult && (
            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-slate-800">{extractResult.projectName}</h3>
                  <p className="text-slate-500 text-sm">
                    {extractResult.activities.length} activities · {extractResult.relationships.length} relationships ·{' '}
                    <span
                      className={`font-medium ${
                        extractResult.confidence >= 0.8
                          ? 'text-green-600'
                          : extractResult.confidence >= 0.5
                            ? 'text-yellow-600'
                            : 'text-red-600'
                      }`}
                    >
                      {Math.round(extractResult.confidence * 100)}% confidence
                    </span>
                  </p>
                </div>
              </div>

              {extractResult.notes && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-amber-800 text-sm">{extractResult.notes}</p>
                </div>
              )}

              {/* Draft activities table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                  <h4 className="text-sm font-medium text-slate-700">Draft Activities</h4>
                </div>
                <div className="overflow-x-auto max-h-64">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium text-slate-600">Code</th>
                        <th className="text-left px-4 py-2 font-medium text-slate-600">Name</th>
                        <th className="text-left px-4 py-2 font-medium text-slate-600">Duration</th>
                        <th className="text-left px-4 py-2 font-medium text-slate-600">Predecessors</th>
                      </tr>
                    </thead>
                    <tbody>
                      {extractResult.activities.map((a, i) => (
                        <tr key={a.code} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                          <td className="px-4 py-2 font-mono text-xs">{a.code}</td>
                          <td className="px-4 py-2 text-slate-800">{a.name}</td>
                          <td className="px-4 py-2 text-slate-500">
                            {a.isMilestone ? 'Milestone' : `${a.duration}d`}
                          </td>
                          <td className="px-4 py-2 text-slate-500 font-mono text-xs">
                            {a.predecessors.join(', ') || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="text-xs text-slate-400 italic">
                Note: Creating a version from extracted documents is not yet implemented. This preview shows what was extracted.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
