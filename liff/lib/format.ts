import { config } from './config';
import type { Locale } from './types';

const yenFormat = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' });
export const yen = (value: number) => yenFormat.format(value);

/** A visit's start in Tokyo time, e.g. "10月10日(土) 14:00" or "Sat 10 Oct, 14:00". */
export const visitTime = (iso: string, locale: Locale) =>
  new Intl.DateTimeFormat(locale === 'ja' ? 'ja-JP' : 'en-GB', {
    timeZone: 'Asia/Tokyo',
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));

/** Strapi media URLs are absolute when server.url is set; relative ones get the Strapi origin. */
export const mediaUrl = (url: string | null | undefined): string | null =>
  !url ? null : /^https?:\/\//.test(url) ? url : `${config.strapiUrl}${url}`;

const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** The next Saturday at least two days away (YYYY-MM-DD): the booking sheet's default. */
export const nextSaturday = (from = new Date()): string => {
  const date = new Date(from);
  const ahead = (6 - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + (ahead < 2 ? ahead + 7 : ahead));
  return isoDay(date);
};

export const tomorrow = (from = new Date()): string => {
  const date = new Date(from);
  date.setDate(date.getDate() + 1);
  return isoDay(date);
};

/** Half-hour start times from opening until 30 minutes before closing. */
export const timeSlots = (opens: string, closes: string): string[] => {
  const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  const slots: string[] = [];
  for (let m = minutes(opens); m <= minutes(closes) - 30; m += 30) slots.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  return slots;
};

/** Whether a YYYY-MM-DD is on the calendar, the same rule as the Maison tools. A cleared date input gives ''. */
export const isRealDate = (value: string): boolean => {
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) return false;
  return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
};
