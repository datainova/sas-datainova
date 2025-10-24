import { DateTime } from "luxon";
import { PeriodGranularity } from "@prisma/client";

export const normalizePeriodStart = (
  input: string,
  granularity: PeriodGranularity,
  timezone: string
): Date => {
  const date = DateTime.fromISO(input, { zone: "utc" });
  if (!date.isValid) {
    throw new Error("invalid_period_start");
  }

  const localized = date.setZone(timezone);
  let normalized: DateTime;

  switch (granularity) {
    case PeriodGranularity.DAY:
      normalized = localized.startOf("day");
      break;
    case PeriodGranularity.WEEK:
      normalized = localized.startOf("week");
      break;
    case PeriodGranularity.MONTH:
      normalized = localized.startOf("month");
      break;
    case PeriodGranularity.QUARTER:
      normalized = localized.startOf("quarter");
      break;
    case PeriodGranularity.YEAR:
      normalized = localized.startOf("year");
      break;
    default:
      normalized = localized;
  }

  return normalized.toUTC().toJSDate();
};

export const isPeriodAligned = (
  input: string,
  granularity: PeriodGranularity,
  timezone: string
) => {
  try {
    const normalized = normalizePeriodStart(input, granularity, timezone);
    const originalUtc = DateTime.fromISO(input, { zone: "utc" });
    return normalized.getTime() === originalUtc.toJSDate().getTime();
  } catch {
    return false;
  }
};

export const parseDateRange = (range?: string) => {
  if (!range) {
    return null;
  }

  const [from, to] = range.split("..");
  if (!from || !to) {
    throw new Error("invalid_range");
  }

  const fromDate = DateTime.fromISO(from, { zone: "utc" });
  const toDate = DateTime.fromISO(to, { zone: "utc" });

  if (!fromDate.isValid || !toDate.isValid) {
    throw new Error("invalid_range");
  }

  if (toDate < fromDate) {
    throw new Error("invalid_range");
  }

  return {
    from: fromDate.toJSDate(),
    to: toDate.toJSDate(),
  };
};
