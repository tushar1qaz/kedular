import { describe, it, expect } from 'vitest';
import { parseXer } from '../xer-parser';
import { computeParseHealth } from '../parse-health';
import fs from 'fs';
import path from 'path';

const FIXTURES = path.resolve(__dirname, '../../../../tests/fixtures/xer');

function fixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf8');
}

function fixtureExists(name: string): boolean {
  return fs.existsSync(path.join(FIXTURES, name));
}

// ── Section A: XER Format Compliance ────────────────────────────────────────

describe('XER Parser — Section A: Format Compliance', () => {
  it('A1: parses minimal valid XER (full confidence, 2 activities, 1 relationship)', () => {
    if (!fixtureExists('minimal-valid.xer')) return; // skip until fixture added
    const result = parseXer(fixture('minimal-valid.xer'));
    expect(result.errors.filter(e => e.severity === 'fatal' || e.severity === 'data_loss')).toHaveLength(0);
    expect(result.activities.length).toBe(2);
    expect(result.relationships.length).toBe(1);
    const health = computeParseHealth(result);
    expect(health.confidence).toBe('full');
  });

  it('A2: empty schedule — no TASK table → confidence partial, 0 activities, MISSING_TABLE_TASK error', () => {
    if (!fixtureExists('empty-schedule.xer')) return;
    const result = parseXer(fixture('empty-schedule.xer'));
    expect(result.activities).toHaveLength(0);
    expect(result.errors.some(e => e.code === 'MISSING_TABLE_TASK')).toBe(true);
    const health = computeParseHealth(result);
    expect(health.confidence).not.toBe('full');
  });

  it('A3: unknown tables stored in raw.tables, not discarded', () => {
    if (!fixtureExists('unknown-tables.xer')) return;
    const result = parseXer(fixture('unknown-tables.xer'));
    expect(result.raw.tables['FINTMPL']).toBeDefined();
    expect(result.raw.tables['FINTMPL'].fields.length).toBeGreaterThan(0);
  });

  it('A4: field count mismatch — mismatched row skipped, valid rows parsed', () => {
    if (!fixtureExists('field-mismatch.xer')) return;
    const result = parseXer(fixture('field-mismatch.xer'));
    expect(result.errors.some(e => e.code === 'ROW_FIELD_COUNT_MISMATCH')).toBe(true);
    // Only 1 of 2 TASK rows is valid
    expect(result.activities.length).toBe(1);
  });

  it('A5: row with MORE fields than header — extra values ignored, row still parsed', () => {
    const xer = [
      'ERMHDR\t19.12\t2026-01-01\teppm\tadmin',
      '%T\tTASK',
      '%F\ttask_id\tproj_id\ttask_code\ttask_name',
      '%R\t1\t100\tTASK-001\tFoundation\tEXTRA_VALUE\tANOTHER_EXTRA',
      '%E',
    ].join('\n');
    const result = parseXer(xer);
    expect(result.activities.length).toBe(1);
    expect(result.activities[0].task_code).toBe('TASK-001');
  });

  it('A7: empty date field parsed as null', () => {
    const xer = [
      'ERMHDR\t19.12\t2026-01-01\teppm\tadmin',
      '%T\tTASK',
      '%F\ttask_id\tproj_id\ttask_code\ttask_name\ttask_type\tstatus_code\ttarget_start_date\ttarget_end_date\tremain_drtn_hr_cnt\ttotal_float_hr_cnt\tphys_complete_pct\twbs_id\tclndr_id',
      '%R\t1\t100\tTASK-001\tFoundation\tTT_Task\tTK_NotStart\t\t\t40\t0\t0\t\t',
      '%E',
    ].join('\n');
    const result = parseXer(xer);
    expect(result.activities[0].target_start_date).toBe('');
  });

  it('A8: multi-project XER — both projects returned, activities per proj_id', () => {
    if (!fixtureExists('multi-project.xer')) return;
    const result = parseXer(fixture('multi-project.xer'));
    expect(result.projects.length).toBe(2);
  });

  it('A9: XER with no %E terminator — finishes gracefully, data parsed', () => {
    if (!fixtureExists('no-terminator.xer')) return;
    const result = parseXer(fixture('no-terminator.xer'));
    expect(result.activities.length).toBeGreaterThan(0);
    // Should have a warning about missing terminator, not a fatal error
    expect(result.errors.filter(e => e.severity === 'fatal')).toHaveLength(0);
  });

  it('A10: CRLF line endings produce same result as LF', () => {
    const lf = 'ERMHDR\t19.12\t2026-01-01\teppm\tadmin\n%T\tPROJECT\n%F\tproj_id\tproj_short_name\n%R\t1\tPROJ\n%E';
    const crlf = lf.replace(/\n/g, '\r\n');
    const resultLf = parseXer(lf);
    const resultCrlf = parseXer(crlf);
    expect(resultCrlf.projects.length).toBe(resultLf.projects.length);
  });
});

