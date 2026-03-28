import Link from 'next/link';
import type { ParseError, ParseWarning } from '@/types/schedule';

interface DegradedFeatureNoticeProps {
  feature: string;
  reason?: string;
  parseErrors?: ParseError[];
  parseWarnings?: ParseWarning[];
  suggestion?: string;
  projectId?: string;
}

export default function DegradedFeatureNotice({
  feature,
  reason,
  parseErrors = [],
  parseWarnings = [],
  suggestion,
  projectId,
}: DegradedFeatureNoticeProps) {
  return (
    <div className="max-w-2xl mx-auto p-8">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
        <div className="flex items-start gap-4">
          <div className="text-2xl">⚠️</div>
          <div className="flex-1">
            <h3 className="font-semibold text-slate-900 mb-1">{feature} unavailable</h3>
            {reason && <p className="text-slate-700 text-sm mb-4">{reason}</p>}

            {parseErrors.length > 0 && (
              <div className="mb-4">
                <div className="text-xs font-semibold text-red-700 uppercase tracking-wider mb-2">
                  Parse errors ({parseErrors.length})
                </div>
                <ul className="space-y-1">
                  {parseErrors.slice(0, 5).map((err, i) => (
                    <li key={i} className="text-xs text-red-600 flex items-start gap-1.5">
                      <span className="mt-0.5">•</span>
                      <span>[{err.code}] {err.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {parseWarnings.length > 0 && (
              <div className="mb-4">
                <div className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">
                  Warnings ({parseWarnings.length})
                </div>
                <ul className="space-y-1">
                  {parseWarnings.slice(0, 3).map((w, i) => (
                    <li key={i} className="text-xs text-amber-700 flex items-start gap-1.5">
                      <span className="mt-0.5">•</span>
                      <span>[{w.code}] {w.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {suggestion && (
              <p className="text-sm text-slate-600 italic mb-4">{suggestion}</p>
            )}

            {projectId && (
              <Link
                href={`/project/${projectId}/import`}
                className="inline-block text-sm bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                Re-upload schedule
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
