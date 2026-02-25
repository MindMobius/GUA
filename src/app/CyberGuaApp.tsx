"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Box,
  Button,
  Container,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { Lunar } from "lunar-javascript";
import { StreamingPanels } from "@/components/StreamingPanels";
import type { DivinationResult, DivinationTraceEvent } from "@/utils/divinationEngine";
import { divineWithTrace } from "@/utils/divinationEngine";
import { buildFormulaData } from "@/utils/formulaEngine";

type Phase = "input" | "computing" | "result";

function toDatetimeLocalValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseDatetimeLocalValue(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date();
  return d;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mix32(seed: number, n: number) {
  let x = (seed ^ n) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x >>> 0;
}

export default function CyberGuaApp() {
  const [phase, setPhase] = useState<Phase>("input");
  const [question, setQuestion] = useState("");
  const [nickname, setNickname] = useState("");

  const [datetimeValue, setDatetimeValue] = useState(() => toDatetimeLocalValue(new Date()));
  const datetime = useMemo(() => parseDatetimeLocalValue(datetimeValue), [datetimeValue]);

  const [result, setResult] = useState<DivinationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trace, setTrace] = useState<DivinationTraceEvent[]>([]);
  const [traceVisible, setTraceVisible] = useState(0);
  const [formulaSeed, setFormulaSeed] = useState<number | null>(null);

  const runIdRef = useRef(0);

  const entropyRef = useRef({
    seed: 0x12345678,
    lastT: 0,
    lastX: 0,
    lastY: 0,
    has: false,
  });

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const now = performance.now();
      const st = entropyRef.current;
      const x = Math.floor(e.clientX);
      const y = Math.floor(e.clientY);
      if (!st.has) {
        st.has = true;
        st.lastT = now;
        st.lastX = x;
        st.lastY = y;
        st.seed = mix32(st.seed, (x << 16) ^ y);
        return;
      }

      const dt = Math.max(1, Math.floor(now - st.lastT));
      const dx = x - st.lastX;
      const dy = y - st.lastY;
      st.lastT = now;
      st.lastX = x;
      st.lastY = y;

      const speed = Math.min(4095, Math.floor(Math.sqrt(dx * dx + dy * dy) * 64));
      const sample = ((dt & 0xfff) << 20) ^ ((speed & 0xfff) << 8) ^ ((dx & 0xf) << 4) ^ (dy & 0xf);
      st.seed = mix32(st.seed, sample >>> 0);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  const onStart = async () => {
    const q = question.trim();
    if (!q) {
      setError("所问之事不可为空。");
      return;
    }

    setError(null);
    setPhase("computing");
    const entropy = (entropyRef.current.seed ^ Date.now()) >>> 0;
    setTrace([]);
    setTraceVisible(0);
    setFormulaSeed(entropy);

    const runId = (runIdRef.current += 1);
    try {
      const { result: res, trace: steps } = await Promise.resolve().then(() =>
        divineWithTrace(
          {
            question: q,
            datetime,
            nickname: nickname.trim() ? nickname.trim() : undefined,
          },
          entropy,
        ),
      );

      if (runIdRef.current !== runId) return;
      setTrace(steps);

      const totalMs = 20000;
      const baseDelay = Math.floor(totalMs / Math.max(1, steps.length));
      for (let i = 0; i < steps.length; i += 1) {
        if (runIdRef.current !== runId) return;
        setTraceVisible(i + 1);
        const phaseBoost =
          steps[i]?.phase === "易经" ? 180 : steps[i]?.phase === "融合" ? 140 : steps[i]?.phase === "裁决" ? 220 : 0;
        const jitter = Math.floor(((mix32(entropy, i + 31) >>> 0) % 160) - 80);
        await sleep(Math.max(18, baseDelay + phaseBoost + jitter));
      }

      if (runIdRef.current !== runId) return;
      await sleep(260);

      setResult(res);
      setPhase("result");
    } catch (e) {
      setError(e instanceof Error ? e.message : "推演失败，请重试。");
      setPhase("input");
    }
  };

  const onReset = () => {
    runIdRef.current += 1;
    setResult(null);
    setError(null);
    setTrace([]);
    setTraceVisible(0);
    setQuestion("");
    setNickname("");
    setDatetimeValue(toDatetimeLocalValue(new Date()));
    setPhase("input");
    setFormulaSeed(null);
  };

  const canStart = question.trim().length > 0 && phase === "input";
  const shortcutHint = "Ctrl/⌘ + Enter";

  const phaseTerms = useMemo(() => {
    const terms = Array.from(new Set(trace.map((item) => item.phase).filter(Boolean)));
    return terms.length > 0 ? terms : ["易经", "融合", "裁决"];
  }, [trace]);
  const formulaData = useMemo(() => {
    if (formulaSeed === null) return null;
    return buildFormulaData(formulaSeed, phaseTerms);
  }, [formulaSeed, phaseTerms]);
  const formulaMarkdown = useMemo(() => {
    return buildFormulaMarkdown(formulaData, traceVisible, trace.length, phase);
  }, [formulaData, traceVisible, trace.length, phase]);
  const formulaParams = useMemo(() => {
    if (phase !== "result") return [];
    return formulaData?.params ?? [];
  }, [formulaData, phase]);
  const scienceMarkdown = useMemo(() => {
    const slice = phase === "result" ? trace : trace.slice(0, traceVisible);
    return buildScienceMarkdown(slice);
  }, [phase, trace, traceVisible]);
  const lunarLines = useMemo(() => buildLunarLines(datetime), [datetime]);
  const lunarMarkdown = useMemo(() => {
    return streamLines(lunarLines, traceVisible, trace.length, phase);
  }, [lunarLines, traceVisible, trace.length, phase]);
  const phaseLabels = ["输入", "推演", "归一"];
  const phaseIndex = phase === "input" ? 0 : phase === "computing" ? 1 : 2;

  return (
    <Box className="gua-bg" mih="100dvh">
      <Container size="sm" py={64}>
        <Stack gap={32}>
          <Stack gap={10} align="center" className="gua-hero">
            <Badge variant="outline" color="gray" radius="xl" size="lg" className="gua-mark">
              GUA
            </Badge>
            <Title order={1} className="gua-title" fw={600}>
              赛博算卦
            </Title>
            <Text fz="sm" className="gua-subtitle">
              输入极简 · 过程极繁 · 输出极决
            </Text>
          </Stack>

          <Stack gap={8} className="gua-phase">
            <Group justify="space-between" className="gua-phase-labels">
              {phaseLabels.map((label, index) => (
                <Text key={label} fz="xs" className={index <= phaseIndex ? "gua-phase-active" : "gua-phase-idle"}>
                  {label}
                </Text>
              ))}
            </Group>
            <Box className="gua-stepper">
              {phaseLabels.map((label, index) => (
                <Box key={label} className={index <= phaseIndex ? "gua-step gua-step-active" : "gua-step"} />
              ))}
            </Box>
            <Text fz="xs" className="gua-phase-current">
              当前阶段 · {phaseLabels[phaseIndex]}
            </Text>
          </Stack>

          {phase === "input" ? (
            <Paper radius="md" p="xl" className="gua-panel">
              <Stack gap="md">
                <Group justify="space-between" align="center">
                  <Text fw={600} className="gua-section-title">
                    起卦输入
                  </Text>
                  <Badge variant="light" color="gray" radius="md" className="gua-chip">
                    步骤 1/3
                  </Badge>
                </Group>
                <Text className="gua-section-sub">写下所问之事，余者交给推演。结果只给一条公式。</Text>

                <Textarea
                  label="所问之事"
                  placeholder="例如：这次面试能过吗"
                  value={question}
                  onChange={(e) => setQuestion(e.currentTarget.value)}
                  autosize
                  minRows={3}
                  maxRows={6}
                  maxLength={120}
                  description={
                    <Text component="span" fz="xs" className="gua-hint">
                      {Math.min(120, question.length)}/120
                    </Text>
                  }
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") onStart();
                  }}
                />

                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  <TextInput
                    label="起卦时间"
                    type="datetime-local"
                    value={datetimeValue}
                    onChange={(e) => setDatetimeValue(e.currentTarget.value)}
                  />
                  <TextInput
                    label="求测人称呼（可选）"
                    placeholder="例如：阿祈"
                    value={nickname}
                    onChange={(e) => setNickname(e.currentTarget.value)}
                    maxLength={24}
                  />
                </SimpleGrid>

                {error ? (
                  <Alert color="gray" variant="light" radius="md" className="gua-alert">
                    {error}
                  </Alert>
                ) : null}

                <Group justify="space-between" align="center" className="gua-input-actions">
                  <Text fz="xs" className="gua-hint">
                    {shortcutHint}
                  </Text>
                  <Button radius="xl" size="md" onClick={onStart} disabled={!canStart}>
                    起卦
                  </Button>
                </Group>
              </Stack>
            </Paper>
          ) : null}

          {phase === "computing" ? (
            <StreamingPanels
              formulaMarkdown={formulaMarkdown}
              formulaParams={formulaParams}
              scienceMarkdown={scienceMarkdown}
              lunarMarkdown={lunarMarkdown}
            />
          ) : null}

          {phase === "result" && result ? (
            <Stack gap="lg">
              <StreamingPanels
                formulaMarkdown={formulaMarkdown}
                formulaParams={formulaParams}
                scienceMarkdown={scienceMarkdown}
                lunarMarkdown={lunarMarkdown}
              />
              <Button fullWidth radius="xl" size="md" onClick={onReset} variant="default">
                再卜一次
              </Button>
            </Stack>
          ) : null}

          <Text ta="center" fz="xs" className="gua-footer">
            本项目仅供娱乐与传统文化研究，切勿迷信。
          </Text>
        </Stack>
      </Container>
    </Box>
  );
}

