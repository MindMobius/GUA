export function parseList(raw: string | undefined): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  const content =
    trimmed.startsWith("[") && trimmed.endsWith("]") ? trimmed.slice(1, Math.max(1, trimmed.length - 1)) : trimmed;
  return content
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function parseBool(raw: string | undefined, fallback: boolean) {
  if (!raw) return fallback;
  const v = raw.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  if (v === "1" || v === "true" || v === "on" || v === "yes") return true;
  return fallback;
}

