import { describe, it, expect } from 'vitest';
import { CalendarEngine, CalendarDef } from '../calendar';

const standardCal: CalendarDef = {
  id: 'standard',
  workdays: [1, 2, 3, 4, 5],
  holidays: [],
  hoursPerDay: 8,
};

const calWithXmas: CalendarDef = {
  id: 'withXmas',
  workdays: [1, 2, 3, 4, 5],
  holidays: ['2026-12-25'],
  hoursPerDay: 8,
};

function d(iso: string): Date {
  const [y, m, day] = iso.split('-').map(Number);
  return new Date(y, m - 1, day);
}

function dateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

describe('CalendarEngine', () => {
  const engine = new CalendarEngine([standardCal, calWithXmas]);

  describe('isWorkingDay', () => {
    it('Monday is a working day', () => {
      expect(engine.isWorkingDay(d('2026-01-05'), 'standard')).toBe(true);
    });

    it('Saturday is not a working day', () => {
      expect(engine.isWorkingDay(d('2026-01-10'), 'standard')).toBe(false);
    });

    it('Sunday is not a working day', () => {
      expect(engine.isWorkingDay(d('2026-01-11'), 'standard')).toBe(false);
    });

    it('Holiday is not a working day', () => {
      expect(engine.isWorkingDay(d('2026-12-25'), 'withXmas')).toBe(false);
    });

    it('Same date without holiday is a working day', () => {
      expect(engine.isWorkingDay(d('2026-12-25'), 'standard')).toBe(true);
    });
  });

  describe('addWorkingDays', () => {
    it('skips weekends: Fri + 1 = Mon', () => {
      const result = engine.addWorkingDays(d('2026-01-09'), 1, 'standard');
      expect(dateStr(result)).toBe('2026-01-12');
    });

    it('adds 5 working days from Monday = next Monday', () => {
      const result = engine.addWorkingDays(d('2026-01-05'), 5, 'standard');
      expect(dateStr(result)).toBe('2026-01-12');
    });

    it('adds 0 days returns same date', () => {
      const result = engine.addWorkingDays(d('2026-01-05'), 0, 'standard');
      expect(dateStr(result)).toBe('2026-01-05');
    });

    it('skips holidays: Wed Dec 23 + 2 = Mon Dec 28', () => {
      const result = engine.addWorkingDays(d('2026-12-23'), 2, 'withXmas');
      expect(dateStr(result)).toBe('2026-12-28');
    });

    it('negative days delegates to subtractWorkingDays', () => {
      const result = engine.addWorkingDays(d('2026-01-12'), -1, 'standard');
      expect(dateStr(result)).toBe('2026-01-09');
    });
  });

  describe('subtractWorkingDays', () => {
    it('Mon - 1 = Fri', () => {
      const result = engine.subtractWorkingDays(d('2026-01-12'), 1, 'standard');
      expect(dateStr(result)).toBe('2026-01-09');
    });

    it('subtracts 0 days returns same date', () => {
      const result = engine.subtractWorkingDays(d('2026-01-05'), 0, 'standard');
      expect(dateStr(result)).toBe('2026-01-05');
    });

    it('skips weekends going backward', () => {
      const result = engine.subtractWorkingDays(d('2026-01-14'), 3, 'standard');
      // Wed Jan 14: -1=Tue Jan 13, -2=Mon Jan 12, -3=Fri Jan 9
      expect(dateStr(result)).toBe('2026-01-09');
    });
  });

  describe('getWorkingDaysBetween', () => {
    it('Mon to Fri = 4 (exclusive start, inclusive end)', () => {
      // Mon Jan 5 to Fri Jan 9: Tue, Wed, Thu, Fri = 4
      const result = engine.getWorkingDaysBetween(d('2026-01-05'), d('2026-01-09'), 'standard');
      expect(result).toBe(4);
    });

    it('same date = 0', () => {
      const result = engine.getWorkingDaysBetween(d('2026-01-05'), d('2026-01-05'), 'standard');
      expect(result).toBe(0);
    });

    it('negative when end < start', () => {
      const result = engine.getWorkingDaysBetween(d('2026-01-09'), d('2026-01-05'), 'standard');
      expect(result).toBe(-4);
    });

    it('Mon to Mon (next week) = 5', () => {
      const result = engine.getWorkingDaysBetween(d('2026-01-05'), d('2026-01-12'), 'standard');
      expect(result).toBe(5);
    });

    it('skips holidays', () => {
      // Wed Dec 23 to Mon Dec 28, skipping Dec 25, Dec 26(Fri), Dec 27(Sat)
      // Actually standard calendar: Dec 24 Thu, Dec 25 Fri(holiday), Dec 28 Mon
      // from Dec 23 to Dec 28: Thu(24), holiday(25-skipped), Mon(28) = 2 working days
      const result = engine.getWorkingDaysBetween(d('2026-12-23'), d('2026-12-28'), 'withXmas');
      expect(result).toBe(2);
    });
  });

  describe('getNextWorkingDay', () => {
    it('Friday -> Monday', () => {
      const result = engine.getNextWorkingDay(d('2026-01-09'), 'standard');
      expect(dateStr(result)).toBe('2026-01-12');
    });

    it('Thursday -> Friday', () => {
      const result = engine.getNextWorkingDay(d('2026-01-08'), 'standard');
      expect(dateStr(result)).toBe('2026-01-09');
    });
  });

  describe('getHoursPerDay', () => {
    it('returns 8 for standard calendar', () => {
      expect(engine.getHoursPerDay('standard')).toBe(8);
    });

    it('returns default 8 for unknown calendar', () => {
      expect(engine.getHoursPerDay('unknown-cal')).toBe(8);
    });
  });
});
