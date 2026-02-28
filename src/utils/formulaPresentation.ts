"use client";

import type { DivinationTraceEvent } from "@/utils/divinationEngine";
import type { FormulaParam } from "@/utils/formulaEngine";
import { buildFormulaData } from "@/utils/formulaEngine";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function maskNumbers(latex: string) {
  let index = 0;
  return latex.replace(/\d+(\.\d+)?/g, () => {
    index += 1;
    return `c_{${index}}`;
  });
}

function formatEventData(data: Record<string, string | number>) {
  const keys = Object.keys(data);
  if (keys.length === 0) return "";
  const ordered = keys.sort((a, b) => a.localeCompare(b));
  const payload = ordered.map((k) => `${k}=${String(data[k])}`).join(" · ");
  return ` \`${payload}\``;
}

export function buildFormulaMarkdown(
  data: ReturnType<typeof buildFormulaData> | null,
  traceVisible: number,
  traceTotal: number,
  phase: string,
) {
  if (!data) return ["", "", "$$", "\\square", "$$"].join("\n");
  const stepIndex =
    traceTotal > 0 ? Math.min(data.steps.length - 1, Math.floor((traceVisible / traceTotal) * data.steps.length)) : 0;
  const rawLatex = phase === "computing" ? data.steps[Math.max(0, stepIndex)] ?? data.latex : data.latex;
  const latex = phase === "computing" ? maskNumbers(rawLatex) : rawLatex;
  return ["", "", "$$", latex, "$$"].join("\n");
}

export function buildResultLatex(data: ReturnType<typeof buildFormulaData> | null) {
  if (!data) return null;
  const omega = data.params.find((p) => p.key === "Ω");
  if (!omega?.value) return null;
  const parts = data.latex.split("=");
  const right = parts.slice(1).join("=").trim();
  if (!right) return null;
  let expr = right;
  for (const param of data.params) {
    if (!param.latex || !param.value) continue;
    if (param.key === "Ω") continue;
    const token = escapeRegExp(param.latex);
    expr = expr.replace(new RegExp(token, "g"), `\\left(${param.value}\\right)`);
  }
  return `${expr} = ${omega.value}`;
}

export function buildProgressiveParams(params: FormulaParam[], phase: string, traceVisible: number, traceTotal: number) {
  if (params.length === 0) return [];
  if (phase === "result") return params;
  const base = params.filter((p) => p.key !== "Ω");
  const ratio = traceTotal > 0 ? traceVisible / traceTotal : 0;
  const revealCount = Math.max(0, Math.min(base.length, Math.floor(ratio * base.length)));
  let revealed = 0;
  return params.map((p) => {
    if (p.key === "Ω") return { ...p, value: "\\square" };
    if (revealed < revealCount) {
      revealed += 1;
      return p;
    }
    return { ...p, value: "\\square" };
  });
}

export function buildScienceMarkdown(events: DivinationTraceEvent[]) {
  if (events.length === 0) {
    return "## 现代块\n\n等待推演信号...";
  }
  const lines: string[] = ["", ""];
  let currentPhase = "";
  for (const evt of events) {
    if (evt.phase !== currentPhase) {
      currentPhase = evt.phase;
      lines.push(`### ${currentPhase}`);
    }
    const data = evt.data ? formatEventData(evt.data) : "";
    if (evt.kind === "group_start") {
      lines.push(`- **${evt.message}**${data}`);
    } else if (evt.kind === "event") {
      lines.push(`- ${evt.message}${data}`);
    }
  }
  return lines.join("\n");
}

