export interface CalendarDef {
  id: string;
  workdays: number[];   // 0=Sun,1=Mon,...,6=Sat
  holidays: string[];   // ISO date strings "2026-12-25"
  hoursPerDay: number;  // default 8
}

const DEFAULT_CALENDAR: CalendarDef = {
  id: '__default__',
  workdays: [1, 2, 3, 4, 5],
  holidays: [],
  hoursPerDay: 8,
};

function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export class CalendarEngine {
  private calendars: Map<string, CalendarDef>;
  private defaultCalendar: CalendarDef;

  constructor(calendars: CalendarDef[]) {
    this.calendars = new Map();
    for (const cal of calendars) {
      this.calendars.set(cal.id, cal);
    }
    this.defaultCalendar = DEFAULT_CALENDAR;
    if (!this.calendars.has('__default__')) {
      this.calendars.set('__default__', DEFAULT_CALENDAR);
    }
  }

  private getCalendar(calendarId: string): CalendarDef {
    return this.calendars.get(calendarId) ?? this.defaultCalendar;
  }

  isWorkingDay(date: Date, calendarId: string): boolean {
    const cal = this.getCalendar(calendarId);
    const dow = date.getDay();
    if (!cal.workdays.includes(dow)) return false;
    const ds = toDateString(date);
    if (cal.holidays.includes(ds)) return false;
    return true;
  }

  getNextWorkingDay(date: Date, calendarId: string): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    while (!this.isWorkingDay(d, calendarId)) {
      d.setDate(d.getDate() + 1);
    }
    return d;
  }

  addWorkingDays(date: Date, days: number, calendarId: string): Date {
    if (days < 0) {
      return this.subtractWorkingDays(date, -days, calendarId);
    }
    if (days === 0) return new Date(date);
    const d = new Date(date);
    let remaining = days;
    while (remaining > 0) {
      d.setDate(d.getDate() + 1);
      if (this.isWorkingDay(d, calendarId)) {
        remaining--;
      }
    }
    return d;
  }

  subtractWorkingDays(date: Date, days: number, calendarId: string): Date {
    if (days < 0) {
      return this.addWorkingDays(date, -days, calendarId);
    }
    if (days === 0) return new Date(date);
    const d = new Date(date);
    let remaining = days;
    while (remaining > 0) {
      d.setDate(d.getDate() - 1);
      if (this.isWorkingDay(d, calendarId)) {
        remaining--;
      }
    }
    return d;
  }

  /**
   * Count working days from start (exclusive) to end (inclusive).
   * If end < start, returns negative count.
   */
  getWorkingDaysBetween(start: Date, end: Date, calendarId: string): number {
    if (start.getTime() === end.getTime()) return 0;

    const forward = end.getTime() > start.getTime();
    const from = new Date(forward ? start : end);
    const to = new Date(forward ? end : start);

    let count = 0;
    const d = new Date(from);
    d.setDate(d.getDate() + 1);
    while (d.getTime() <= to.getTime()) {
      if (this.isWorkingDay(d, calendarId)) {
        count++;
      }
      d.setDate(d.getDate() + 1);
    }
    return forward ? count : -count;
  }

  getHoursPerDay(calendarId: string): number {
    return this.getCalendar(calendarId).hoursPerDay;
  }
}
