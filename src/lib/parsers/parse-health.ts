import { ParsedXer } from './xer-parser';
import { ParseError, ParseWarning } from './xer-errors';

export type ParseConfidence = 'full' | 'partial' | 'failed';

export interface ScheduleParseHealth {
  confidence: ParseConfidence;
  errors: ParseError[];
  warnings: ParseWarning[];
  stats: ParseStats;
  capabilities: {
    canShowGantt: boolean;           // true if activities exist with dates
    canRunCpm: boolean;              // true if relationships exist AND calendars parsed
    canShowBurndown: boolean;        // true if baseline exists with % complete data
    canShowEarnedValue: boolean;     // true if resource assignments with costs exist
    canRunWhatIf: boolean;           // true if canRunCpm
    canExportXer: boolean;           // true if raw tables preserved AND confidence != 'failed'
    canExportCsv: boolean;           // true if activities exist (less strict than XER)
    canDiffVersions: boolean;        // true if activities have codes for matching
    canUseAgent: boolean;            // true if canShowGantt
  };
  missingDataMessages: {
    gantt?: string;
    cpm?: string;
    burndown?: string;
    earnedValue?: string;
    export?: string;
  };
}

export interface ParseStats {
  tablesFound: number;
  tablesExpected: number;
  tablesParsed: string[];
  tablesMissing: string[];
  tablesUnknown: string[];
  totalRows: number;
  rowsSkipped: number;
  activitiesParsed: number;
  relationshipsParsed: number;
  resourcesParsed: number;
  calendarsParsed: number;
  wbsNodesParsed: number;
  encodingDetected: string;
  p6VersionDetected: string;
  parseTimeMs: number;
}

export function computeParseHealth(parsed: ParsedXer): ScheduleParseHealth {
  const stats: ParseStats = {
    tablesFound: Object.keys(parsed.raw.tables).length,
    tablesExpected: 15, // Total we usually look for
    tablesParsed: Object.keys(parsed.raw.tables),
    tablesMissing: [],
    tablesUnknown: [],
    totalRows: 0,
    rowsSkipped: 0,
    activitiesParsed: parsed.activities.length,
    relationshipsParsed: parsed.relationships.length,
    resourcesParsed: parsed.resources.length,
    calendarsParsed: parsed.calendars.length,
    wbsNodesParsed: parsed.wbsNodes.length,
    encodingDetected: parsed.raw.encoding,
    p6VersionDetected: parsed.ermhdr.p6Version,
    parseTimeMs: 0,
  };

  const capabilities = {
    canShowGantt: parsed.activities.length > 0 && parsed.activities.some(a => a.target_start_date || a.target_end_date),
    canRunCpm: parsed.activities.length > 0 && parsed.relationships.length > 0 && parsed.calendars.length > 0,
    canShowBurndown: parsed.activities.some(a => a.phys_complete_pct > 0),
    canShowEarnedValue: parsed.assignments.length > 0,
    canRunWhatIf: parsed.activities.length > 0 && parsed.relationships.length > 0,
    canExportXer: Object.keys(parsed.raw.tables).length > 0,
    canExportCsv: parsed.activities.length > 0,
    canDiffVersions: parsed.activities.length > 0 && parsed.activities.some(a => a.task_code),
    canUseAgent: parsed.activities.length > 0,
  };

  const missingDataMessages: any = {};
  if (!capabilities.canShowGantt) missingDataMessages.gantt = 'No activity dates found — Gantt chart cannot render.';
  if (!capabilities.canRunCpm) missingDataMessages.cpm = 'No relationships or calendars found — critical path calculation unavailable.';

  let confidence: ParseConfidence = 'full';
  if (parsed.errors.some(e => e.severity === 'fatal')) {
    confidence = 'failed';
  } else if (parsed.errors.some(e => e.severity === 'data_loss') || parsed.activities.length === 0) {
    confidence = 'partial';
  }

  return {
    confidence,
    errors: parsed.errors,
    warnings: [], // Can be populated from parsed.warnings when we add them
    stats,
    capabilities,
    missingDataMessages,
  };
}
