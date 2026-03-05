const DEFAULT_TZ = 'America/New_York';

/** Supports both legacy (time: "0900") and Places API New (hour, minute) */
type PeriodEnd = {
  day?: number;
  time?: string;
  hour?: number;
  minute?: number;
};

type OpeningPeriod = {
  open?: PeriodEnd;
  close?: PeriodEnd;
};

type OpeningHours = {
  weekday_text?: string[];
  periods?: OpeningPeriod[];
};

function getTodayInTz(timezone: string = DEFAULT_TZ): { day: number; hour: number; minute: number } {
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

/** Get minutes since midnight from period end (open or close). Supports time string or hour+minute (Places API New). */
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

function formatCloseTime(closeTime: number): string {
  const closeHour = Math.floor(closeTime / 60);
  const closeMin = closeTime % 60;
  return closeHour >= 12
    ? `${closeHour === 12 ? 12 : closeHour - 12}:${closeMin.toString().padStart(2, '0')}pm`
    : `${closeHour}:${closeMin.toString().padStart(2, '0')}am`;
}

export function deriveOpeningState(
  openingHours: OpeningHours | null,
  timezone: string | null
): {
  open_now: boolean;
  closes_at: string | null;
  closing_soon: boolean;
  open_late: boolean;
} {
  const tz = timezone ?? DEFAULT_TZ;
  const now = getTodayInTz(tz);
  const nowMinutes = now.hour * 60 + now.minute;
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

  const openDay = (p: OpeningPeriod) => {
    const d = p.open?.day;
    return typeof d === 'number' ? d : undefined;
  };
  const closeDay = (p: OpeningPeriod) => {
    const d = p.close?.day;
    return typeof d === 'number' ? d : undefined;
  };

  let todayPeriod: OpeningPeriod | undefined;
  let isOvernightIntoToday = false;

  for (const p of openingHours.periods) {
    const oDay = openDay(p);
    const cDay = closeDay(p);
    if (oDay === now.day) {
      todayPeriod = p;
      isOvernightIntoToday = cDay !== undefined && cDay !== now.day;
      break;
    }
    if (cDay === now.day && oDay !== undefined && oDay !== now.day) {
      todayPeriod = p;
      isOvernightIntoToday = true;
      break;
    }
  }

  if (!todayPeriod) {
    return result;
  }

  const openTime = getOpenTime(todayPeriod);
  const closeTimeRaw = getCloseTime(todayPeriod);
  if (closeTimeRaw == null) {
    return result;
  }

  const closesNextDay =
    closeTimeRaw < openTime ||
    (todayPeriod.close?.day != null &&
      todayPeriod.open?.day != null &&
      todayPeriod.close.day !== todayPeriod.open.day);

  if (isOvernightIntoToday && closesNextDay) {
    result.open_now = nowMinutes < closeTimeRaw;
  } else if (closesNextDay) {
    result.open_now = nowMinutes >= openTime;
  } else {
    result.open_now = nowMinutes >= openTime && nowMinutes < closeTimeRaw;
  }

  result.closes_at = formatCloseTime(closeTimeRaw);

  if (result.open_now) {
    const minsUntilClose = isOvernightIntoToday && nowMinutes < closeTimeRaw
      ? closeTimeRaw - nowMinutes
      : closesNextDay && nowMinutes >= openTime
        ? (24 * 60 - nowMinutes) + closeTimeRaw
        : closeTimeRaw - nowMinutes;
    if (minsUntilClose <= CLOSING_SOON_MINUTES && minsUntilClose >= 0) {
      result.closing_soon = true;
    }
  }

  if (closeTimeRaw >= OPEN_LATE_THRESHOLD_MINUTES || closeTimeRaw < 6 * 60) {
    result.open_late = true;
  }

  return result;
}

export function hasOpenLate(openingHours: OpeningHours | null, timezone: string | null): boolean {
  if (!openingHours?.periods?.length) return false;
  const OPEN_LATE_MINUTES = 22 * 60;
  for (const p of openingHours.periods) {
    const closeTime = getCloseTime(p);
    if (closeTime != null && closeTime >= OPEN_LATE_MINUTES) return true;
  }
  return false;
}
