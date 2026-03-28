import { ParsedXer, ParseStats } from './xer-parser';
import { ParseError, ParseWarning } from './xer-errors';

export type ParseConfidence = 'full' | 'partial' | 'failed';

export type { ParseStats };

export interface ScheduleParseHealth {
  confidence: ParseConfidence;
  errors: ParseError[];
  warnings: ParseWarning[];
  stats: ParseStats;
  capabilities: {
    canShowGantt: boolean;
    canRunCpm: boolean;
    canShowBurndown: boolean;
    canShowEarnedValue: boolean;
    canRunWhatIf: boolean;
    canExportXer: boolean;
    canExportCsv: boolean;
    canDiffVersions: boolean;
    canUseAgent: boolean;
  };
  missingDataMessages: {
    gantt?: string;
    cpm?: string;
    burndown?: string;
    earnedValue?: string;
    export?: string;
  };
}

export function computeParseHealth(parsed: ParsedXer): ScheduleParseHealth {
  // Use stats from the parser if available; otherwise compute
  const stats: ParseStats = parsed.stats ?? computeStats(parsed);

  // Determine confidence
  let confidence: ParseConfidence = 'full';
  if (parsed.errors.some(e => e.severity === 'fatal')) {
    confidence = 'failed';
  } else if (parsed.errors.some(e => e.severity === 'data_loss') || parsed.activities.length === 0) {
    confidence = 'partial';
  }

  const capabilities = {
    canShowGantt: parsed.activities.length > 0 &&
      parsed.activities.some(a => a.target_start_date || a.target_end_date),
    canRunCpm: parsed.activities.length > 0 &&
      parsed.relationships.length > 0 &&
      parsed.calendars.length > 0,
    canShowBurndown: parsed.activities.some(a => parseFloat(a.phys_complete_pct) > 0),
    canShowEarnedValue: parsed.assignments.length > 0,
    canRunWhatIf: parsed.activities.length > 0 && parsed.relationships.length > 0,
    canExportXer: Object.keys(parsed.raw.tables).length > 0 && confidence !== 'failed',
    canExportCsv: parsed.activities.length > 0,
    canDiffVersions: parsed.activities.length > 0 && parsed.activities.some(a => a.task_code),
    canUseAgent: parsed.activities.length > 0,
  };

  const missingDataMessages: ScheduleParseHealth['missingDataMessages'] = {};
  if (!capabilities.canShowGantt) {
    missingDataMessages.gantt = 'No activity dates found — Gantt chart cannot render.';
  }
  if (!capabilities.canRunCpm) {
    missingDataMessages.cpm = 'No relationships or calendars found — critical path calculation unavailable.';
  }

  return {
    confidence,
    errors: parsed.errors,
    warnings: parsed.warnings ?? [],
    stats,
    capabilities,
    missingDataMessages,
  };
}

function computeStats(parsed: ParsedXer): ParseStats {
  const REQUIRED = ['PROJECT', 'TASK', 'TASKPRED', 'CALENDAR', 'PROJWBS'];
  const tablesMissing = REQUIRED.filter(t => !parsed.raw.tables[t]);

  let totalRows = 0;
  for (const t of Object.values(parsed.raw.tables)) {
    totalRows += t.rows.length;
  }

  const rowsSkipped = (parsed.errors ?? []).filter(e => e.code === 'ROW_FIELD_COUNT_MISMATCH').length;

  const knownTables = new Set([...REQUIRED, 'RSRC', 'TASKRSRC', 'CALDATA']);
  const tablesUnknown = Object.keys(parsed.raw.tables).filter(t => !knownTables.has(t));

  return {
    tablesFound: Object.keys(parsed.raw.tables).length,
    tablesExpected: REQUIRED.length,
    tablesParsed: Object.keys(parsed.raw.tables),
    tablesMissing,
    tablesUnknown,
    totalRows,
    rowsSkipped,
    activitiesParsed: parsed.activities.length,
    relationshipsParsed: parsed.relationships.length,
    resourcesParsed: parsed.resources.length,
    calendarsParsed: parsed.calendars.length,
    wbsNodesParsed: parsed.wbsNodes.length,
    encodingDetected: parsed.raw.encoding,
    p6VersionDetected: parsed.ermhdr.p6Version,
    parseTimeMs: 0,
  };
}
