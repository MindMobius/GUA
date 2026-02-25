"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Container,
  Group,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { Lunar } from "lunar-javascript";
import { StreamingPanels } from "@/components/StreamingPanels";
import { MarkdownStream } from "@/components/MarkdownStream";
import type { DivinationResult, DivinationTraceEvent } from "@/utils/divinationEngine";
import { divineWithTrace } from "@/utils/divinationEngine";
import { buildFormulaData, type FormulaParam } from "@/utils/formulaEngine";

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
  const [runPhase, setRunPhase] = useState<Phase>("input");
  const [activeTab, setActiveTab] = useState<Phase>("input");
  const [isRunning, setIsRunning] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
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

    runIdRef.current += 1;
    const runId = runIdRef.current;
    setError(null);
    setIsRunning(true);
    setRunPhase("computing");
    setActiveTab("computing");
    const entropy = (entropyRef.current.seed ^ Date.now()) >>> 0;
    setResult(null);
    setTrace([]);
    setTraceVisible(0);
    setFormulaSeed(entropy);
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
      setRunPhase("result");
      setIsRunning(false);
      setActiveTab("result");
    } catch (e) {
      setError(e instanceof Error ? e.message : "推演失败，请重试。");
      setIsRunning(false);
      setRunPhase("input");
      setActiveTab("input");
      setFormulaSeed(null);
    }
  };

  const onTerminate = () => {
    if (!isRunning) return;
    runIdRef.current += 1;
    setIsRunning(false);
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
    setRunPhase("input");
    setActiveTab("input");
    setFormulaSeed(null);
    setIsRunning(false);
  };

  const canStart = question.trim().length > 0;
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
    return buildFormulaMarkdown(formulaData, traceVisible, trace.length, runPhase);
  }, [formulaData, traceVisible, trace.length, runPhase]);
  const formulaParams = useMemo(() => {
    return formulaData?.params ?? [];
  }, [formulaData]);
  const progressiveParams = useMemo(() => {
    return buildProgressiveParams(formulaParams, runPhase, traceVisible, trace.length);
  }, [formulaParams, runPhase, traceVisible, trace.length]);
  const resultMarkdown = useMemo(() => {
    const latex = buildResultLatex(formulaData);
    if (!latex) return ["", "", "$$", "\\square", "$$"].join("\n");
    return ["", "", "$$", latex, "$$"].join("\n");
  }, [formulaData]);
  const scienceMarkdown = useMemo(() => {
    const slice = runPhase === "result" ? trace : trace.slice(0, traceVisible);
    return buildScienceMarkdown(slice);
  }, [runPhase, trace, traceVisible]);
  const lunarLines = useMemo(() => buildLunarLines(datetime), [datetime]);
  const lunarMarkdown = useMemo(() => {
    return streamLines(lunarLines, traceVisible, trace.length, runPhase);
  }, [lunarLines, traceVisible, trace.length, runPhase]);
  const phaseLabels = ["输入", "推演", "归一"];
  const phaseIndex = activeTab === "input" ? 0 : activeTab === "computing" ? 1 : 2;

  return (
    <Box className="gua-bg" mih="100dvh">
      <Container size="sm" py={64}>
        <Stack gap={32}>
          <Stack gap={10} align="center" className="gua-hero">
            <div className="gua-mark" aria-label="GUA">
              <svg viewBox="0 0 180 48" role="img" aria-label="GUA" className="gua-mark-svg">
                <path
                  d="M38 12.8c-6.9 0-12.5 5.6-12.5 12.5S31.1 37.8 38 37.8c3.7 0 7.1-1.6 9.4-4.2v-8.4H37.2v-4.8H52.2v15.8c-3.6 4.3-8.9 7-14.2 7-9.6 0-17.5-7.9-17.5-17.5S28.4 7.8 38 7.8c5.1 0 9.9 2.2 13.3 5.8l-3.6 3.2c-2.4-2.6-5.8-4-9.7-4Z"
                  fill="none"
                  stroke="rgba(15, 23, 42, 0.92)"
                  strokeWidth="3.2"
                  strokeLinejoin="miter"
                />
                <path
                  d="M73 9.8v20.9c0 4.5 3.1 7.5 7.9 7.5s7.9-3 7.9-7.5V9.8h5v21.3c0 7.3-5.2 12.1-12.9 12.1S68 38.4 68 31.1V9.8h5Z"
                  fill="none"
                  stroke="rgba(15, 23, 42, 0.92)"
                  strokeWidth="3.2"
                  strokeLinejoin="miter"
                />
                <path
                  d="M126.6 9.8h5.7l13 33h-5.4l-3.2-8.3h-14.5l-3.2 8.3h-5.4l13-33Zm-2.7 20h10.9l-5.4-14.2-5.5 14.2Z"
                  fill="none"
                  stroke="rgba(15, 23, 42, 0.92)"
                  strokeWidth="3.2"
                  strokeLinejoin="miter"
                />
                <path
                  d="M12 38.5h156"
                  stroke="rgba(15, 23, 42, 0.28)"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeDasharray="2 6"
                />
              </svg>
            </div>
              <Group gap="xs" justify="center" align="center">
                <Title order={1} className="gua-title" fw={600}>
                  不确定性归一化装置
                </Title>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  radius="xl"
                  aria-label="算法说明"
                  onClick={() => setAboutOpen(true)}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M12 17v-5.2c0-1.1.9-2 2-2h.2c.9 0 1.8-.7 1.8-1.6 0-1.1-1.1-2-2.4-2h-3.2C8.6 6.2 7 7.7 7 9.5"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M12 20.3a.8.8 0 1 0 0-1.6.8.8 0 0 0 0 1.6Z"
                      fill="currentColor"
                    />
                    <path
                      d="M12 22c5.5 0 10-4.5 10-10S17.5 2 12 2 2 6.5 2 12s4.5 10 10 10Z"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </ActionIcon>
              </Group>
            <Text fz="sm" className="gua-subtitle">
              起卦不是迷信，是把“问”编码成扰动：同一输入同一输出，推演可追踪，归一可复算。
            </Text>
          </Stack>

          <Stack gap={8} className="gua-phase">
            <Group justify="space-between" className="gua-phase-labels">
              {phaseLabels.map((label, index) => {
                const value: Phase = index === 0 ? "input" : index === 1 ? "computing" : "result";
                return (
                  <UnstyledButton
                    key={label}
                    className="gua-phase-tab"
                    onClick={() => setActiveTab(value)}
                    aria-current={activeTab === value ? "page" : undefined}
                  >
                    <Text key={label} fz="xs" className={index === phaseIndex ? "gua-phase-active" : "gua-phase-idle"}>
                      {label}
                    </Text>
                  </UnstyledButton>
                );
              })}
            </Group>
            <Box className="gua-stepper">
              {phaseLabels.map((label, index) => {
                const value: Phase = index === 0 ? "input" : index === 1 ? "computing" : "result";
                return (
                  <UnstyledButton key={label} className="gua-phase-tab" onClick={() => setActiveTab(value)}>
                    <Box className={index === phaseIndex ? "gua-step gua-step-active" : "gua-step"} />
                  </UnstyledButton>
                );
              })}
            </Box>
            <Text fz="xs" className="gua-phase-current">
              当前页面 · {phaseLabels[phaseIndex]}
            </Text>
          </Stack>

          <Group justify="space-between" align="center" className="gua-controls">
            <Group gap="xs">
              <Button radius="xl" variant="default" onClick={onTerminate} disabled={!isRunning}>
                终止
              </Button>
              <Button radius="xl" variant="default" onClick={onReset}>
                重置
              </Button>
            </Group>
            <Group gap="xs">
              <Button radius="xl" onClick={onStart} disabled={!canStart}>
                {runPhase === "input" && trace.length === 0 && !result ? "起卦" : "再卜一次"}
              </Button>
            </Group>
          </Group>

          {activeTab === "input" ? (
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
                <Text className="gua-section-sub">写下所问之事，余者交给推演。</Text>

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
                      {Math.min(120, question.length)}/120 · {shortcutHint}
                    </Text>
                  }
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && canStart) onStart();
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
              </Stack>
            </Paper>
          ) : null}

          {activeTab === "computing" ? (
            trace.length > 0 || isRunning || formulaSeed !== null ? (
              <StreamingPanels
                formulaMarkdown={formulaMarkdown}
                formulaParams={progressiveParams}
                scienceMarkdown={scienceMarkdown}
                lunarMarkdown={lunarMarkdown}
              />
            ) : (
              <Paper radius="md" p="xl" className="gua-panel gua-panel-muted">
                <Stack gap="sm">
                  <Text fw={600} className="gua-section-title">
                    暂无推演信息
                  </Text>
                  <Text className="gua-section-sub">请到「输入」页面起卦后，再来这里查看推演过程。</Text>
                  <Group justify="flex-end">
                    <Button radius="xl" variant="default" onClick={() => setActiveTab("input")}>
                      去输入
                    </Button>
                  </Group>
                </Stack>
              </Paper>
            )
          ) : null}

          {activeTab === "result" ? (
            result && runPhase === "result" ? (
              <StreamingPanels
                mode="resultOnly"
                formulaMarkdown={resultMarkdown}
                scienceMarkdown=""
                lunarMarkdown=""
              />
            ) : (
              <Paper radius="md" p="xl" className="gua-panel gua-panel-muted">
                <Stack gap="sm">
                  <Text fw={600} className="gua-section-title">
                    暂无归一结果
                  </Text>
                  <Text className="gua-section-sub">请到「推演」等待完成，或回到「输入」重新起卦。</Text>
                  <Group justify="flex-end">
                    <Button radius="xl" variant="default" onClick={() => setActiveTab(isRunning || trace.length > 0 ? "computing" : "input")}>
                      {isRunning || trace.length > 0 ? "去推演" : "去输入"}
                    </Button>
                  </Group>
                </Stack>
              </Paper>
            )
          ) : null}

          <Text ta="center" fz="xs" className="gua-footer">
            本项目仅供娱乐与传统文化研究，切勿迷信。
          </Text>
        </Stack>
      </Container>

      <Modal opened={aboutOpen} onClose={() => setAboutOpen(false)} size="lg" centered title="算法说明">
        <MarkdownStream
          content={[
            "## 摘要",
            "",
            "本文描述一种面向卦问交互的确定性计算流程。系统以时间与输入扰动构造随机种子，生成可解释的符号参数集，并据此合成表达式结构；推演阶段对参数与结构进行分层揭示，归一阶段对表达式执行数值化求解，输出标量 $\\Omega$ 及其可复算的代入等式。",
            "",
            "## 1. 输入、观测与随机种子",
            "",
            "- 输入由卦问文本 $x$、起卦时间 $t$ 与交互扰动 $e$ 组成。",
            "- 构造 32 位种子 $s = \\mathrm{mix}(t, x, e)$，其中 $\\mathrm{mix}$ 为可复算的整数散列混合。",
            "- 该种子用于驱动伪随机数发生器 $r(s)$，保证确定性复现与对输入的灵敏响应。",
            "",
            "## 2. 参数化：不确定性的符号表示",
            "",
            "- 定义参数集 $\\Theta = \\{Q, T, N, \\epsilon, \\alpha, \\beta, \\gamma, \\Phi_1, \\dots, \\Phi_k\\}$。",
            "- 参数值由 $r(s)$ 采样得到，允许闭式表达（分式、根式、常数与极限），并附带中文语义标签以保持可解释性。",
            "",
            "## 3. 结构生成：表达式树合成",
            "",
            "- 从参数节点与常数节点构造候选集合 $V$，通过随机合成规则生成表达式树 $f(\\cdot)$：",
            "  - 二元算子：$+, -, \\cdot$",
            "  - 分式：$\\frac{a}{b}$",
            "  - 幂：$a^{b}$",
            "  - 初等函数：$\\log, \\exp, \\sin, \\cos, \\tanh$",
            "- 得到公式：$\\Omega = f(\\Theta)$。",
            "",
            "## 4. 推演阶段：分层揭示与过程记录",
            "",
            "- 传统块与现代块由同一事件序列驱动，分别提供叙述式与结构化视角。",
            "- 设推演进度 $p\\in[0,1]$，参数揭示函数 $g(p)$ 决定在阶段 $p$ 已公开的参数子集，其余以 $\\square$ 占位。",
            "",
            "## 5. 归一阶段：数值化求解与可复算输出",
            "",
            "- 对参数闭式进行解析并数值化：$\\hat\\Theta = \\mathrm{eval}(\\Theta)$。",
            "- 对表达式树执行递归求值，得到 $\\Omega = f(\\hat\\Theta)$。",
            "- 最终以等式展示：将 $\\hat\\Theta$ 代入右侧表达式并给出“算式 = 结果”，保证同条件可复算。",
          ].join("\n")}
        />
      </Modal>
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

function buildResultLatex(data: ReturnType<typeof buildFormulaData> | null) {
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildProgressiveParams(params: FormulaParam[], phase: Phase, traceVisible: number, traceTotal: number) {
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
