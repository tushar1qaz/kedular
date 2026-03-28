import { describe, it, expect } from 'vitest';
import { computeParseHealth } from '../parse-health';
import { parseXer } from '../xer-parser';
import fs from 'fs';
import path from 'path';

const FIXTURES = path.resolve(__dirname, '../../../../tests/fixtures/xer');

function loadFixture(name: string): Buffer {
  return fs.readFileSync(path.join(FIXTURES, name));
}

// ── computeParseHealth: confidence levels ─────────────────────────────────────

describe('computeParseHealth — confidence levels', () => {
  it('full confidence when all required tables present', () => {
    const result = parseXer(loadFixture('minimal-valid.xer'));
    const health = computeParseHealth(result);
    expect(health.confidence).toBe('full');
  });

  it('partial confidence when activities present but data_loss errors exist', () => {
    const result = parseXer(loadFixture('missing-taskpred.xer'));
    const health = computeParseHealth(result);
    expect(health.confidence).toBe('partial');
  });

  it('partial confidence when activities present but CALENDAR missing', () => {
    const result = parseXer(loadFixture('missing-calendar.xer'));
    const health = computeParseHealth(result);
    expect(health.confidence).toBe('partial');
  });

  it('failed or partial when no activities found', () => {
    const result = parseXer(loadFixture('empty-schedule.xer'));
    const health = computeParseHealth(result);
    expect(['failed', 'partial']).toContain(health.confidence);
  });

  it('failed when fatal errors present', () => {
    const result = parseXer('');
    const health = computeParseHealth(result);
    expect(health.confidence).toBe('failed');
  });
});

// ── computeParseHealth: capabilities ─────────────────────────────────────────

describe('computeParseHealth — capabilities', () => {
  it('canShowGantt = true when activities have dates', () => {
    const result = parseXer(loadFixture('minimal-valid.xer'));
    const health = computeParseHealth(result);
    expect(health.capabilities.canShowGantt).toBe(true);
  });

  it('canShowGantt = false when no activities', () => {
    const result = parseXer(loadFixture('empty-schedule.xer'));
    const health = computeParseHealth(result);
    expect(health.capabilities.canShowGantt).toBe(false);
  });

  it('canRunCpm = true only when activities + relationships + calendars present', () => {
    const result = parseXer(loadFixture('minimal-valid.xer'));
    const health = computeParseHealth(result);
    expect(health.capabilities.canRunCpm).toBe(true);
  });

  it('canRunCpm = false when missing TASKPRED', () => {
    const result = parseXer(loadFixture('missing-taskpred.xer'));
    const health = computeParseHealth(result);
    expect(health.capabilities.canRunCpm).toBe(false);
  });

  it('canRunCpm = false when missing CALENDAR', () => {
    const result = parseXer(loadFixture('missing-calendar.xer'));
    const health = computeParseHealth(result);
    expect(health.capabilities.canRunCpm).toBe(false);
  });

  it('canExportXer = false when confidence is failed', () => {
    const result = parseXer('');
    const health = computeParseHealth(result);
    expect(health.capabilities.canExportXer).toBe(false);
  });

  it('canExportXer = true when tables present and confidence not failed', () => {
    const result = parseXer(loadFixture('minimal-valid.xer'));
    const health = computeParseHealth(result);
    expect(health.capabilities.canExportXer).toBe(true);
  });

  it('canExportCsv = true when activities present', () => {
    const result = parseXer(loadFixture('minimal-valid.xer'));
    const health = computeParseHealth(result);
    expect(health.capabilities.canExportCsv).toBe(true);
  });

  it('canShowBurndown = false when all phys_complete_pct = 0', () => {
    const result = parseXer(loadFixture('minimal-valid.xer'));
    const health = computeParseHealth(result);
    // minimal-valid.xer has all activities at 0%
    expect(health.capabilities.canShowBurndown).toBe(false);
  });

  it('canShowBurndown = true when any activity has phys_complete_pct > 0', () => {
    const xer = [
      'ERMHDR\t19.12.0.0\t2026-01-15 08:00\teppm\tadmin',
      '%T\tTASK',
      '%F\ttask_id\tproj_id\twbs_id\tclndr_id\ttask_code\ttask_name\ttask_type\tstatus_code\ttarget_start_date\ttarget_end_date\tremain_drtn_hr_cnt\ttotal_float_hr_cnt\tphys_complete_pct',
      '%R\t3001\t1001\t\t1\tTASK-001\tTask\tTT_Task\tTK_Active\t2026-01-05 08:00\t2026-01-09 17:00\t20\t0\t50',
      '%E',
    ].join('\n');

    const result = parseXer(xer);
    const health = computeParseHealth(result);
    expect(health.capabilities.canShowBurndown).toBe(true);
  });
});

// ── computeParseHealth: stats ─────────────────────────────────────────────────

describe('computeParseHealth — stats', () => {
  it('stats.tablesMissing populated when required tables absent', () => {
    const result = parseXer(loadFixture('empty-schedule.xer'));
    const health = computeParseHealth(result);

    expect(health.stats.tablesMissing).toContain('TASK');
    expect(health.stats.tablesMissing).toContain('TASKPRED');
    expect(health.stats.tablesMissing).toContain('CALENDAR');
    expect(health.stats.tablesMissing).toContain('PROJWBS');
  });

  it('stats.totalRows counts all rows across all tables', () => {
    const result = parseXer(loadFixture('minimal-valid.xer'));
    const health = computeParseHealth(result);
    // PROJECT=1, CALENDAR=1, PROJWBS=2, TASK=2, TASKPRED=1 = 7
    expect(health.stats.totalRows).toBe(7);
  });

  it('stats.rowsSkipped counts ROW_FIELD_COUNT_MISMATCH errors', () => {
    const result = parseXer(loadFixture('field-mismatch.xer'));
    const health = computeParseHealth(result);
    expect(health.stats.rowsSkipped).toBeGreaterThanOrEqual(1);
  });

  it('stats.activitiesParsed matches activities array length', () => {
    const result = parseXer(loadFixture('minimal-valid.xer'));
    const health = computeParseHealth(result);
    expect(health.stats.activitiesParsed).toBe(result.activities.length);
    expect(health.stats.activitiesParsed).toBe(2);
  });

  it('stats.parseTimeMs is >= 0', () => {
    const result = parseXer(loadFixture('minimal-valid.xer'));
    const health = computeParseHealth(result);
    expect(health.stats.parseTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('stats.encodingDetected populated', () => {
    const result = parseXer(loadFixture('minimal-valid.xer'));
    const health = computeParseHealth(result);
    expect(health.stats.encodingDetected).toBeTruthy();
  });
});

// ── computeParseHealth: errors and warnings passthrough ──────────────────────

describe('computeParseHealth — errors and warnings passthrough', () => {
  it('errors from parseXer appear in health.errors', () => {
    const result = parseXer(loadFixture('empty-schedule.xer'));
    const health = computeParseHealth(result);
    expect(health.errors.length).toBeGreaterThan(0);
    expect(health.errors.some(e => e.code === 'MISSING_TABLE_TASK')).toBe(true);
  });

  it('warnings from parseXer appear in health.warnings', () => {
    const result = parseXer(loadFixture('no-terminator.xer'));
    const health = computeParseHealth(result);
    expect(health.warnings.some(w => w.code === 'MISSING_TERMINATOR')).toBe(true);
  });
});
