export type ParseConfidence = 'full' | 'partial' | 'failed';

export interface ParseError {
  code: string;
  message: string;
  table?: string;
  row?: number;
  field?: string;
  severity: 'fatal' | 'data_loss' | 'recoverable';
}

export interface ParseWarning {
  code: string;
  message: string;
  table?: string;
  field?: string;
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

export interface ParseResult<T> {
  data: T | null;
  confidence: ParseConfidence;
  errors: ParseError[];
  warnings: ParseWarning[];
  stats: ParseStats;
}

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
