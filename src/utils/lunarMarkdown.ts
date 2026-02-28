"use client";

import { Lunar } from "lunar-javascript";

function safeCall(target: Record<string, unknown>, key: string) {
  const fn = target[key];
  if (typeof fn !== "function") return null;
  try {
    return fn.call(target);
  } catch {
    return null;
  }
}

function formatValue(value: unknown) {
  if (typeof value === "string") return `\`${value}\``;
  if (typeof value === "number" || typeof value === "boolean") return `\`${String(value)}\``;
  if (value instanceof Date) return `\`${value.toISOString()}\``;
  if (typeof value === "object" && value) {
    try {
      const json = JSON.stringify(value);
      if (!json) return "";
      return `\`${json.length > 160 ? `${json.slice(0, 160)}…` : json}\``;
    } catch {
      return `\`${String(value)}\``;
    }
  }
  return "";
}

function collectNoArgMethods(target: Record<string, unknown>, title: string) {
  const lines: string[] = [];
  const proto = Object.getPrototypeOf(target);
  const keys = new Set<string>([
    ...Object.keys(target),
    ...(proto ? Object.getOwnPropertyNames(proto) : []),
  ]);
  lines.push(`### ${title}`);
  for (const key of Array.from(keys).sort((a, b) => a.localeCompare(b))) {
    if (key === "constructor") continue;
    if (key.startsWith("_")) continue;
    const value = (target as Record<string, unknown>)[key];
    if (typeof value !== "function") continue;
    if (value.length > 0) continue;
    const out = safeCall(target, key);
    if (out === undefined || out === null) continue;
    const rendered = formatValue(out);
    if (!rendered) continue;
    lines.push(`- **${key}**: ${rendered}`);
  }
  return lines;
}

export function buildLunarLines(date: Date) {
  const lunar = Lunar.fromDate(date) as unknown as Record<string, unknown>;
  const lines: string[] = ["", ""];
  lines.push(...collectNoArgMethods(lunar, "Lunar"));
  const solar = safeCall(lunar, "getSolar");
  if (solar) {
    lines.push("", "### Solar");
    lines.push(...collectNoArgMethods(solar, "Solar"));
  }
  const lunarYear = safeCall(lunar, "getYear");
  if (lunarYear) {
    lines.push("", "### LunarYear");
    lines.push(...collectNoArgMethods(lunarYear, "LunarYear"));
  }
  const lunarMonth = safeCall(lunar, "getMonth");
  if (lunarMonth) {
    lines.push("", "### LunarMonth");
    lines.push(...collectNoArgMethods(lunarMonth, "LunarMonth"));
  }
  const lunarDay = safeCall(lunar, "getDay");
  if (lunarDay) {
    lines.push("", "### LunarDay");
    lines.push(...collectNoArgMethods(lunarDay, "LunarDay"));
  }
  const lunarTime = safeCall(lunar, "getTime");
  if (lunarTime) {
    lines.push("", "### LunarTime");
    lines.push(...collectNoArgMethods(lunarTime, "LunarTime"));
  }
  return lines;
}

export function streamLines(lines: string[], traceVisible: number, traceTotal: number, phase: string) {
  if (phase === "result") return lines.join("\n");
  if (lines.length === 0) return "";
  const ratio = traceTotal > 0 ? traceVisible / traceTotal : 0;
  const count = Math.max(1, Math.floor(lines.length * ratio));
  return lines.slice(0, count).join("\n");
}