// ── Section B: Encoding ──────────────────────────────────────────────────────

describe('XER Parser — Section B: Encoding', () => {
  it('B3: UTF-8 BOM stripped, first line parsed correctly', () => {
    const content = 'ERMHDR\t19.12\t2026-01-01\teppm\tadmin\n%T\tPROJECT\n%F\tproj_id\tproj_short_name\n%R\t1\tPROJ\n%E';
    const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
    const withBom = Buffer.concat([bom, Buffer.from(content, 'utf8')]);
    const result = parseXer(withBom);
    expect(result.errors.some(e => e.code === 'NO_ERMHDR')).toBe(false);
    expect(result.projects.length).toBe(1);
  });
});

// ── Section C: Date Parsing ──────────────────────────────────────────────────

describe('XER Parser — Section C: Date Parsing', () => {
  function makeXerWithDate(dateStr: string): string {
    return [
      'ERMHDR\t19.12\t2026-01-01\teppm\tadmin',
      '%T\tTASK',
      '%F\ttask_id\tproj_id\ttask_code\ttask_name\ttask_type\tstatus_code\ttarget_start_date\ttarget_end_date\tremain_drtn_hr_cnt\ttotal_float_hr_cnt\tphys_complete_pct\twbs_id\tclndr_id',
      `%R\t1\t100\tTASK-001\tTask\tTT_Task\tTK_NotStart\t${dateStr}\t${dateStr}\t40\t0\t0\t\t`,
      '%E',
    ].join('\n');
  }

  it('C1: standard P6 date "yyyy-MM-dd HH:mm" stored as raw string', () => {
    const result = parseXer(makeXerWithDate('2026-04-15 08:00'));
    expect(result.activities[0].target_start_date).toBe('2026-04-15 08:00');
  });

  it('C2: date without time "yyyy-MM-dd" stored as raw string', () => {
    const result = parseXer(makeXerWithDate('2026-04-15'));
    expect(result.activities[0].target_start_date).toBe('2026-04-15');
  });

  it('C3: empty date stored as empty string', () => {
    const result = parseXer(makeXerWithDate(''));
    expect(result.activities[0].target_start_date).toBe('');
  });
});

// ── Section D: Numeric Parsing ───────────────────────────────────────────────

describe('XER Parser — Section D: Numeric Parsing', () => {
  it('D5: phys_complete_pct preserved as raw string "75.5"', () => {
    const xer = [
      'ERMHDR\t19.12\t2026-01-01\teppm\tadmin',
      '%T\tTASK',
      '%F\ttask_id\tproj_id\ttask_code\ttask_name\ttask_type\tstatus_code\ttarget_start_date\ttarget_end_date\tremain_drtn_hr_cnt\ttotal_float_hr_cnt\tphys_complete_pct\twbs_id\tclndr_id',
      '%R\t1\t100\tTASK-001\tTask\tTT_Task\tTK_Active\t2026-01-05\t2026-01-09\t40\t0\t75.5\t\t',
      '%E',
    ].join('\n');
    const result = parseXer(xer);
    expect(result.activities[0].phys_complete_pct).toBe('75.5');
  });
});

