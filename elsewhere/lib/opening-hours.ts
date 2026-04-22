const DEFAULT_TZ = 'America/New_York';

/** Supports legacy (time: "0900"), Places API New (hour, minute), and optional date for local instants */
export type PeriodEnd = {
  day?: number;
  time?: string;
  hour?: number;
  minute?: number;
  /** ISO date "YYYY-MM-DD" in place-local calendar when API provides it */
  date?: string | { year: number; month: number; day: number };
  year?: number;
  month?: number;
};

export type OpeningPeriod = {
  open?: PeriodEnd;
  close?: PeriodEnd;
};

export type OpeningHours = {
  weekday_text?: string[];
  periods?: OpeningPeriod[];
};

function getTodayInTz(timezone: string = DEFAULT_TZ): {
  day: number;
  hour: number;
  minute: number;
} {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  const day = dayNames.indexOf(weekday);
  return { day: day === -1 ? 0 : day, hour, minute };
}

/** Parse "0900" or "09:30" to minutes since midnight */
function parseTime(t: string): number {
  if (!t || typeof t !== 'string') return 0;
  const normalized = t.replace(':', '');
  const h = parseInt(normalized.slice(0, 2), 10);
  const m = parseInt(normalized.slice(2, 4), 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

function getMinutesFromEnd(end: PeriodEnd | undefined): number | null {
  if (!end) return null;
  if (end.time != null) return parseTime(end.time);
  if (typeof end.hour === 'number' && typeof end.minute === 'number') {
    return end.hour * 60 + end.minute;
  }
  return null;
}

function getOpenTime(period: OpeningPeriod): number {
  return getMinutesFromEnd(period.open) ?? 0;
}

function getCloseTime(period: OpeningPeriod): number | null {
  return getMinutesFromEnd(period.close);
}

/** YYYY-MM-DD from API `date` (string or Places New nested object) or legacy year/month/day */
function getPeriodYmd(end: PeriodEnd | undefined): string | null {
  if (!end) return null;
  if (typeof end.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(end.date)) {
    return end.date;
  }
  if (end.date && typeof end.date === 'object' && !Array.isArray(end.date)) {
    const { year: y, month: mo, day: d } = end.date;
    if (typeof y === 'number' && typeof mo === 'number' && typeof d === 'number') {
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  if (
    typeof end.year === 'number' &&
    typeof end.month === 'number' &&
    typeof end.day === 'number'
  ) {
    return `${end.year}-${String(end.month).padStart(2, '0')}-${String(end.day).padStart(2, '0')}`;
  }
  return null;
}

/**
 * Wall clock (calendar date + minutes since local midnight) in IANA zone → UTC instant.
 * Iteratively corrects for offset/DST (no extra deps).
 */
function zonedYmdMinutesToUtcMs(
  ymd: string,
  minutesSinceMidnight: number,
  timeZone: string,
): number {
  const [y, mo, d] = ymd.split('-').map((x) => parseInt(x, 10));
  const h = Math.floor(minutesSinceMidnight / 60);
  const mi = minutesSinceMidnight % 60;

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  function wallParts(utc: number) {
    const parts = formatter.formatToParts(new Date(utc));
    const g = (type: Intl.DateTimeFormatPartTypes) =>
      parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);
    return { y: g('year'), mo: g('month'), d: g('day'), h: g('hour'), mi: g('minute') };
  }

  let t = Date.UTC(y, mo - 1, d, h, mi, 0, 0);
  for (let i = 0; i < 64; i++) {
    const p = wallParts(t);
    const dayDiff = Math.round(
      (Date.UTC(y, mo - 1, d) - Date.UTC(p.y, p.mo - 1, p.d)) / 86400000,
    );
    const minDiff = h * 60 + mi - (p.h * 60 + p.mi);
    if (dayDiff === 0 && minDiff === 0) {
      return t;
    }
    t += (dayDiff * 24 * 60 + minDiff) * 60 * 1000;
  }
  return t;
}

type FullDateDerived =
  | { kind: 'no_full_date_periods' }
  | { kind: 'open'; closeMinutes: number; closeUtcMs: number };

/** When periods include open.date + close.date, use true instants: open <= now < close */
function deriveFromFullDates(
  openingHours: OpeningHours,
  timeZone: string,
  nowMs: number,
): FullDateDerived {
  const periods = openingHours.periods ?? [];
  const datePeriods = periods.filter(
    (p) =>
      getPeriodYmd(p.open) != null &&
      getPeriodYmd(p.close) != null &&
      getCloseTime(p) != null,
  );
  if (datePeriods.length === 0) {
    return { kind: 'no_full_date_periods' };
  }

  for (const p of datePeriods) {
    const openYmd = getPeriodYmd(p.open)!;
    const closeYmd = getPeriodYmd(p.close)!;
    const closeMin = getCloseTime(p)!;
    const openMin = getOpenTime(p);
    const openMs = zonedYmdMinutesToUtcMs(openYmd, openMin, timeZone);
    const closeMs = zonedYmdMinutesToUtcMs(closeYmd, closeMin, timeZone);
    if (nowMs >= openMs && nowMs < closeMs) {
      return {
        kind: 'open',
        closeMinutes: closeMin,
        closeUtcMs: closeMs,
      };
    }
  }
  // Dated windows exist but none contain "now" (e.g. future exception hours) — fall back to weekday logic.
  return { kind: 'no_full_date_periods' };
}

function formatCloseTime(closeTime: number): string {
  const closeHour = Math.floor(closeTime / 60);
  const closeMin = closeTime % 60;
  if (closeHour === 0 && closeMin === 0) {
    return '12:00am';
  }
  return closeHour >= 12
    ? `${closeHour === 12 ? 12 : closeHour - 12}:${closeMin.toString().padStart(2, '0')}pm`
    : `${closeHour}:${closeMin.toString().padStart(2, '0')}am`;
}

type MatchKind = 'open_day' | 'close_day_carryover';

export function deriveOpeningState(
  openingHours: OpeningHours | null,
  timezone: string | null,
): {
  open_now: boolean;
  closes_at: string | null;
  closing_soon: boolean;
  open_late: boolean;
} {
  const tz = timezone ?? DEFAULT_TZ;
  const now = getTodayInTz(tz);
  const nowMinutes = now.hour * 60 + now.minute;
  const nowMs = Date.now();
  const CLOSING_SOON_MINUTES = 45;
  const OPEN_LATE_THRESHOLD_MINUTES = 22 * 60;

  const result = {
    open_now: false,
    closes_at: null as string | null,
    closing_soon: false,
    open_late: false,
  };

  if (!openingHours?.periods?.length) {
    return result;
  }

  const full = deriveFromFullDates(openingHours, tz, nowMs);
  if (full.kind === 'open') {
    result.open_now = true;
    result.closes_at = formatCloseTime(full.closeMinutes);
    const minsUntilClose = (full.closeUtcMs - nowMs) / 60000;
    if (minsUntilClose <= CLOSING_SOON_MINUTES && minsUntilClose >= 0) {
      result.closing_soon = true;
    }
    if (
      full.closeMinutes >= OPEN_LATE_THRESHOLD_MINUTES ||
      full.closeMinutes < 6 * 60
    ) {
      result.open_late = true;
    }
    return result;
  }

  const openDay = (p: OpeningPeriod) => {
    const d = p.open?.day;
    return typeof d === 'number' ? d : undefined;
  };
  const closeDay = (p: OpeningPeriod) => {
    const d = p.close?.day;
    return typeof d === 'number' ? d : undefined;
  };

  /** True when close is early morning (end of overnight) vs a mistaken Mon→Tue “6pm” span. */
  function overnightCarryoverClose(openTime: number, closeTime: number): boolean {
    return closeTime < openTime || closeTime < 12 * 60;
  }

  let matchKind: MatchKind | null = null;
  let openTime = 0;
  let closeTimeRaw = 0;
  let closesNextDayForMatch = false;

  // 1) Overnight tail: e.g. Sun 7:30 AM–Mon 2:00 AM → still open Mon 1:00 AM (before Mon 2:00).
  for (const p of openingHours.periods) {
    const oDay = openDay(p);
    const cDay = closeDay(p);
    const closeT = getCloseTime(p);
    const openT = getOpenTime(p);
    if (
      closeT == null ||
      oDay === undefined ||
      cDay === undefined ||
      cDay !== now.day ||
      oDay === cDay
    ) {
      continue;
    }
    if (!overnightCarryoverClose(openT, closeT)) {
      continue;
    }
    if (nowMinutes < closeT) {
      matchKind = 'close_day_carryover';
      openTime = openT;
      closeTimeRaw = closeT;
      closesNextDayForMatch = true;
      break;
    }
  }

  // 2) Same-day windows; try every period for this weekday (not only the first).
  if (!matchKind) {
    for (const p of openingHours.periods) {
      const oDay = openDay(p);
      const closeT = getCloseTime(p);
      const openT = getOpenTime(p);
      if (closeT == null || oDay !== now.day) {
        continue;
      }
      const closesNextDay =
        closeT < openT ||
        (p.close?.day != null &&
          p.open?.day != null &&
          p.close.day !== p.open.day);
      let isOpen = false;
      if (closesNextDay) {
        isOpen = nowMinutes >= openT;
      } else {
        isOpen = nowMinutes >= openT && nowMinutes < closeT;
      }
      if (isOpen) {
        matchKind = 'open_day';
        openTime = openT;
        closeTimeRaw = closeT;
        closesNextDayForMatch = closesNextDay;
        break;
      }
    }
  }

  if (!matchKind) {
    return result;
  }

  result.open_now = true;
  result.closes_at = formatCloseTime(closeTimeRaw);

  let minsUntilClose: number;
  if (matchKind === 'close_day_carryover') {
    minsUntilClose = closeTimeRaw - nowMinutes;
  } else if (closesNextDayForMatch) {
    minsUntilClose = 24 * 60 - nowMinutes + closeTimeRaw;
  } else {
    minsUntilClose = closeTimeRaw - nowMinutes;
  }
  if (minsUntilClose <= CLOSING_SOON_MINUTES && minsUntilClose >= 0) {
    result.closing_soon = true;
  }

  if (closeTimeRaw >= OPEN_LATE_THRESHOLD_MINUTES || closeTimeRaw < 6 * 60) {
    result.open_late = true;
  }

  return result;
}

export function hasOpenLate(openingHours: OpeningHours | null, timezone: string | null): boolean {
  if (!openingHours?.periods?.length) return false;
  const OPEN_LATE_MINUTES = 22 * 60;
  const tz = timezone ?? DEFAULT_TZ;
  const full = deriveFromFullDates(openingHours, tz, Date.now());
  if (full.kind === 'open') {
    return full.closeMinutes >= OPEN_LATE_MINUTES;
  }
  for (const p of openingHours.periods) {
    const closeTime = getCloseTime(p);
    if (closeTime != null && closeTime >= OPEN_LATE_MINUTES) return true;
  }
  return false;
}
