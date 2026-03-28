import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  date,
  numeric,
  jsonb,
  unique,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  full_name: text('full_name'),
  avatar_url: text('avatar_url'),
  created_at: timestamp('created_at').defaultNow(),
});

export const organisations = pgTable('organisations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  created_at: timestamp('created_at').defaultNow(),
});

export const org_members = pgTable('org_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  org_id: uuid('org_id').references(() => organisations.id),
  user_id: uuid('user_id').references(() => users.id),
  role: text('role').default('member'),
  created_at: timestamp('created_at').defaultNow(),
});

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  org_id: uuid('org_id').references(() => organisations.id),
  name: text('name').notNull(),
  description: text('description'),
  source_format: text('source_format'),
  active_version_id: uuid('active_version_id'),
  data_date: date('data_date'),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
  created_by: uuid('created_by').references(() => users.id),
});

export const schedule_versions = pgTable('schedule_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  project_id: uuid('project_id').references(() => projects.id),
  version_number: integer('version_number'),
  label: text('label'),
  source_format: text('source_format'),
  source_file_name: text('source_file_name'),
  source_file_path: text('source_file_path'),
  data_date: date('data_date'),
  uploaded_at: timestamp('uploaded_at').defaultNow(),
  uploaded_by: uuid('uploaded_by').references(() => users.id),
  total_activities: integer('total_activities'),
  total_relationships: integer('total_relationships'),
  percent_complete: numeric('percent_complete', { precision: 5, scale: 2 }),
  planned_finish: date('planned_finish'),
  critical_path_length_days: integer('critical_path_length_days'),
  spi: numeric('spi', { precision: 6, scale: 4 }),
  cpi: numeric('cpi', { precision: 6, scale: 4 }),
  health_score: integer('health_score'),
  xer_raw_tables: jsonb('xer_raw_tables'),
  xer_file_encoding: text('xer_file_encoding'),
  is_baseline: boolean('is_baseline').default(false),
  notes: text('notes'),
  parse_health: jsonb('parse_health'),
}, (table) => ({
  uniqueProjectVersion: unique().on(table.project_id, table.version_number),
}));

export const calendars = pgTable('calendars', {
  id: uuid('id').primaryKey().defaultRandom(),
  project_id: uuid('project_id').references(() => projects.id),
  version_id: uuid('version_id').references(() => schedule_versions.id),
  source_id: text('source_id'),
  name: text('name'),
  workdays: jsonb('workdays'),
  holidays: jsonb('holidays'),
  hours_per_day: numeric('hours_per_day', { precision: 4, scale: 2 }).default('8'),
  raw_caldata: jsonb('raw_caldata'),
});

export const wbs_nodes = pgTable('wbs_nodes', {
  id: uuid('id').primaryKey().defaultRandom(),
  project_id: uuid('project_id').references(() => projects.id),
  version_id: uuid('version_id').references(() => schedule_versions.id),
  source_id: text('source_id'),
  parent_source_id: text('parent_source_id'),
  code: text('code'),
  name: text('name'),
  level: integer('level'),
  sort_order: integer('sort_order'),
  raw_xer_row: jsonb('raw_xer_row'),
});

export const activities = pgTable('activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  project_id: uuid('project_id').references(() => projects.id),
  version_id: uuid('version_id').references(() => schedule_versions.id),
  code: text('code'),
  source_id: text('source_id'),
  name: text('name'),
  wbs_id: uuid('wbs_id').references(() => wbs_nodes.id),
  wbs_code: text('wbs_code'),
  type: text('type'),
  status: text('status'),
  planned_start: date('planned_start'),
  planned_finish: date('planned_finish'),
  actual_start: date('actual_start'),
  actual_finish: date('actual_finish'),
  remaining_duration: numeric('remaining_duration', { precision: 10, scale: 2 }),
  total_float: numeric('total_float', { precision: 10, scale: 2 }),
  free_float: numeric('free_float', { precision: 10, scale: 2 }),
  is_critical: boolean('is_critical').default(false),
  percent_complete: numeric('percent_complete', { precision: 5, scale: 2 }).default('0'),
  calendar_id: uuid('calendar_id'),
  constraint_type: text('constraint_type'),
  constraint_date: date('constraint_date'),
  is_dirty: boolean('is_dirty').default(false),
  raw_xer_row: jsonb('raw_xer_row'),
}, (table) => ({
  uniqueVersionCode: unique().on(table.version_id, table.code),
}));

export const relationships = pgTable('relationships', {
  id: uuid('id').primaryKey().defaultRandom(),
  project_id: uuid('project_id').references(() => projects.id),
  version_id: uuid('version_id').references(() => schedule_versions.id),
  source_id: text('source_id'),
  predecessor_id: uuid('predecessor_id').references(() => activities.id),
  successor_id: uuid('successor_id').references(() => activities.id),
  predecessor_code: text('predecessor_code'),
  successor_code: text('successor_code'),
  type: text('type'),
  lag_days: numeric('lag_days', { precision: 10, scale: 2 }).default('0'),
  raw_xer_row: jsonb('raw_xer_row'),
});

export const resources = pgTable('resources', {
  id: uuid('id').primaryKey().defaultRandom(),
  project_id: uuid('project_id').references(() => projects.id),
  version_id: uuid('version_id').references(() => schedule_versions.id),
  source_id: text('source_id'),
  name: text('name'),
  type: text('type'),
  unit: text('unit'),
  rate: numeric('rate', { precision: 12, scale: 2 }),
});

export const assignments = pgTable('assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  project_id: uuid('project_id').references(() => projects.id),
  version_id: uuid('version_id').references(() => schedule_versions.id),
  activity_id: uuid('activity_id').references(() => activities.id),
  resource_id: uuid('resource_id').references(() => resources.id),
  activity_code: text('activity_code'),
  resource_name: text('resource_name'),
  planned_units: numeric('planned_units', { precision: 12, scale: 2 }),
  actual_units: numeric('actual_units', { precision: 12, scale: 2 }),
  remaining_units: numeric('remaining_units', { precision: 12, scale: 2 }),
});

export const schedule_changes = pgTable('schedule_changes', {
  id: uuid('id').primaryKey().defaultRandom(),
  project_id: uuid('project_id').references(() => projects.id),
  user_id: uuid('user_id').references(() => users.id),
  created_at: timestamp('created_at').defaultNow(),
  session_id: uuid('session_id'),
  entity_type: text('entity_type'),
  entity_id: text('entity_id'),
  change_type: text('change_type'),
  field: text('field'),
  old_value: jsonb('old_value'),
  new_value: jsonb('new_value'),
  reverted: boolean('reverted').default(false),
});

export const version_diffs = pgTable('version_diffs', {
  id: uuid('id').primaryKey().defaultRandom(),
  project_id: uuid('project_id').references(() => projects.id),
  base_version_id: uuid('base_version_id').references(() => schedule_versions.id),
  compare_version_id: uuid('compare_version_id').references(() => schedule_versions.id),
  generated_at: timestamp('generated_at').defaultNow(),
  summary: jsonb('summary'),
  changes: jsonb('changes'),
}, (table) => ({
  uniqueVersionPair: unique().on(table.base_version_id, table.compare_version_id),
}));

export const schedule_exports = pgTable('schedule_exports', {
  id: uuid('id').primaryKey().defaultRandom(),
  project_id: uuid('project_id').references(() => projects.id),
  user_id: uuid('user_id').references(() => users.id),
  exported_at: timestamp('exported_at').defaultNow(),
  format: text('format'),
  file_path: text('file_path'),
  diff_summary: jsonb('diff_summary'),
  validation_report: jsonb('validation_report'),
});
