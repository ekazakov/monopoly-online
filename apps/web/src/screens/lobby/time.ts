import { useEffect, useState } from "react";
import type { Translate } from "../../i18n/index.ts";

/** "just now", "5 min ago", "3 h ago", "2 d ago". A time in the future reads as "just now". */
export function timeAgo(iso: string, now: number, t: Translate): string {
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000);
  if (!(minutes >= 1)) return t("time.justNow");
  if (minutes < 60) return t("time.minutesAgo", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("time.hoursAgo", { count: hours });
  return t("time.daysAgo", { count: Math.floor(hours / 24) });
}

/** The current time in ms, refreshed every `everyMs`, so "2 min ago" stays right. */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}
