"use client";

export function toDatetimeLocalValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function parseDatetimeLocalValue(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date(0);
  return d;
}

export function formatIsoMinute(value: string | number) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const iso = d.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}Z`;
}

