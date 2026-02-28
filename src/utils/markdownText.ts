"use client";

export function unwrapOuterMarkdownFence(markdown: string) {
  const s = typeof markdown === "string" ? markdown.trim() : "";
  const m = s.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/);
  if (m && typeof m[1] === "string") return m[1];
  return typeof markdown === "string" ? markdown : "";
}

export function normalizeMarkdownLatexEscapes(markdown: string) {
  return markdown.replace(
    /\\\\(left|right|Omega|Phi|alpha|beta|gamma|epsilon|sigma|theta|pi|infty|lim|to|times|cdot|tanh|sin|cos|log|exp|frac|sqrt|hat)\b/g,
    "\\$1",
  );
}

export function previewFromMarkdown(markdown: string) {
  const raw = unwrapOuterMarkdownFence(markdown || "");
  const lines = raw.split("\n").map((x) => x.trim());
  const line = lines.find((x) => x && !x.startsWith("#") && !x.startsWith(">")) ?? "";
  if (!line) return "";
  return line.length > 120 ? `${line.slice(0, 120)}…` : line;
}