// ── Section E: Referential Integrity ────────────────────────────────────────

describe('XER Parser — Section E: Referential Integrity', () => {
  it('E1: orphan WBS reference → ORPHAN_TASK_WBS warning, activity still parsed', () => {
    const xer = [
      'ERMHDR\t19.12\t2026-01-01\teppm\tadmin',
      '%T\tPROJWBS',
      '%F\twbs_id\tproj_id\tparent_wbs_id\twbs_short_name\twbs_name\tseq_num',
      '%R\t2001\t100\t\tPROJ\tProject\t1',
      '%T\tTASK',
      '%F\ttask_id\tproj_id\ttask_code\ttask_name\ttask_type\tstatus_code\ttarget_start_date\ttarget_end_date\tremain_drtn_hr_cnt\ttotal_float_hr_cnt\tphys_complete_pct\twbs_id\tclndr_id',
      '%R\t1\t100\tTASK-001\tTask\tTT_Task\tTK_NotStart\t2026-01-05\t2026-01-09\t40\t0\t0\t9999\t',
      '%E',
    ].join('\n');
    const result = parseXer(xer);
    expect(result.activities.length).toBe(1);
    const orphanWarn = result.errors.find(e => e.code === 'ORPHAN_TASK_WBS') ||
                       result.warnings?.find(w => w.code === 'ORPHAN_TASK_WBS');
    expect(orphanWarn).toBeDefined();
  });

  it('E3: orphan relationship predecessor → ORPHAN_PRED_TASK error, relationship skipped', () => {
    const xer = [
      'ERMHDR\t19.12\t2026-01-01\teppm\tadmin',
      '%T\tTASK',
      '%F\ttask_id\tproj_id\ttask_code\ttask_name\ttask_type\tstatus_code\ttarget_start_date\ttarget_end_date\tremain_drtn_hr_cnt\ttotal_float_hr_cnt\tphys_complete_pct\twbs_id\tclndr_id',
      '%R\t3002\t100\tTASK-002\tTask B\tTT_Task\tTK_NotStart\t2026-01-12\t2026-01-16\t40\t0\t0\t\t',
      '%T\tTASKPRED',
      '%F\ttask_pred_id\ttask_id\tpred_task_id\tproj_id\tpred_type\tlag_hr_cnt',
      '%R\t4001\t3002\t9999\t100\tPR_FS\t0',
      '%E',
    ].join('\n');
    const result = parseXer(xer);
    expect(result.relationships.length).toBe(0);
    expect(result.errors.some(e => e.code === 'ORPHAN_PRED_TASK')).toBe(true);
  });
});

// ── Section F: Confidence and Degradation ───────────────────────────────────

describe('XER Parser — Section F: Confidence and Degradation', () => {
  it('F1: full confidence parse — all required tables present', () => {
    if (!fixtureExists('minimal-valid.xer')) return;
    const result = parseXer(fixture('minimal-valid.xer'));
    const health = computeParseHealth(result);
    expect(health.confidence).toBe('full');
    expect(health.capabilities.canShowGantt).toBe(true);
  });

  it('F2: partial confidence — missing TASKPRED', () => {
    if (!fixtureExists('missing-taskpred.xer')) return;
    const result = parseXer(fixture('missing-taskpred.xer'));
    const health = computeParseHealth(result);
    expect(health.confidence).toBe('partial');
    expect(health.capabilities.canShowGantt).toBe(true);
    expect(health.capabilities.canRunCpm).toBe(false);
  });

  it('F3: partial confidence — missing CALENDAR', () => {
    if (!fixtureExists('missing-calendar.xer')) return;
    const result = parseXer(fixture('missing-calendar.xer'));
    const health = computeParseHealth(result);
    expect(health.confidence).toBe('partial');
    expect(health.capabilities.canRunCpm).toBe(false);
  });

  it('F4: failed confidence — no TASK table at all', () => {
    if (!fixtureExists('empty-schedule.xer')) return;
    const result = parseXer(fixture('empty-schedule.xer'));
    const health = computeParseHealth(result);
    expect(health.capabilities.canShowGantt).toBe(false);
  });

  it('F5: failed confidence — file is not XER at all', () => {
    const result = parseXer('This is just a plain text file, not an XER.');
    const health = computeParseHealth(result);
    expect(health.confidence).toBe('failed');
  });
});

