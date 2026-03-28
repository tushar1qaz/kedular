'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

interface ValidationIssue {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  activityCode?: string;
}

interface ValidationResult {
  issues: ValidationIssue[];
  canExport: boolean;
  errorCount: number;
  warningCount: number;
  infoCount: number;
}

interface DiffSummary {
  modified: number;
  added: number;
  deleted: number;
}

type ExportFormat = 'xer' | 'csv' | 'mspdi_xml';

const FORMAT_LABELS: Record<ExportFormat, string> = {
  xer: 'XER (Primavera P6)',
  csv: 'CSV',
  mspdi_xml: 'MS Project XML (MSPDI)',
};

const FORMAT_MIME: Record<ExportFormat, string> = {
  xer: 'application/octet-stream',
  csv: 'text/csv',
  mspdi_xml: 'application/xml',
};

const FORMAT_EXT: Record<ExportFormat, string> = {
  xer: 'xer',
  csv: 'csv',
  mspdi_xml: 'xml',
};

export default function ExportPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [diffSummary, setDiffSummary] = useState<DiffSummary | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('xer');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        // Load project + version info
        const projRes = await fetch(`/api/projects/${projectId}`);
        if (!projRes.ok) {
          setLoading(false);
          return;
        }
        const { project } = await projRes.json() as { project: { active_version_id?: string } };

        if (!project?.active_version_id) {
          setLoading(false);
          return;
        }

        // Load validation by calling a dry-run export with validation only
        // We call the export API in "validate-only" mode indirectly:
        // Since we don't have a standalone validation endpoint, we'll fetch the version
        // and activities to compute validation client-side via a dedicated API.
        // For now, show basic info — the main action is via the Export button.
        setLoading(false);
      } catch {
        setLoading(false);
      }
    }
    void loadData();
  }, [projectId]);

  async function handleExport() {
    setExporting(true);
    setExportError(null);

    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, format: selectedFormat }),
      });

      if (res.status === 422) {
        const data = await res.json() as { error: string; validation?: ValidationResult; reason?: string };
        setValidation(data.validation ?? null);
        setExportError(data.reason ?? data.error ?? 'Export blocked by validation errors');
        setExporting(false);
        return;
      }

      if (!res.ok) {
        const data = await res.json() as { error: string };
        setExportError(data.error ?? 'Export failed');
        setExporting(false);
        return;
      }

      // Parse validation issues from header
      const issuesHeader = res.headers.get('X-Validation-Issues');
      if (issuesHeader) {
        try {
          const issuesSummary = JSON.parse(issuesHeader) as { errorCount: number; warningCount: number; infoCount: number };
          setValidation({
            issues: [],
            canExport: true,
            ...issuesSummary,
          });
        } catch { /* ignore */ }
      }

      // Trigger download
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `schedule-${projectId}.${FORMAT_EXT[selectedFormat]}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  const xerDisabled = selectedFormat === 'xer' && confidence === 'failed';

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Export Schedule</h1>
        <p className="text-slate-500 text-sm mt-1">
          Export your schedule in various formats. XER preserves your original file structure.
        </p>
      </div>

      {/* Validation Panel */}
      {validation && (
        <div className="border rounded-lg p-4 bg-white shadow-sm">
          <h2 className="font-semibold text-slate-700 mb-3">Validation Results</h2>
          <div className="flex gap-4 mb-3 text-sm">
            {validation.errorCount > 0 && (
              <span className="text-red-600 font-medium">
                {validation.errorCount} error{validation.errorCount !== 1 ? 's' : ''}
              </span>
            )}
            {validation.warningCount > 0 && (
              <span className="text-amber-600 font-medium">
                {validation.warningCount} warning{validation.warningCount !== 1 ? 's' : ''}
              </span>
            )}
            {validation.infoCount > 0 && (
              <span className="text-blue-600 font-medium">
                {validation.infoCount} info
              </span>
            )}
            {validation.errorCount === 0 && validation.warningCount === 0 && validation.infoCount === 0 && (
              <span className="text-green-600 font-medium">No issues found</span>
            )}
          </div>
          {validation.issues.length > 0 && (
            <ul className="space-y-1 max-h-48 overflow-y-auto text-sm">
              {validation.issues.map((issue, idx) => (
                <li
                  key={idx}
                  className={`flex gap-2 p-1.5 rounded ${
                    issue.severity === 'error'
                      ? 'bg-red-50 text-red-700'
                      : issue.severity === 'warning'
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-blue-50 text-blue-700'
                  }`}
                >
                  <span className="font-mono text-xs mt-0.5 shrink-0">
                    {issue.severity === 'error' ? 'ERR' : issue.severity === 'warning' ? 'WRN' : 'INF'}
                  </span>
                  <span>{issue.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Diff Summary */}
      {diffSummary && (diffSummary.modified > 0 || diffSummary.added > 0 || diffSummary.deleted > 0) && (
        <div className="border rounded-lg p-4 bg-white shadow-sm">
          <h2 className="font-semibold text-slate-700 mb-2">Changes Since Import</h2>
          <div className="flex gap-4 text-sm text-slate-600">
            {diffSummary.modified > 0 && (
              <span className="text-blue-600">{diffSummary.modified} modified</span>
            )}
            {diffSummary.added > 0 && (
              <span className="text-green-600">{diffSummary.added} added</span>
            )}
            {diffSummary.deleted > 0 && (
              <span className="text-red-600">{diffSummary.deleted} deleted</span>
            )}
          </div>
        </div>
      )}

      {/* Format Selector */}
      <div className="border rounded-lg p-4 bg-white shadow-sm">
        <h2 className="font-semibold text-slate-700 mb-3">Export Format</h2>
        <div className="space-y-2">
          {(Object.keys(FORMAT_LABELS) as ExportFormat[]).map(fmt => (
            <label
              key={fmt}
              className="flex items-start gap-3 cursor-pointer p-2 rounded hover:bg-slate-50"
            >
              <input
                type="radio"
                name="format"
                value={fmt}
                checked={selectedFormat === fmt}
                onChange={() => setSelectedFormat(fmt)}
                className="mt-0.5"
              />
              <div>
                <div className="font-medium text-slate-700 text-sm">{FORMAT_LABELS[fmt]}</div>
                {fmt === 'xer' && (
                  <div className="text-xs text-slate-500">
                    Round-trip mode — your original file structure is preserved
                  </div>
                )}
              </div>
            </label>
          ))}
        </div>

        {/* XER round-trip badge */}
        {selectedFormat === 'xer' && confidence !== 'failed' && (
          <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-100 text-green-700 text-xs font-medium">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Round-trip mode — your original file structure is preserved
          </div>
        )}

        {/* XER disabled notice */}
        {selectedFormat === 'xer' && confidence === 'failed' && (
          <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            XER export is unavailable because the original file parse failed.
          </div>
        )}
      </div>

      {/* Export Error */}
      {exportError && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {exportError}
        </div>
      )}

      {/* Export Button */}
      <button
        onClick={handleExport}
        disabled={exporting || xerDisabled || loading}
        className={`w-full sm:w-auto px-6 py-2.5 rounded-lg font-medium text-sm transition-colors ${
          exporting || xerDisabled || loading
            ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}
      >
        {exporting ? 'Exporting...' : `Export as ${FORMAT_LABELS[selectedFormat]}`}
      </button>
    </div>
  );
}
