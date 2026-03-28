import { ParsedXer } from './xer-parser';

export interface CanonicalSchedule {
  project: {
    name: string;
    description: string;
    dataDate: Date | null;
  };
  activities: CanonicalActivity[];
  relationships: CanonicalRelationship[];
  wbsNodes: CanonicalWbsNode[];
  calendars: CanonicalCalendar[];
}

export interface CanonicalActivity {
  code: string;
  sourceId: string;
  name: string;
  wbsCode: string | null;
  type: string;
  status: string;
  plannedStart: Date | null;
  plannedFinish: Date | null;
  actualStart: Date | null;
  actualFinish: Date | null;
  remainingDuration: number;
  totalFloat: number;
  freeFloat: number;
  percentComplete: number;
  calendarSourceId: string | null;
  rawXerRow?: any;
}

export interface CanonicalRelationship {
  predecessorCode: string;
  successorCode: string;
  type: string;
  lagDays: number;
  rawXerRow?: any;
}

export interface CanonicalWbsNode {
  sourceId: string;
  parentSourceId: string | null;
  code: string;
  name: string;
  level: number;
  sortOrder: number;
}

export interface CanonicalCalendar {
  sourceId: string;
  name: string;
  workdays: number[];
  holidays: string[];
  hoursPerDay: number;
}

export function normaliseXer(parsed: ParsedXer): CanonicalSchedule {
  const project = parsed.projects[0];
  const hoursPerDay = 8; // Default, should be extracted from CALENDAR if possible

  const activities: CanonicalActivity[] = parsed.activities.map(task => ({
    code: task.task_code,
    sourceId: task.task_id,
    name: task.task_name,
    wbsCode: null, // Resolving WBS happens later or via wbs_id
    type: mapXerTaskType(task.task_type),
    status: mapXerStatus(task.status_code),
    plannedStart: parseXerDate(task.target_start_date),
    plannedFinish: parseXerDate(task.target_end_date),
    actualStart: parseXerDate(task.act_start_date),
    actualFinish: parseXerDate(task.act_end_date),
    remainingDuration: (parseFloat(task.remain_drtn_hr_cnt) || 0) / hoursPerDay,
    totalFloat: (parseFloat(task.total_float_hr_cnt) || 0) / hoursPerDay,
    freeFloat: 0, // Not always in XER
    percentComplete: parseFloat(task.phys_complete_pct) || 0,
    calendarSourceId: task.clndr_id,
    rawXerRow: task._raw,
  }));

  const relationships: CanonicalRelationship[] = parsed.relationships.map(rel => {
    const pred = parsed.activities.find(a => a.task_id === rel.pred_task_id);
    const succ = parsed.activities.find(a => a.task_id === rel.task_id);
    
    return {
      predecessorCode: pred?.task_code || rel.pred_task_id,
      successorCode: succ?.task_code || rel.task_id,
      type: mapXerRelationshipType(rel.pred_type),
      lagDays: (parseFloat(rel.lag_hr_cnt) || 0) / hoursPerDay,
      rawXerRow: rel._raw,
    };
  });

  const wbsNodes: CanonicalWbsNode[] = parsed.wbsNodes.map(wbs => ({
    sourceId: wbs.wbs_id,
    parentSourceId: wbs.parent_wbs_id,
    code: wbs.wbs_short_name,
    name: wbs.wbs_name,
    level: 0, // Needs hierarchical calculation
    sortOrder: parseInt(wbs.seq_num) || 0,
  }));

  const calendars: CanonicalCalendar[] = parsed.calendars.map(cal => ({
    sourceId: cal.clndr_id,
    name: cal.clndr_name,
    workdays: [1, 2, 3, 4, 5], // Default M-F
    holidays: [],
    hoursPerDay: 8,
  }));

  return {
    project: {
      name: project?.proj_short_name || 'Untitled Project',
      description: project?.proj_name || '',
      dataDate: parseXerDate(project?.data_date),
    },
    activities,
    relationships,
    wbsNodes,
    calendars,
  };
}

function mapXerTaskType(type: string): string {
  switch (type) {
    case 'TT_Task': return 'task_dependent';
    case 'TT_Mile': return 'task_milestone';
    case 'TT_LOE': return 'LOE';
    case 'TT_WBS': return 'WBS_summary';
    default: return 'task_dependent';
  }
}

function mapXerStatus(status: string): string {
  switch (status) {
    case 'TK_NotStart': return 'not_started';
    case 'TK_Active': return 'in_progress';
    case 'TK_Complete': return 'complete';
    default: return 'not_started';
  }
}

function mapXerRelationshipType(type: string): string {
  switch (type) {
    case 'PR_FS': return 'FS';
    case 'PR_SS': return 'SS';
    case 'PR_FF': return 'FF';
    case 'PR_SF': return 'SF';
    default: return 'FS';
  }
}

function parseXerDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;
  const date = new Date(dateStr.replace(' ', 'T'));
  return isNaN(date.getTime()) ? null : date;
}