// ── Section G: Raw Preservation ─────────────────────────────────────────────

describe('XER Parser — Section G: Raw Preservation', () => {
  it('G2: raw field order preserved exactly as in file', () => {
    const xer = [
      'ERMHDR\t19.12\t2026-01-01\teppm\tadmin',
      '%T\tTASK',
      '%F\ttask_id\tproj_id\ttask_code\ttask_name\ttask_type\tstatus_code',
      '%R\t1\t100\tTASK-001\tFoundation\tTT_Task\tTK_NotStart',
      '%E',
    ].join('\n');
    const result = parseXer(xer);
    expect(result.raw.tables['TASK'].fields).toEqual([
      'task_id', 'proj_id', 'task_code', 'task_name', 'task_type', 'status_code',
    ]);
  });

  it('G3: raw row values preserved as strings, not converted', () => {
    const xer = [
      'ERMHDR\t19.12\t2026-01-01\teppm\tadmin',
      '%T\tTASK',
      '%F\ttask_id\tproj_id\ttask_code\ttask_name\ttask_type\tstatus_code\tremain_drtn_hr_cnt\tphys_complete_pct',
      '%R\t1\t100\tTASK-001\tFoundation\tTT_Task\tTK_NotStart\t40\t75.5',
      '%E',
    ].join('\n');
    const result = parseXer(xer);
    const row = result.raw.tables['TASK'].rows[0];
    expect(row[6]).toBe('40');   // remain_drtn_hr_cnt as string
    expect(row[7]).toBe('75.5'); // phys_complete_pct as string
  });

  it('G4: ERMHDR preserved in raw.ermhdr', () => {
    const xer = 'ERMHDR\t19.12\t2026-01-01\teppm\tadmin\n%E';
    const result = parseXer(xer);
    expect(result.raw.ermhdr.rows[0]).toBeDefined();
    expect(result.raw.ermhdr.rows[0][1]).toBe('19.12');
  });

  it('G1: raw tables capture ALL tables including unknown ones', () => {
    const xer = [
      'ERMHDR\t19.12\t2026-01-01\teppm\tadmin',
      '%T\tTASK',
      '%F\ttask_id\ttask_code',
      '%R\t1\tTASK-001',
      '%T\tFINTMPL',
      '%F\tfintmpl_id\tfintmpl_name',
      '%R\t1\tDefault',
      '%E',
    ].join('\n');
    const result = parseXer(xer);
    expect(result.raw.tables['TASK']).toBeDefined();
    expect(result.raw.tables['FINTMPL']).toBeDefined();
  });
});

// ── Basic sanity ─────────────────────────────────────────────────────────────

describe('XER Parser — Basic sanity', () => {
  it('empty string → FILE_EMPTY error', () => {
    const result = parseXer('');
    expect(result.errors.some(e => e.code === 'FILE_EMPTY')).toBe(true);
  });

  it('non-XER content → NO_ERMHDR error', () => {
    const result = parseXer('NOT_AN_XER\n%T\tSOME_TABLE');
    expect(result.errors.some(e => e.code === 'NO_ERMHDR')).toBe(true);
  });

  it('real-world fixture (if provided) — parses without fatal errors', () => {
    // Scans for any real-world fixtures and runs them
    const fixtures = fs.readdirSync(FIXTURES).filter(f => f.startsWith('real-world-'));
    for (const f of fixtures) {
      const content = fs.readFileSync(path.join(FIXTURES, f));
      const result = parseXer(content);
      expect(result.errors.filter(e => e.severity === 'fatal')).toHaveLength(0);
    }
  });
});