function buildFormulaMarkdown(
  data: ReturnType<typeof buildFormulaData> | null,
  traceVisible: number,
  traceTotal: number,
  phase: Phase,
) {
  if (!data) return ["", "", "$$", "\\square", "$$"].join("\n");
  const stepIndex =
    traceTotal > 0 ? Math.min(data.steps.length - 1, Math.floor((traceVisible / traceTotal) * data.steps.length)) : 0;
  const rawLatex = phase === "computing" ? data.steps[Math.max(0, stepIndex)] ?? data.latex : data.latex;
  const latex = phase === "computing" ? maskNumbers(rawLatex) : rawLatex;
  return ["", "", "$$", latex, "$$"].join("\n");
}

function maskNumbers(latex: string) {
  let index = 0;
  return latex.replace(/\d+(\.\d+)?/g, () => {
    index += 1;
    return `c_{${index}}`;
  });
}

function buildScienceMarkdown(events: DivinationTraceEvent[]) {
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

function formatEventData(data: Record<string, string | number>) {
  const keys = Object.keys(data);
  if (keys.length === 0) return "";
  const ordered = keys.sort((a, b) => a.localeCompare(b));
  const payload = ordered.map((k) => `${k}=${String(data[k])}`).join(" · ");
  return ` \`${payload}\``;
}

function buildLunarLines(date: Date) {
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

function streamLines(lines: string[], traceVisible: number, traceTotal: number, phase: Phase) {
  if (phase === "result") return lines.join("\n");
  if (lines.length === 0) return "";
  const ratio = traceTotal > 0 ? traceVisible / traceTotal : 0;
  const count = Math.max(1, Math.floor(lines.length * ratio));
  return lines.slice(0, count).join("\n");
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
