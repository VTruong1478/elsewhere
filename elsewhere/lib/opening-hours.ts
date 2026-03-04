const DEFAULT_TZ = 'America/New_York';

type OpeningPeriod = {
  open?: { day: number; time?: string };
  close?: { day: number; time?: string };
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
  let day = 0;
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  day = dayNames.indexOf(weekday);
  if (day === -1) day = 0;
  return { day, hour, minute };
}

function parseTime(t: string): number {
  if (!t) return 0;
  const h = parseInt(t.slice(0, 2), 10);
  const m = parseInt(t.slice(2, 4), 10);
  return h * 60 + m;
}

function parseCloseTime(period: OpeningPeriod): number | null {
  if (!period.close) return null;
  const t = period.close.time;
  if (!t) return null;
  return parseTime(t);
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

  const todayPeriod = openingHours.periods.find(
    (p) => p.open?.day === now.day || (p.open?.day === undefined && p.close?.day === now.day)
  );
  if (!todayPeriod) {
    return result;
  }

  const openTime = todayPeriod.open?.time ? parseTime(todayPeriod.open.time) : 0;
  const closeTime = parseCloseTime(todayPeriod);
  if (closeTime == null) {
    return result;
  }

  result.open_now = nowMinutes >= openTime && nowMinutes < closeTime;
  const closeHour = Math.floor(closeTime / 60);
  const closeMin = closeTime % 60;
  result.closes_at =
    closeHour >= 12
      ? `${closeHour === 12 ? 12 : closeHour - 12}:${closeMin.toString().padStart(2, '0')}pm`
      : `${closeHour}:${closeMin.toString().padStart(2, '0')}am`;

  if (result.open_now && closeTime - nowMinutes <= CLOSING_SOON_MINUTES) {
    result.closing_soon = true;
  }
  if (closeTime >= OPEN_LATE_THRESHOLD_MINUTES || closeTime < 6 * 60) {
    result.open_late = true;
  }

  return result;
}

export function hasOpenLate(openingHours: OpeningHours | null, timezone: string | null): boolean {
  const tz = timezone ?? DEFAULT_TZ;
  if (!openingHours?.periods?.length) return false;
  const OPEN_LATE_MINUTES = 22 * 60;
  for (const p of openingHours.periods) {
    const closeTime = parseCloseTime(p);
    if (closeTime != null && closeTime >= OPEN_LATE_MINUTES) return true;
  }
  return false;
}
