"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Box,
  Button,
  Container,
  Group,
  Modal,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { MarkdownStream } from "@/components/MarkdownStream";
import { DecodeHistoryModals, DecodeTabContent } from "@/components/DecodeTabContent";
import { AiConfigModal } from "@/components/AiConfigModal";
import { ShareCardModal } from "@/components/ShareCardModal";
import { ResultTabSection } from "@/components/ResultTabSection";
import { SettingsModals } from "@/components/SettingsModals";
import { DivinationHistoryModals } from "@/components/DivinationHistoryModals";
import { InputTabSection } from "@/components/InputTabSection";
import { ComputingTabSection } from "@/components/ComputingTabSection";
import { UniverseModelViz } from "@/components/UniverseModelViz";
import { useShareCard } from "@/hooks/useShareCard";
import { ABOUT_ALGORITHM_MARKDOWN } from "@/content/aboutAlgorithm";
import type { UniverseModelV1 } from "@/types/universeModel";
import type { DivinationExtras, DivinationResult, DivinationTraceEvent } from "@/utils/divinationEngine";
import { divineWithTrace } from "@/utils/divinationEngine";
import { streamDecode } from "@/utils/decodeLlmClient";
import { buildFormulaData } from "@/utils/formulaEngine";
import { buildFormulaMarkdown, buildProgressiveParams, buildResultLatex, buildScienceMarkdown } from "@/utils/formulaPresentation";
import { parseDatetimeLocalValue, toDatetimeLocalValue, formatIsoMinute } from "@/utils/guaDate";
import { clamp01, clamp11, hashStr32, hex8, meanStd, mix32, randU32 } from "@/utils/guaMath";
import { downloadJson, safeJsonParse } from "@/utils/guaJson";
import {
  collectPassiveObservables,
  computeDashboardMetrics,
  computeHistoryPrior16,
  defaultPolicyFromTheta,
  deriveFormulaSeed,
  initModel,
  type EnhancedStateV1,
  type HistoryFeedback,
  type HistoryItemV1,
} from "@/utils/guaModelLogic";
import { normalizeLite } from "@/utils/guaText";
import { buildLunarLines, streamLines } from "@/utils/lunarMarkdown";
import { normalizeMarkdownLatexEscapes, previewFromMarkdown, unwrapOuterMarkdownFence } from "@/utils/markdownText";
import {
  addUniverseModelItem,
  deleteUniverseModelItem,
  ensureUniverseModelLibrary,
  loadUniverseModelLibrary,
  makeLibraryId,
  renameUniverseModelItem,
  saveUniverseModelLibrary,
  setActiveUniverseModel,
  updateActiveModel,
  type UniverseModelLibraryV1,
} from "@/utils/universeModelLibrary";

type Phase = "input" | "computing" | "result" | "decode";

type DecodeMode = "result_current" | "model_current" | "result_history" | "llm_direct";

type DirectSource = "current" | "last" | "history";

type LlmModelConfig = {
  id: string;
  thinking: boolean;
};

type LlmConfigResponse = {
  models: LlmModelConfig[];
  defaults: { model: string; stream: boolean; thinking: boolean };
  warnings?: string[];
};

type DecodeContextRefV1 =
  | { k: "hid"; hid: string }
  | { k: "snapshot"; snapshot: unknown };

type DecodeAiHistoryItemV1 = {
  v: 1;
  id: string;
  createdAt: number;
  mode: DecodeMode;
  directSource: DirectSource;
  historyPickId: string | null;
  options: { model: string | null; stream: boolean; thinking: boolean };
  context: DecodeContextRefV1;
  summary: {
    question: string;
    nickname: string;
    datetimeISO: string;
    score: number;
    omega: string;
    signature: string;
  };
  response: {
    answer: string;
    reasoning: string;
    error: string | null;
    aborted: boolean;
    finishedAt: number | null;
    durationMs: number | null;
  };
};

type SettingsHelpTopic = "status" | "score" | "theta";
type ModelVizMode = "mesh" | "flow" | "hud";

const MODEL_KEY = "gua.universeModel.v1";
const ENHANCED_KEY = "gua.universeEnhanced.v1";
const HISTORY_KEY = "gua.history.v1";
const DECODE_PREFIX = "gua.decodePacket.v1:";
const DECODE_OUTPUT_KEY = "gua.decodeOutput.v1";
const DECODE_AI_HISTORY_KEY = "gua.decodeAiHistory.v1";

export default function CyberGuaApp() {
  const [runPhase, setRunPhase] = useState<Phase>("input");
  const [activeTab, setActiveTab] = useState<Phase>("input");
  const [isRunning, setIsRunning] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsHelpOpen, setSettingsHelpOpen] = useState(false);
  const [settingsHelpTopic, setSettingsHelpTopic] = useState<SettingsHelpTopic>("status");
  const [modelBoardOpen, setModelBoardOpen] = useState(false);
  const [decodeHistoryOpen, setDecodeHistoryOpen] = useState(false);
  const [decodeHistoryDetailId, setDecodeHistoryDetailId] = useState<string | null>(null);
  const [divinationHistoryOpen, setDivinationHistoryOpen] = useState(false);
  const [divinationHistoryDetailId, setDivinationHistoryDetailId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [nickname, setNickname] = useState("");
  const [model, setModel] = useState<UniverseModelV1 | null>(null);
  const [modelLibrary, setModelLibrary] = useState<UniverseModelLibraryV1 | null>(null);
  const [modelLibraryError, setModelLibraryError] = useState<string | null>(null);
  const [enhanced, setEnhanced] = useState<EnhancedStateV1>({
    v: 1,
    enabled: false,
    geo: "unknown",
    motion: "unknown",
  });
  const [history, setHistory] = useState<HistoryItemV1[]>([]);
  const [decodeAiHistory, setDecodeAiHistory] = useState<DecodeAiHistoryItemV1[]>([]);
  const [modelVizMode, setModelVizMode] = useState<ModelVizMode>("mesh");

  const [datetimeValue, setDatetimeValue] = useState("");
  const datetime = useMemo(() => parseDatetimeLocalValue(datetimeValue), [datetimeValue]);

  const [result, setResult] = useState<DivinationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trace, setTrace] = useState<DivinationTraceEvent[]>([]);
  const [traceVisible, setTraceVisible] = useState(0);
  const [formulaSeed, setFormulaSeed] = useState<number | null>(null);
  const [feedbackLocked, setFeedbackLocked] = useState(false);
  const [lastHistoryId, setLastHistoryId] = useState<string | null>(null);
  const [decodePacket, setDecodePacket] = useState<unknown | null>(null);
  const [decodeError, setDecodeError] = useState<string | null>(null);
  const [decodeStreaming, setDecodeStreaming] = useState(false);
  const [decodeAnswer, setDecodeAnswer] = useState("");
  const [decodeReasoning, setDecodeReasoning] = useState("");
  const [decodeMode, setDecodeMode] = useState<DecodeMode>("result_current");
  const [decodeHistoryPickId, setDecodeHistoryPickId] = useState<string | null>(null);
  const [directSource, setDirectSource] = useState<DirectSource>("current");
  const [decodeAuto, setDecodeAuto] = useState(true);
  const [decodeReasoningOpen, setDecodeReasoningOpen] = useState(false);
  const [llmConfig, setLlmConfig] = useState<LlmConfigResponse | null>(null);
  const [llmConfigError, setLlmConfigError] = useState<string | null>(null);
  const [decodeModel, setDecodeModel] = useState<string | null>(null);
  const [decodeStreamEnabled, setDecodeStreamEnabled] = useState(true);
  const [decodeThinkingEnabled, setDecodeThinkingEnabled] = useState(true);
  const [decodeThinkingSupported, setDecodeThinkingSupported] = useState(false);
  const [aiConfigOpen, setAiConfigOpen] = useState(false);
  const [computeSpeedMul, setComputeSpeedMul] = useState(1);
  const decodeAbortRef = useRef<AbortController | null>(null);
  const decodeOutRef = useRef<HTMLDivElement | null>(null);
  const decodeReasonRef = useRef<HTMLDivElement | null>(null);
  const decodeOutProgrammatic = useRef(false);
  const decodeReasonProgrammatic = useRef(false);
  const decodePendingRef = useRef<{ a: string; r: string; raf: number; timer: number }>({ a: "", r: "", raf: 0, timer: 0 });
  const decodeRestoreOnceRef = useRef(false);
  const decodePrefRestoredRef = useRef({ model: false, stream: false, thinking: false });
  const decodePrefTouchedRef = useRef({ model: false, stream: false, thinking: false });
  const decodeAutoStartRef = useRef(false);
  const computeSpeedMulRef = useRef(1);
  const decodeReasoningOpenRef = useRef(false);
  const decodeReasoningManualRef = useRef(false);
  const decodeAutoCollapseArmedRef = useRef(false);

  const runIdRef = useRef(0);
  const modelRef = useRef<UniverseModelV1 | null>(null);
  const modelLibraryRef = useRef<UniverseModelLibraryV1 | null>(null);
  const lastRunRef = useRef<{ fv16: number[]; entropy: number; obsHash: number } | null>(null);
  const lastHistoryIdRef = useRef<string | null>(null);
  const enhancedWriteRef = useRef(0);
  const enhancedRef = useRef(enhanced);
  const historyRef = useRef<HistoryItemV1[]>([]);
  const decodeAiHistoryRef = useRef<DecodeAiHistoryItemV1[]>([]);

  function setEnhancedPersist(next: EnhancedStateV1) {
    setEnhanced(next);
    try {
      localStorage.setItem(ENHANCED_KEY, JSON.stringify(next));
    } catch {
      void 0;
    }
  }

  function setHistoryPersist(next: HistoryItemV1[]) {
    setHistory(next);
    historyRef.current = next;
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch {
      void 0;
    }
  }

  const setDecodeAiHistoryPersist = useCallback((next: DecodeAiHistoryItemV1[]) => {
    setDecodeAiHistory(next);
    decodeAiHistoryRef.current = next;
    try {
      localStorage.setItem(DECODE_AI_HISTORY_KEY, JSON.stringify(next));
    } catch {
      void 0;
    }
  }, []);

  const entropyRef = useRef({
    seed: 0x12345678,
    lastT: 0,
    lastX: 0,
    lastY: 0,
    has: false,
  });

  useEffect(() => {
    if (datetimeValue) return;
    setDatetimeValue(toDatetimeLocalValue(new Date()));
  }, [datetimeValue]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("gua.modelVizMode.v1");
      const mode = raw === "mesh" || raw === "flow" || raw === "hud" ? raw : "mesh";
      setModelVizMode(mode);
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    const normalizeModel = (loaded: UniverseModelV1) => {
      const likedRatio = loaded.likes?.total ? loaded.likes.liked / loaded.likes.total : 0;
      const policy = loaded.policy ? loaded.policy : defaultPolicyFromTheta(loaded.theta16, loaded.runCount, likedRatio);
      return {
        v: 1,
        salt: loaded.salt >>> 0,
        runCount: Math.max(0, Math.trunc(loaded.runCount ?? 0)),
        theta16: loaded.theta16.map((x) => clamp01(Number(x))),
        policy,
        likes: {
          total: Math.max(0, Math.trunc(loaded.likes?.total ?? 0)),
          liked: Math.max(0, Math.trunc(loaded.likes?.liked ?? 0)),
        },
        updatedAt: Number.isFinite(loaded.updatedAt) ? loaded.updatedAt : Date.now(),
      } satisfies UniverseModelV1;
    };

    const legacyRaw = safeJsonParse<UniverseModelV1>(localStorage.getItem(MODEL_KEY));
    const legacyModel =
      legacyRaw && legacyRaw.v === 1 && Number.isFinite(legacyRaw.salt) && Array.isArray(legacyRaw.theta16) && legacyRaw.theta16.length === 16
        ? normalizeModel(legacyRaw)
        : null;

    const lib = ensureUniverseModelLibrary({ legacyModel, initModel });
    const activeItem = lib.items.find((x) => x.id === lib.activeId) ?? lib.items[0]!;
    const activeModel = normalizeModel(activeItem.model);

    try {
      localStorage.setItem(MODEL_KEY, JSON.stringify(activeModel));
    } catch {
      void 0;
    }
    queueMicrotask(() => {
      setModel(activeModel);
      modelRef.current = activeModel;
      setModelLibrary(lib);
      modelLibraryRef.current = lib;
      setModelLibraryError(null);
    });

    const loadedEnhanced = safeJsonParse<EnhancedStateV1>(localStorage.getItem(ENHANCED_KEY));
    if (loadedEnhanced && loadedEnhanced.v === 1) {
      queueMicrotask(() => {
        setEnhanced({
          v: 1,
          enabled: Boolean(loadedEnhanced.enabled),
          geo: loadedEnhanced.geo ?? "unknown",
          motion: loadedEnhanced.motion ?? "unknown",
          lastGeo: loadedEnhanced.lastGeo,
          lastMotion: loadedEnhanced.lastMotion,
        });
      });
    }

    const loadedHistory = safeJsonParse<HistoryItemV1[]>(localStorage.getItem(HISTORY_KEY));
    if (Array.isArray(loadedHistory)) {
      const nextHistory = loadedHistory
        .filter((x) => x && x.v === 1 && Array.isArray(x.features16) && x.features16.length === 16)
        .map((x) => ({
          ...x,
          createdAt: Number.isFinite(x.createdAt) ? x.createdAt : Date.now(),
          feedback: (x.feedback === 1 || x.feedback === -1 ? x.feedback : 0) as HistoryFeedback,
          question: typeof x.question === "string" ? x.question : "",
          nickname: typeof x.nickname === "string" ? x.nickname : "",
          omega: typeof x.omega === "string" ? x.omega : undefined,
          score: Number.isFinite((x as unknown as { score?: number }).score)
            ? Number((x as unknown as { score?: number }).score)
            : Number.isFinite((x as unknown as { result?: { score?: number } }).result?.score)
              ? Number((x as unknown as { result?: { score?: number } }).result?.score)
              : 0,
          signature: typeof (x as unknown as { signature?: string }).signature === "string"
            ? (x as unknown as { signature?: string }).signature
            : undefined,
          features16: x.features16.map((n) => clamp01(Number(n))),
        }));
      queueMicrotask(() => {
        setHistory(nextHistory);
        historyRef.current = nextHistory;
        const initialId = nextHistory[0]?.id ?? null;
        if (initialId && !lastHistoryIdRef.current) {
          lastHistoryIdRef.current = initialId;
          setLastHistoryId(initialId);
        }
      });
    }

    const normalizeDecodeMode = (value: unknown): DecodeMode => {
      return value === "result_current" || value === "model_current" || value === "result_history" || value === "llm_direct"
        ? value
        : "result_current";
    };
    const normalizeDirectSource = (value: unknown): DirectSource => {
      return value === "current" || value === "last" || value === "history" ? value : "current";
    };
    const normalizeContext = (value: unknown): DecodeContextRefV1 => {
      const v = value as { k?: unknown; hid?: unknown; snapshot?: unknown };
      if (v && v.k === "hid" && typeof v.hid === "string") return { k: "hid", hid: v.hid };
      if (v && v.k === "snapshot") return { k: "snapshot", snapshot: v.snapshot };
      return { k: "snapshot", snapshot: null };
    };
    const normalizeDecodeAiHistory = (raw: DecodeAiHistoryItemV1) => {
      const x = raw as unknown as Partial<DecodeAiHistoryItemV1>;
      return {
        v: 1,
        id: typeof x.id === "string" ? x.id : `D${hex8(randU32())}`,
        createdAt: Number.isFinite(x.createdAt) ? Number(x.createdAt) : Date.now(),
        mode: normalizeDecodeMode(x.mode),
        directSource: normalizeDirectSource(x.directSource),
        historyPickId: typeof x.historyPickId === "string" || x.historyPickId === null ? x.historyPickId : null,
        options: {
          model: typeof x.options?.model === "string" || x.options?.model === null ? x.options.model : null,
          stream: Boolean(x.options?.stream),
          thinking: Boolean(x.options?.thinking),
        },
        context: normalizeContext(x.context),
        summary: {
          question: typeof x.summary?.question === "string" ? x.summary.question : "",
          nickname: typeof x.summary?.nickname === "string" ? x.summary.nickname : "",
          datetimeISO: typeof x.summary?.datetimeISO === "string" ? x.summary.datetimeISO : "",
          score: Number.isFinite(Number(x.summary?.score)) ? Number(x.summary?.score) : 0,
          omega: typeof x.summary?.omega === "string" ? x.summary.omega : "—",
          signature: typeof x.summary?.signature === "string" ? x.summary.signature : "—",
        },
        response: {
          answer: typeof x.response?.answer === "string" ? x.response.answer : "",
          reasoning: typeof x.response?.reasoning === "string" ? x.response.reasoning : "",
          error: typeof x.response?.error === "string" ? x.response.error : null,
          aborted: Boolean(x.response?.aborted),
          finishedAt: Number.isFinite(Number(x.response?.finishedAt)) ? Number(x.response?.finishedAt) : null,
          durationMs: Number.isFinite(Number(x.response?.durationMs)) ? Number(x.response?.durationMs) : null,
        },
      } satisfies DecodeAiHistoryItemV1;
    };

    const loadedDecodeAiHistory = safeJsonParse<DecodeAiHistoryItemV1[]>(localStorage.getItem(DECODE_AI_HISTORY_KEY));
    if (Array.isArray(loadedDecodeAiHistory)) {
      const nextDecodeAiHistory = loadedDecodeAiHistory
        .filter((x) => x && x.v === 1 && typeof x.id === "string")
        .map((x) => normalizeDecodeAiHistory(x));
      queueMicrotask(() => {
        setDecodeAiHistory(nextDecodeAiHistory);
        decodeAiHistoryRef.current = nextDecodeAiHistory;
      });
    }

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

  useEffect(() => {
    enhancedRef.current = enhanced;
  }, [enhanced]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    decodeAiHistoryRef.current = decodeAiHistory;
  }, [decodeAiHistory]);

  useEffect(() => {
    decodeReasoningOpenRef.current = decodeReasoningOpen;
  }, [decodeReasoningOpen]);

  useEffect(() => {
    modelLibraryRef.current = modelLibrary;
  }, [modelLibrary]);

  useEffect(() => {
    computeSpeedMulRef.current = computeSpeedMul;
  }, [computeSpeedMul]);

  useEffect(() => {
    if (decodeRestoreOnceRef.current) return;
    decodeRestoreOnceRef.current = true;
    try {
      const raw = sessionStorage.getItem(DECODE_OUTPUT_KEY);
      const normalizeDecodeMode = (value: unknown): DecodeMode => {
        return value === "result_current" || value === "model_current" || value === "result_history" || value === "llm_direct"
          ? value
          : "result_current";
      };
      const normalizeDirectSource = (value: unknown): DirectSource => {
        return value === "current" || value === "last" || value === "history" ? value : "current";
      };
      const saved = safeJsonParse<{
        mode?: DecodeMode;
        model?: string | null;
        stream?: boolean;
        thinking?: boolean;
        answer?: string;
        reasoning?: string;
        reasoningOpen?: boolean;
        auto?: boolean;
        directSource?: DirectSource;
        historyPickId?: string | null;
        streaming?: boolean;
        updatedAt?: number;
      }>(raw);
      if (saved) {
        if (saved.mode) setDecodeMode(normalizeDecodeMode(saved.mode));
        if (saved.model !== undefined) {
          decodePrefRestoredRef.current.model = true;
          setDecodeModel(saved.model ?? null);
        }
        if (typeof saved.stream === "boolean") {
          decodePrefRestoredRef.current.stream = true;
          setDecodeStreamEnabled(saved.stream);
        }
        if (typeof saved.thinking === "boolean") {
          decodePrefRestoredRef.current.thinking = true;
          setDecodeThinkingEnabled(saved.thinking);
        }
        if (typeof saved.auto === "boolean") setDecodeAuto(saved.auto);
        if (typeof saved.reasoningOpen === "boolean") setDecodeReasoningOpen(saved.reasoningOpen);
        if (saved.directSource) setDirectSource(normalizeDirectSource(saved.directSource));
        if (saved.historyPickId !== undefined) setDecodeHistoryPickId(saved.historyPickId ?? null);
        if (typeof saved.answer === "string") setDecodeAnswer(saved.answer);
        if (typeof saved.reasoning === "string") setDecodeReasoning(saved.reasoning);
        if (typeof saved.streaming === "boolean") {
          const ts = Number(saved.updatedAt ?? NaN);
          const fresh = Number.isFinite(ts) ? Date.now() - ts < 5000 : false;
          setDecodeStreaming(saved.streaming && fresh);
        }
      }
    } catch {
      decodeRestoreOnceRef.current = true;
    }
  }, []);

  const setDecodeModelFromUser = useCallback((v: string | null) => {
    decodePrefTouchedRef.current.model = true;
    setDecodeModel(v);
  }, []);

  const setDecodeStreamEnabledFromUser = useCallback((v: boolean) => {
    decodePrefTouchedRef.current.stream = true;
    setDecodeStreamEnabled(v);
  }, []);

  const setDecodeThinkingEnabledFromUser = useCallback((v: boolean) => {
    decodePrefTouchedRef.current.thinking = true;
    setDecodeThinkingEnabled(v);
  }, []);

  useEffect(() => {
    if (!enhanced.enabled) return;
    const onOrientation = (e: DeviceOrientationEvent) => {
      const cur = enhancedRef.current;
      if (!cur.enabled) return;
      const a = Number(e.alpha ?? 0);
      const b = Number(e.beta ?? 0);
      const g = Number(e.gamma ?? 0);
      entropyRef.current.seed = mix32(entropyRef.current.seed, (Math.round(a * 10) ^ 0x6f7269) >>> 0);
      entropyRef.current.seed = mix32(entropyRef.current.seed, (Math.round(b * 10) ^ 0x656e74) >>> 0);
      entropyRef.current.seed = mix32(entropyRef.current.seed, (Math.round(g * 10) ^ 0x746e6d) >>> 0);
      const now = Date.now();
      if (now - enhancedWriteRef.current < 3000) return;
      enhancedWriteRef.current = now;
      setEnhancedPersist({
        ...cur,
        lastMotion: { a, b, g },
      });
    };
    window.addEventListener("deviceorientation", onOrientation, { passive: true });
    return () => window.removeEventListener("deviceorientation", onOrientation);
  }, [enhanced.enabled]);

  useEffect(() => {
    const st = {
      lastKeyT: 0,
      keyCount: 0,
      keyJitter: 0,
      lastClickT: 0,
      clickCount: 0,
      clickJitter: 0,
      lastScrollT: 0,
      scrollCount: 0,
      scrollJitter: 0,
    };

    const onKeyDown = () => {
      const now = performance.now();
      const dt = st.lastKeyT ? Math.max(1, now - st.lastKeyT) : 0;
      st.lastKeyT = now;
      st.keyCount += 1;
      if (dt) st.keyJitter = (st.keyJitter * 0.92 + Math.min(2000, dt) * 0.08);
      entropyRef.current.seed = mix32(entropyRef.current.seed, (Math.floor(dt) ^ 0x6b6579) >>> 0);
    };
    const onClick = () => {
      const now = performance.now();
      const dt = st.lastClickT ? Math.max(1, now - st.lastClickT) : 0;
      st.lastClickT = now;
      st.clickCount += 1;
      if (dt) st.clickJitter = (st.clickJitter * 0.92 + Math.min(2000, dt) * 0.08);
      entropyRef.current.seed = mix32(entropyRef.current.seed, (Math.floor(dt) ^ 0x636c6b) >>> 0);
    };
    const onScroll = () => {
      const now = performance.now();
      const dt = st.lastScrollT ? Math.max(1, now - st.lastScrollT) : 0;
      st.lastScrollT = now;
      st.scrollCount += 1;
      if (dt) st.scrollJitter = (st.scrollJitter * 0.92 + Math.min(2000, dt) * 0.08);
      entropyRef.current.seed = mix32(entropyRef.current.seed, (Math.floor(dt) ^ 0x736372) >>> 0);
    };

    window.addEventListener("keydown", onKeyDown, { passive: true });
    window.addEventListener("click", onClick, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("click", onClick);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const requestEnhanced = async (enable: boolean) => {
    if (!enable) {
      setEnhancedPersist({ ...enhanced, enabled: false });
      return;
    }

    const next: EnhancedStateV1 = { ...enhanced, enabled: true };
    setEnhancedPersist(next);

    if (navigator.geolocation) {
      next.geo = "unknown";
      setEnhancedPersist({ ...next });
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = Number(pos.coords.latitude);
          const lon = Number(pos.coords.longitude);
          const acc = Number(pos.coords.accuracy ?? 0);
          const updated: EnhancedStateV1 = {
            ...next,
            geo: "granted",
            lastGeo: { lat, lon, acc },
          };
          setEnhancedPersist(updated);
        },
        () => {
          setEnhancedPersist({ ...next, geo: "denied" });
        },
        { enableHighAccuracy: false, maximumAge: 300000, timeout: 4000 },
      );
    } else {
      setEnhancedPersist({ ...next, geo: "error" });
    }

    const requestMotion = async () => {
      const any = (globalThis as unknown as { DeviceMotionEvent?: { requestPermission?: () => Promise<"granted" | "denied"> } })
        .DeviceMotionEvent;
      if (any?.requestPermission) {
        try {
          const res = await any.requestPermission();
          setEnhancedPersist({ ...next, motion: res === "granted" ? "granted" : "denied" });
        } catch {
          setEnhancedPersist({ ...next, motion: "error" });
        }
      } else {
        setEnhancedPersist({ ...next, motion: "unknown" });
      }
    };
    await requestMotion();
  };

  const persistLibrary = (next: UniverseModelLibraryV1) => {
    try {
      saveUniverseModelLibrary(next);
      setModelLibrary(next);
      modelLibraryRef.current = next;
      setModelLibraryError(null);
    } catch {
      setModelLibraryError("模型库写入失败。");
      setModelLibrary(next);
      modelLibraryRef.current = next;
    }
  };

  const persistActiveModel = (nextModel: UniverseModelV1) => {
    setModel(nextModel);
    modelRef.current = nextModel;
    try {
      localStorage.setItem(MODEL_KEY, JSON.stringify(nextModel));
    } catch {
      void 0;
    }
    const currentLib = modelLibraryRef.current ?? loadUniverseModelLibrary();
    if (!currentLib) return;
    persistLibrary(updateActiveModel(currentLib, nextModel));
  };

  const applyActiveFromLibrary = (nextLib: UniverseModelLibraryV1) => {
    const active = nextLib.items.find((x) => x.id === nextLib.activeId) ?? nextLib.items[0];
    if (active) {
      setModel(active.model);
      modelRef.current = active.model;
      try {
        localStorage.setItem(MODEL_KEY, JSON.stringify(active.model));
      } catch {
        void 0;
      }
    }
    persistLibrary(nextLib);
  };

  const playTrace = useCallback(async (steps: DivinationTraceEvent[], entropy: number, runId: number) => {
    const totalMs = 20000;
    const baseDelay = totalMs / Math.max(1, steps.length);
    const durations = steps.map((s, i) => {
      const phaseBoost = s?.phase === "易经" ? 180 : s?.phase === "融合" ? 140 : s?.phase === "归一" ? 220 : 0;
      const jitter = Math.floor(((mix32(entropy, i + 31) >>> 0) % 160) - 80);
      return Math.max(8, baseDelay + phaseBoost + jitter);
    });

    setTraceVisible(0);
    const ok = await new Promise<boolean>((resolve) => {
      let idx = 0;
      let lastNow = performance.now();
      let scaled = 0;

      const tick = (now: number) => {
        if (runIdRef.current !== runId) {
          resolve(false);
          return;
        }
        const speed = Math.max(1, Math.min(16, Math.floor(computeSpeedMulRef.current)));
        scaled += (now - lastNow) * speed;
        lastNow = now;
        while (idx < durations.length && scaled >= durations[idx]!) {
          scaled -= durations[idx]!;
          idx += 1;
          setTraceVisible(idx);
        }
        if (idx >= durations.length) {
          resolve(true);
          return;
        }
        requestAnimationFrame(tick);
      };

      requestAnimationFrame(tick);
    });

    if (!ok) return false;

    const tailOk = await new Promise<boolean>((resolve) => {
      let lastNow = performance.now();
      let remaining = 260;
      const tick = (now: number) => {
        if (runIdRef.current !== runId) {
          resolve(false);
          return;
        }
        const speed = Math.max(1, Math.min(16, Math.floor(computeSpeedMulRef.current)));
        remaining -= (now - lastNow) * speed;
        lastNow = now;
        if (remaining <= 0) {
          resolve(true);
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    return tailOk;
  }, []);

  const onStart = async () => {
    const q = question.trim();
    if (!q) {
      setError("目标/问题不可为空。");
      return;
    }

    runIdRef.current += 1;
    const runId = runIdRef.current;
    setComputeSpeedMul(1);
    computeSpeedMulRef.current = 1;
    setError(null);
    setIsRunning(true);
    setRunPhase("computing");
    setActiveTab("computing");
    const entropy = (entropyRef.current.seed ^ Date.now()) >>> 0;
    const passive = collectPassiveObservables();
    let obsHash = passive.hash >>> 0;
    let obsFp8 = passive.fp8.slice(0, 8);
    if (enhanced.enabled && enhanced.lastGeo) {
      obsHash = mix32(obsHash, Math.round(enhanced.lastGeo.lat * 1e6));
      obsHash = mix32(obsHash, Math.round(enhanced.lastGeo.lon * 1e6));
      obsHash = mix32(obsHash, Math.round(enhanced.lastGeo.acc));
      obsFp8 = obsFp8.slice(0, 8);
      obsFp8[0] = clamp01((obsFp8[0] * 0.72 + clamp01((enhanced.lastGeo.lat + 90) / 180) * 0.28));
      obsFp8[1] = clamp01((obsFp8[1] * 0.72 + clamp01((enhanced.lastGeo.lon + 180) / 360) * 0.28));
    }
    if (enhanced.enabled && enhanced.lastMotion) {
      obsHash = mix32(obsHash, Math.round(enhanced.lastMotion.a * 1000));
      obsHash = mix32(obsHash, Math.round(enhanced.lastMotion.b * 1000));
      obsHash = mix32(obsHash, Math.round(enhanced.lastMotion.g * 1000));
      obsFp8 = obsFp8.slice(0, 8);
      obsFp8[2] = clamp01((obsFp8[2] * 0.72 + clamp01((enhanced.lastMotion.a + 10) / 20) * 0.28));
      obsFp8[3] = clamp01((obsFp8[3] * 0.72 + clamp01((enhanced.lastMotion.b + 10) / 20) * 0.28));
    }

    const currentModel = modelRef.current ?? initModel();
    const prior16 = computeHistoryPrior16(historyRef.current);
    const settle0 = clamp01(currentModel.runCount / 120);
    const historyInfluence = prior16 ? Math.max(0.08, 0.2 - settle0 * 0.12) : 0;
    const effectiveTheta16 = prior16
      ? currentModel.theta16.map((v, i) => clamp01(v * (1 - historyInfluence) + (prior16[i] ?? 0.5) * historyInfluence))
      : currentModel.theta16;
    const fSeed = deriveFormulaSeed(entropy, currentModel, obsHash);
    setResult(null);
    setTrace([]);
    setTraceVisible(0);
    setFormulaSeed(fSeed);
    setFeedbackLocked(false);
    try {
      const extras: DivinationExtras = {
        obs: { hash: obsHash, fp8: obsFp8, enhanced: enhanced.enabled ? 1 : 0 },
        model: { salt: currentModel.salt, runCount: currentModel.runCount, theta16: effectiveTheta16 },
      };
      const { result: res, trace: steps } = await Promise.resolve().then(() =>
        divineWithTrace(
          {
            question: q,
            datetime,
            nickname: nickname.trim() ? nickname.trim() : undefined,
          },
          entropy,
          undefined,
          extras,
        ),
      );

      if (runIdRef.current !== runId) return;
      setTrace(steps);
      const playbackOk = await playTrace(steps, entropy, runId);
      if (!playbackOk) return;

      setResult(res);
      setRunPhase("result");
      setIsRunning(false);
      setActiveTab("result");

      const fp = steps.find((evt) => evt.phase === "融合" && evt.message === "多学科指纹")?.fp ?? steps.find((evt) => evt.phase === "融合" && evt.message === "多学科因子注入")?.fp;
      const fp8 = (fp && fp.length >= 8 ? fp.slice(0, 8) : Array.from({ length: 8 }, () => 0.5)).map((x) => clamp01(Number(x)));
      const fv16 = [...fp8, ...obsFp8.map((x) => clamp01(Number(x)))].slice(0, 16);
      lastRunRef.current = { fv16, entropy, obsHash };

      const phases = Array.from(new Set(steps.map((x) => x.phase).filter(Boolean)));
      const formulaDataFinal = buildFormulaData(fSeed, phases, currentModel.policy);
      const formulaLatex = formulaDataFinal.latex;
      const omegaParam = formulaDataFinal.params.find((p) => p.key === "Ω")?.value;
      const omegaText = typeof omegaParam === "string" ? omegaParam : omegaParam != null ? String(omegaParam) : undefined;
      const omegaFinite = typeof omegaText === "string" && omegaText.length > 0 && !omegaText.includes("\\infty") && !omegaText.includes("∞");
      const root = steps[0]?.rootDigest ?? steps.find((x) => x.rootDigest)?.rootDigest;
      const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `H${hex8(mix32(entropy, Date.now() >>> 0))}`;
      const record: HistoryItemV1 = {
        v: 1,
        id,
        createdAt: Date.now(),
        questionHash: hashStr32(normalizeLite(q)),
        question: q,
        datetimeISO: datetime.toISOString(),
        nicknameHash: hashStr32(nickname.trim()),
        nickname: nickname.trim(),
        score: res.score,
        signature: res.signature,
        root: root ? String(root) : undefined,
        formulaLatex,
        omega: omegaText,
        features16: fv16,
        feedback: 0,
      };

      const prevScores = historyRef.current
        .slice(0, 20)
        .map((x) => (Number.isFinite(x.score) ? Number(x.score) : 0))
        .filter((n) => Number.isFinite(n));
      const prevStd = meanStd(prevScores).std;
      const nextStd = meanStd([res.score, ...prevScores].slice(0, 20)).std;
      const stabilityDelta = clamp11((prevStd - nextStd) / 12);
      const scoreNorm = clamp11(clamp01(res.score / 100) * 2 - 1);
      const omegaSign = omegaFinite ? 1 : -1;
      const reward = clamp11(scoreNorm * 0.65 + omegaSign * 0.2 + stabilityDelta * 0.15);

      const nextRunCount = Math.max(0, currentModel.runCount) + 1;
      const settle = clamp01(nextRunCount / 120);
      const etaBase = Math.max(0.008, Math.min(0.042, 0.04 - settle * 0.022));
      const gain = reward >= 0 ? clamp01(0.2 + 0.8 * reward) : 0.12;
      const dir = reward >= 0 ? 1 : -0.06;
      let theta16 = currentModel.theta16.map((v, i) => clamp01(v + (fv16[i]! - v) * etaBase * gain * dir));

      if (nextRunCount % 20 === 0) {
        const prior16 = computeHistoryPrior16([record, ...historyRef.current]);
        if (prior16) {
          const influence = Math.max(0.05, 0.14 - settle * 0.08);
          theta16 = theta16.map((v, i) => clamp01(v * (1 - influence) + (prior16[i] ?? 0.5) * influence));
        }
      }

      const likedRatio = currentModel.likes.total ? currentModel.likes.liked / currentModel.likes.total : 0;
      const policy = defaultPolicyFromTheta(theta16, nextRunCount, likedRatio);
      const nextModel: UniverseModelV1 = {
        ...currentModel,
        runCount: nextRunCount,
        theta16,
        policy,
        updatedAt: Date.now(),
      };
      persistActiveModel(nextModel);
      try {
        localStorage.setItem(
          `${DECODE_PREFIX}${id}`,
          JSON.stringify({
            v: 1,
            hid: id,
            createdAt: record.createdAt,
            input: {
              question: record.question,
              nickname: record.nickname ? record.nickname : undefined,
              datetimeISO: record.datetimeISO,
            },
            result: {
              score: res.score,
              signature: res.signature,
              omega: omegaText,
              formulaLatex,
            },
            carry: res.carry,
            model: { salt: currentModel.salt, runCount: currentModel.runCount, theta16: effectiveTheta16, policy: currentModel.policy },
            obs: { hash: obsHash, fp8: obsFp8, enhanced: enhanced.enabled ? 1 : 0 },
            trace: steps,
            extra: {
              entropy,
              rootDigest: root ? String(root) : undefined,
              phases,
              formula: { steps: formulaDataFinal.steps, params: formulaDataFinal.params },
              features16: fv16,
            },
          }),
        );
      } catch {
        void 0;
      }
      const droppedHistory = [record, ...historyRef.current].slice(60).map((x) => x.id);
      if (droppedHistory.length > 0) {
        droppedHistory.forEach((hid) => {
          try {
            localStorage.removeItem(`${DECODE_PREFIX}${hid}`);
          } catch {
            void 0;
          }
        });
      }
      const nextHistory = [record, ...historyRef.current].slice(0, 60);
      setHistoryPersist(nextHistory);
      lastHistoryIdRef.current = id;
      setLastHistoryId(id);
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
    setFeedbackLocked(false);
    setLastHistoryId(null);
    lastHistoryIdRef.current = null;
    lastRunRef.current = null;
    decodeAbortRef.current?.abort();
    decodeAbortRef.current = null;
    if (decodePendingRef.current.raf) cancelAnimationFrame(decodePendingRef.current.raf);
    decodePendingRef.current.raf = 0;
    if (decodePendingRef.current.timer) clearTimeout(decodePendingRef.current.timer);
    decodePendingRef.current.timer = 0;
    decodePendingRef.current.a = "";
    decodePendingRef.current.r = "";
    setDecodePacket(null);
    setDecodeError(null);
    setDecodeStreaming(false);
    setDecodeAnswer("");
    setDecodeReasoning("");
    setDecodeReasoningOpen(false);
    setDecodeAuto(true);
    setDirectSource("current");
    setDecodeHistoryPickId(null);
    try {
      sessionStorage.removeItem(DECODE_OUTPUT_KEY);
    } catch {
      void 0;
    }
  };

  const setHistoryFeedback = (id: string, feedback: HistoryFeedback) => {
    const next = historyRef.current.map((item) => (item.id === id ? { ...item, feedback } : item));
    setHistoryPersist(next);
  };

  const deleteHistoryItem = (id: string) => {
    const next = historyRef.current.filter((item) => item.id !== id);
    setHistoryPersist(next);
    const fallbackId = next[0]?.id ?? null;
    if (lastHistoryIdRef.current === id) lastHistoryIdRef.current = fallbackId;
    if (lastHistoryId === id) setLastHistoryId(fallbackId);
    try {
      localStorage.removeItem(`${DECODE_PREFIX}${id}`);
    } catch {
      void 0;
    }
  };

  const onDislike = () => {
    if (feedbackLocked) return;
    const lastId = lastHistoryIdRef.current;
    if (lastId) setHistoryFeedback(lastId, -1);
    setFeedbackLocked(true);
  };

  const onLike = () => {
    if (!modelRef.current) return;
    if (!lastRunRef.current) return;
    if (feedbackLocked) return;
    const m = modelRef.current;
    const nextLikes = {
      total: m.likes.total + 1,
      liked: m.likes.liked + 1,
    };
    const settle = clamp01(m.runCount / 120);
    const eta = Math.max(0.012, Math.min(0.09, 0.065 - settle * 0.04));
    const fv16 = lastRunRef.current.fv16;
    const theta16 = m.theta16.map((v, i) => clamp01(v + (fv16[i]! - v) * eta));
    const likedRatio = nextLikes.total ? nextLikes.liked / nextLikes.total : 0;
    const policy = defaultPolicyFromTheta(theta16, m.runCount, likedRatio);
    const nextModel: UniverseModelV1 = {
      ...m,
      likes: nextLikes,
      theta16,
      policy,
      updatedAt: Date.now(),
    };
    persistActiveModel(nextModel);
    const lastId = lastHistoryIdRef.current;
    if (lastId) setHistoryFeedback(lastId, 1);
    setFeedbackLocked(true);
  };

  const onCreateNewModelSlot = () => {
    const lib = modelLibraryRef.current ?? ensureUniverseModelLibrary({ legacyModel: modelRef.current, initModel });
    const now = Date.now();
    const id = makeLibraryId();
    const nextModel = initModel();
    const name = `新模型 ${lib.items.length + 1}`;
    const nextLib = addUniverseModelItem(lib, { id, name, model: nextModel, createdAt: now, updatedAt: now }, false);
    persistLibrary(nextLib);
  };

  const onCloneCurrentModelSlot = () => {
    const base = modelRef.current;
    if (!base) return;
    const lib = modelLibraryRef.current ?? ensureUniverseModelLibrary({ legacyModel: base, initModel });
    const now = Date.now();
    const id = makeLibraryId();
    const name = `副本 ${lib.items.length + 1}`;
    const copy: UniverseModelV1 = {
      ...base,
      theta16: [...base.theta16],
      likes: { ...base.likes },
      updatedAt: now,
    };
    const nextLib = addUniverseModelItem(lib, { id, name, model: copy, createdAt: now, updatedAt: now }, false);
    persistLibrary(nextLib);
  };

  const onImportModelAsNewSlot = async (file: File) => {
    const text = await file.text();
    const parsed = safeJsonParse<UniverseModelV1>(text);
    if (!parsed || parsed.v !== 1 || !Number.isFinite(parsed.salt) || !Array.isArray(parsed.theta16) || parsed.theta16.length !== 16) {
      setModelLibraryError("模型格式不正确。");
      return;
    }
    const now = Date.now();
    const likedRatio = parsed.likes?.total ? parsed.likes.liked / parsed.likes.total : 0;
    const policy = parsed.policy ? parsed.policy : defaultPolicyFromTheta(parsed.theta16, parsed.runCount, likedRatio);
    const nextModel: UniverseModelV1 = {
      v: 1,
      salt: parsed.salt >>> 0,
      runCount: Math.max(0, Math.trunc(parsed.runCount ?? 0)),
      theta16: parsed.theta16.map((x) => clamp01(Number(x))),
      policy,
      likes: {
        total: Math.max(0, Math.trunc(parsed.likes?.total ?? 0)),
        liked: Math.max(0, Math.trunc(parsed.likes?.liked ?? 0)),
      },
      updatedAt: now,
    };
    const lib = modelLibraryRef.current ?? ensureUniverseModelLibrary({ legacyModel: modelRef.current, initModel });
    const id = makeLibraryId();
    const name = `导入 ${hex8(nextModel.salt)}-${nextModel.runCount}`;
    const nextLib = addUniverseModelItem(lib, { id, name, model: nextModel, createdAt: now, updatedAt: now }, false);
    persistLibrary(nextLib);
  };

  const onSetActiveModelSlot = (id: string) => {
    const lib = modelLibraryRef.current ?? loadUniverseModelLibrary();
    if (!lib) return;
    applyActiveFromLibrary(setActiveUniverseModel(lib, id));
  };

  const onExportModelSlot = (id: string) => {
    const lib = modelLibraryRef.current ?? loadUniverseModelLibrary();
    const item = lib?.items.find((x) => x.id === id);
    if (!item) return;
    const m = item.model;
    downloadJson(`gua-universe-model-${hex8(m.salt)}-${m.runCount}.json`, m);
  };

  const onRenameModelSlot = (id: string, name: string) => {
    const lib = modelLibraryRef.current ?? loadUniverseModelLibrary();
    if (!lib) return;
    persistLibrary(renameUniverseModelItem(lib, id, name));
  };

  const onDeleteModelSlot = (id: string) => {
    const lib = modelLibraryRef.current ?? loadUniverseModelLibrary();
    if (!lib) return;
    applyActiveFromLibrary(deleteUniverseModelItem(lib, id));
  };

  const canStart = question.trim().length > 0;
  const shortcutHint = "Ctrl/⌘ + Enter";
  const dashboard = useMemo(() => computeDashboardMetrics(model, history, enhanced), [model, history, enhanced]);

  const settingsHelpTitle = useMemo(() => {
    if (settingsHelpTopic === "status") return "现状说明";
    if (settingsHelpTopic === "score") return "评分说明";
    return "维度说明";
  }, [settingsHelpTopic]);

  const settingsHelpMarkdown = useMemo(() => {
    if (settingsHelpTopic === "status") {
      return [
        "## 个人宇宙常量 · 现状",
        "",
        "这块展示的是“当前本机模型”在本设备上的总体状态。",
        "",
        "- **推演次数（runCount）**：本机累计完成归一的次数。",
        "- **演化进度**：`progress = clamp01(runCount / 120)`，越接近 120 越趋于收敛（只是进度条口径，不代表必然稳定）。",
        "- **满意比例**：优先使用模型自身的 `likes` 计数；若 `likes.total` 为 0，则回退使用最近历史反馈统计。",
        "- **自演进策略**：无反馈也会按“结果质量”自动微调 θ16；反馈仅作加速/抑制。",
        "- **签名**：最近一次推演的 `signature`（截断显示）；若无签名则显示模型 salt 的短码。",
      ].join("\n");
    }
    if (settingsHelpTopic === "score") {
      return [
        "## 多维度评分",
        "",
        "这块是对“最近一段时间”推演结果的统计摘要，用于观察趋势，不是现实世界的吉凶承诺。",
        "",
        `- **统计窗口 N**：取最近 \`N = min(20, history.length)\` 条历史。`,
        "- **Score 均值 / 波动**：对最近 N 条的 `score` 计算均值与标准差（波动越大代表近期不稳定/差异更大）。",
        "- **Ω 有限率**：最近 N 条里 `omega` 不是 `\\infty` 的比例，用于粗略观察“可归一到有限值”的占比。",
        "- **反馈倾向**：最近 N 条反馈的平均值（满意=+1，不满意=-1，未评价=0），范围约在 [-1,1]。",
        "- **与自演进的关系**：Score / Ω 有限会参与本机模型的自动更新权重。",
        "- **观测状态**：仅展示增强观测授权与状态（不会上传）。",
      ].join("\n");
    }
    return [
      "## 模型维度（θ16）",
      "",
      "θ16 是本机模型的 16 维权重向量（0..1），用于调制公式生成策略（算子/函数偏好、常数范围、shuffle 等）。",
      "",
      "### θ16 如何变化（训练/更新）",
      "- 每次完成一次推演归一后，会提取本次推演的 16 维指纹 `fv16`。",
      "- 使用奖励加权的指数滑动更新（EMA）：结果质量更高时学得更快，质量更差时会更谨慎。",
      "- `eta` 会随推演次数增大而降低：前期学得快，后期更稳。",
      "- 点击“满意”仍会触发一次更强的更新（eta 更大），加速向你认可的模式靠拢（催化剂）。",
      "- 每 20 次推演会做一次轻量历史整合，把近期高质量模式融合回 θ16，减少在线噪声追随。",
      "",
      "### 为什么稳定度可能一直偏低",
      "- **这里的稳定度不是“次数越多越高”的指标**。它是把 θ16 当作分布计算信息熵：",
      "  - 先归一化：`p[i] = theta[i] / sum(theta)`",
      "  - 熵：`H = -Σ p[i] log2 p[i]`，再归一化到 0..1",
      "  - 稳定度：`stability = 1 - H_norm`",
      "- 当 θ16 各维比较接近（分布更均匀）时，熵高，稳定度就低；这表示模型还没有形成“明显偏好”，不一定是算法错误。",
      "- 如果你的问题类型跨度很大、或输入/观测变化把各维拉向不同方向互相抵消，θ16 会更接近均匀，从而稳定度长期偏低。",
      "",
      "### 这对你意味着什么",
      "- 稳定度低：模型策略更“均衡/泛化”，输出结构多样。",
      "- 稳定度高：模型策略更“偏置/收敛”，输出结构更固定。",
    ].join("\n");
  }, [settingsHelpTopic]);

  const phaseTerms = useMemo(() => {
    const terms = Array.from(new Set(trace.map((item) => item.phase).filter(Boolean)));
    return terms.length > 0 ? terms : ["易经", "融合", "归一"];
  }, [trace]);
  const formulaData = useMemo(() => {
    if (formulaSeed === null) return null;
    return buildFormulaData(formulaSeed, phaseTerms, model?.policy);
  }, [formulaSeed, phaseTerms, model?.policy]);
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
  const phases: Array<{ label: string; value: Phase; enabled: boolean }> = useMemo(() => {
    return [
      { label: "输入", value: "input", enabled: true },
      { label: "推演", value: "computing", enabled: true },
      { label: "归一", value: "result", enabled: true },
      { label: "解码", value: "decode", enabled: true },
    ];
  }, []);
  const phaseIndex = useMemo(() => {
    const idx = phases.findIndex((p) => p.value === activeTab);
    return idx >= 0 ? idx : 0;
  }, [activeTab, phases]);
  const progressPct = useMemo(() => {
    if (trace.length <= 0) return isRunning ? 6 : 0;
    const p = Math.round((traceVisible / Math.max(1, trace.length)) * 100);
    return Math.max(0, Math.min(100, p));
  }, [isRunning, traceVisible, trace.length]);

  const decodeSummary = useMemo(() => {
    const p = decodePacket as
      | {
          input?: { question?: string; nickname?: string; datetimeISO?: string };
          result?: { score?: number; signature?: string; omega?: string; formulaLatex?: string };
          model?: { runCount?: number };
        }
      | null;
    if (!p) return null;
    const score = Number(p.result?.score ?? 0);
    const sig = p.result?.signature ? String(p.result.signature).slice(0, 8) : "—";
    const omega = p.result?.omega ? String(p.result.omega) : "—";
    const questionText = p.input?.question ? String(p.input.question) : "";
    const runCount = Number(p.model?.runCount ?? NaN);
    return { score, sig, omega, questionText, runCount: Number.isFinite(runCount) ? runCount : null };
  }, [decodePacket]);

  const llmLogic = useMemo(() => {
    return [
      "本文描述一种面向“个人宇宙常量”的确定性推演流程。系统以问题、时间与本地观测构造种子，生成可解释的符号参数集，并据此合成表达式结构；推演阶段分层揭示参数与结构，归一阶段将其数值化求解，输出标量Ω及其可复算的代入等式。推演次数越多，本机常量将缓慢收敛，形成专属法则。",
      "",
      "系统四步：输入→推演→归一→解码。",
      "",
      "输入：问题文本 x、起卦时间 t、可选昵称 n。",
      "观测：浏览器被动采集 o（设备/系统/网络/偏好等），可选增强观测 o+（需授权），以及用户交互扰动 e（微熵）。",
      "模型：本机宇宙常量模型 M 存于本地，会随推演次数缓慢收敛。",
      "",
      "推演方法论：",
      "- 用 (t, x, n, o, o+, e, M) 构造种子 s，并驱动可复算的伪随机过程。",
      "- 生成参数集合 Θ（含 Q,T,N,ε,α,β,γ 与阶段因子 Φi），并附带中文语义标签。",
      "- 合成表达式结构 f(·)，得到公式 Ω = f(Θ)。",
      "",
      "归一方法论：",
      "- 对参数闭式进行解析并数值化得到 \\hat{Θ}。",
      "- 对表达式树递归求值，得到 Ω 数值（有限优先）。",
      "- 输出：Ω 等式、Ω 数值、Score（0-100）、可选签文 signature。",
      "",
      "解码原则：解答与启示必须服务于用户，必须落到“对你意味着什么”。问题解答给出问题趋势；模型启示用深读参数引导主观能动性。",
      "趋势原则：趋势可正可负可中性可混合；禁止无证据地总是积极或总是消极。趋势不等于命运，主观能动性可改写路径。",
      "输出格式：必须 Markdown；包含“## 问题解答”“## 模型启示”；两块各包含“### 结论（约100字）”小节，下一行写 80–140 字总结。",
      "",
      "边界：输出不承诺对应现实世界，只承诺对应“你的宇宙”。",
    ].join("\n");
  }, []);

  function loadPacketById(id: string) {
    const saved = safeJsonParse<unknown>(localStorage.getItem(`${DECODE_PREFIX}${id}`));
    if (saved) return saved;
    const item = historyRef.current.find((x) => x && x.v === 1 && x.id === id);
    if (!item) return null;
    return {
      v: 1,
      hid: item.id,
      createdAt: item.createdAt,
      input: {
        question: item.question,
        nickname: item.nickname || undefined,
        datetimeISO: item.datetimeISO,
      },
      result: {
        score: item.score,
        signature: item.signature || undefined,
        omega: item.omega || undefined,
        formulaLatex: item.formulaLatex || undefined,
      },
    };
  }

  useEffect(() => {
    setLlmConfigError(null);
    if (!llmConfig) {
      void (async () => {
        try {
          const res = await fetch("/api/llm/config", { method: "GET" });
          if (!res.ok) {
            const msg = await res.text().catch(() => "");
            throw new Error(msg || `加载模型配置失败（HTTP ${res.status}）`);
          }
          const cfg = (await res.json()) as LlmConfigResponse;
          setLlmConfig(cfg);
          setDecodeModel((prev) => {
            if (decodePrefRestoredRef.current.model || decodePrefTouchedRef.current.model) return prev;
            return cfg.defaults.model;
          });
          setDecodeStreamEnabled((prev) => {
            if (decodePrefRestoredRef.current.stream || decodePrefTouchedRef.current.stream) return prev;
            return cfg.defaults.stream;
          });
          setDecodeThinkingEnabled((prev) => {
            if (decodePrefRestoredRef.current.thinking || decodePrefTouchedRef.current.thinking) return prev;
            return cfg.defaults.thinking;
          });
        } catch (e) {
          setLlmConfigError(e instanceof Error ? e.message : "加载模型配置失败。");
        }
      })();
    }
  }, [llmConfig]);

  useEffect(() => {
    if (activeTab !== "decode") return;

    if (decodeMode === "result_current") {
      const currentId = lastHistoryId ?? historyRef.current[0]?.id ?? null;
      if (!lastHistoryId && currentId) {
        lastHistoryIdRef.current = currentId;
        setLastHistoryId(currentId);
      }
      if (!currentId) {
        setDecodePacket(null);
        setDecodeError("当前暂无归一结果：请先完成一次推演并归一。");
        return;
      }
      const tryIds = [currentId, ...historyRef.current.map((x) => x.id).filter((x) => x !== currentId)];
      const found = tryIds.map((id) => ({ id, packet: loadPacketById(id) })).find((x) => x.packet);
      if (!found) {
        setDecodePacket(null);
        setDecodeError("未找到对应推演记录：请先完成一次推演并归一。");
        return;
      }
      if (found.id !== lastHistoryId) {
        lastHistoryIdRef.current = found.id;
        setLastHistoryId(found.id);
      }
      setDecodePacket(found.packet);
      setDecodeError(null);
      return;
    }

    if (decodeMode === "result_history") {
      if (!decodeHistoryPickId) {
        setDecodePacket(null);
        setDecodeError(null);
        return;
      }
      const packet = loadPacketById(decodeHistoryPickId);
      if (!packet) {
        setDecodePacket(null);
        setDecodeError("未找到对应历史记录。");
        return;
      }
      setDecodePacket(packet);
      setDecodeError(null);
      return;
    }

    if (decodeMode === "model_current") {
      const m = modelRef.current;
      const recent = historyRef.current.slice(0, 20).map((x) => ({
        id: x.id,
        createdAt: x.createdAt,
        datetimeISO: x.datetimeISO,
        question: x.question,
        score: x.score,
        omega: x.omega,
        signature: x.signature,
        feedback: x.feedback,
      }));
      setDecodePacket({
        v: 1,
        model: m,
        dashboard,
        enhanced,
        recent,
      });
      setDecodeError(null);
      return;
    }

    if (decodeMode === "llm_direct") {
      const m = modelRef.current;
      const q = question.trim();
      if (!q) {
        setDecodePacket(null);
        setDecodeError("当前输入为空：请先填写问题文本。");
        return;
      }
      const passive = collectPassiveObservables();
      setDecodePacket({
        logic: llmLogic,
        payload: {
          input: {
            question: q,
            nickname: nickname.trim() ? nickname.trim() : undefined,
            datetimeISO: datetime.toISOString(),
          },
          obs: {
            passive,
            enhanced: enhancedRef.current,
          },
          model: m,
          dashboard,
        },
      });
      setDecodeError(null);
      return;
    }
  }, [activeTab, dashboard, datetime, decodeHistoryPickId, decodeMode, directSource, enhanced, lastHistoryId, llmLogic, nickname, question]);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        DECODE_OUTPUT_KEY,
        JSON.stringify({
          mode: decodeMode,
          model: decodeModel,
          stream: decodeStreamEnabled,
          thinking: decodeThinkingEnabled,
          answer: decodeAnswer,
          reasoning: decodeReasoning,
          reasoningOpen: decodeReasoningOpen,
          auto: decodeAuto,
          directSource,
          historyPickId: decodeHistoryPickId,
          streaming: decodeStreaming,
          updatedAt: Date.now(),
        }),
      );
    } catch {
      return;
    }
  }, [
    decodeAnswer,
    decodeAuto,
    decodeHistoryPickId,
    decodeMode,
    decodeModel,
    decodeReasoning,
    decodeReasoningOpen,
    decodeStreaming,
    decodeStreamEnabled,
    decodeThinkingEnabled,
    directSource,
  ]);

  useEffect(() => {
    const models = llmConfig?.models ?? [];
    const id = (decodeModel ?? "").trim();
    if (!id) {
      setDecodeThinkingSupported(false);
      return;
    }
    const m = models.find((x) => x.id === id);
    const supported = Boolean(m?.thinking);
    setDecodeThinkingSupported(supported);
    if (!supported) setDecodeThinkingEnabled(false);
  }, [decodeModel, llmConfig]);

  const onDecodeStop = () => {
    decodeAbortRef.current?.abort();
    decodeAbortRef.current = null;
    if (decodePendingRef.current.raf) cancelAnimationFrame(decodePendingRef.current.raf);
    decodePendingRef.current.raf = 0;
    if (decodePendingRef.current.timer) clearTimeout(decodePendingRef.current.timer);
    decodePendingRef.current.timer = 0;
    const a = decodePendingRef.current.a;
    const r = decodePendingRef.current.r;
    decodePendingRef.current.a = "";
    decodePendingRef.current.r = "";
    if (a) setDecodeAnswer((prev) => prev + a);
    if (r) setDecodeReasoning((prev) => prev + r);
    setDecodeStreaming(false);
  };

  const scheduleDecodeFlush = useCallback(() => {
    if (decodePendingRef.current.raf) return;
    decodePendingRef.current.raf = requestAnimationFrame(() => {
      decodePendingRef.current.raf = 0;
      const a = decodePendingRef.current.a;
      const r = decodePendingRef.current.r;
      decodePendingRef.current.a = "";
      decodePendingRef.current.r = "";
      if (a) setDecodeAnswer((prev) => prev + a);
      if (r) setDecodeReasoning((prev) => prev + r);
    });
    if (!decodePendingRef.current.timer) {
      decodePendingRef.current.timer = window.setTimeout(() => {
        decodePendingRef.current.timer = 0;
        if (decodePendingRef.current.raf) cancelAnimationFrame(decodePendingRef.current.raf);
        decodePendingRef.current.raf = 0;
        const a = decodePendingRef.current.a;
        const r = decodePendingRef.current.r;
        decodePendingRef.current.a = "";
        decodePendingRef.current.r = "";
        if (a) setDecodeAnswer((prev) => prev + a);
        if (r) setDecodeReasoning((prev) => prev + r);
      }, 200);
    }
  }, []);

  const pushDecodeChunk = useCallback(
    (kind: "c" | "r", delta: string) => {
      if (!delta) return;
      if (kind === "c") decodePendingRef.current.a += delta;
      else decodePendingRef.current.r += delta;
      scheduleDecodeFlush();
    },
    [scheduleDecodeFlush],
  );

  function isNearBottom(node: HTMLDivElement, thresholdPx: number) {
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
    return distance <= thresholdPx;
  }

  const scrollDecodeToBottom = useCallback(() => {
    const node = decodeOutRef.current;
    if (!node) return;
    decodeOutProgrammatic.current = true;
    node.scrollTop = node.scrollHeight;
  }, []);

  const scrollReasonToBottom = useCallback(() => {
    const node = decodeReasonRef.current;
    if (!node) return;
    decodeReasonProgrammatic.current = true;
    node.scrollTop = node.scrollHeight;
  }, []);

  const flushDecodePendingNow = useCallback(() => {
    if (decodePendingRef.current.raf) cancelAnimationFrame(decodePendingRef.current.raf);
    decodePendingRef.current.raf = 0;
    if (decodePendingRef.current.timer) clearTimeout(decodePendingRef.current.timer);
    decodePendingRef.current.timer = 0;
    const a = decodePendingRef.current.a;
    const r = decodePendingRef.current.r;
    decodePendingRef.current.a = "";
    decodePendingRef.current.r = "";
    if (a) setDecodeAnswer((prev) => prev + a);
    if (r) setDecodeReasoning((prev) => prev + r);
  }, []);

  const onDecodeStart = useCallback(async () => {
    if (decodeStreaming) return;
    if (!decodePacket) {
      setDecodeError(decodeMode === "result_history" || directSource === "history" ? "请选择一条历史记录。" : "缺少解码输入。");
      return;
    }

    decodeReasoningManualRef.current = false;
    decodeAutoCollapseArmedRef.current = Boolean(decodeThinkingEnabled);

    const createdAt = Date.now();
    const perfStart = performance.now();
    const exchangeId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `D${hex8(mix32(randU32(), createdAt >>> 0))}`;
    const pkt = decodePacket as {
      hid?: unknown;
      input?: { question?: unknown; nickname?: unknown; datetimeISO?: unknown };
      payload?: { input?: { question?: unknown; nickname?: unknown; datetimeISO?: unknown } };
    };
    const input = pkt?.input ?? pkt?.payload?.input ?? null;
    const summaryQuestion = decodeSummary?.questionText ? decodeSummary.questionText : typeof input?.question === "string" ? input.question : "";
    const summaryNickname = typeof input?.nickname === "string" ? input.nickname : "";
    const summaryDatetimeISO = typeof input?.datetimeISO === "string" ? input.datetimeISO : "";
    const context: DecodeContextRefV1 = typeof pkt?.hid === "string" ? { k: "hid", hid: pkt.hid } : { k: "snapshot", snapshot: decodePacket };
    const historySeed: DecodeAiHistoryItemV1 = {
      v: 1,
      id: exchangeId,
      createdAt,
      mode: decodeMode,
      directSource,
      historyPickId: decodeHistoryPickId,
      options: { model: decodeModel, stream: decodeStreamEnabled, thinking: decodeThinkingEnabled },
      context,
      summary: {
        question: summaryQuestion,
        nickname: summaryNickname,
        datetimeISO: summaryDatetimeISO,
        score: decodeSummary?.score ?? 0,
        omega: decodeSummary?.omega ?? "—",
        signature: decodeSummary?.sig ?? "—",
      },
      response: {
        answer: "",
        reasoning: "",
        error: null,
        aborted: false,
        finishedAt: null,
        durationMs: null,
      },
    };
    setDecodeAiHistoryPersist([historySeed, ...decodeAiHistoryRef.current].slice(0, 80));

    setDecodeError(null);
    setDecodeAnswer("");
    setDecodeReasoning("");
    setDecodeReasoningOpen(Boolean(decodeThinkingEnabled));
    try {
      sessionStorage.setItem(
        DECODE_OUTPUT_KEY,
        JSON.stringify({
          mode: decodeMode,
          model: decodeModel,
          stream: decodeStreamEnabled,
          thinking: decodeThinkingEnabled,
          answer: "",
          reasoning: "",
          reasoningOpen: Boolean(decodeThinkingEnabled),
          auto: decodeAuto,
          directSource,
          historyPickId: decodeHistoryPickId,
          streaming: true,
          updatedAt: Date.now(),
        }),
      );
    } catch {
      void 0;
    }
    setDecodeStreaming(true);
    const ctrl = new AbortController();
    decodeAbortRef.current = ctrl;
    let accAnswer = "";
    let accReasoning = "";
    let errorMessage: string | null = null;
    let aborted = false;
    try {
      await streamDecode({
        mode: decodeMode,
        context: decodePacket,
        options: {
          model: decodeModel,
          stream: decodeStreamEnabled,
          thinking: decodeThinkingEnabled,
        },
        signal: ctrl.signal,
        onContent: (d) => {
          accAnswer += d;
          if (decodeAutoCollapseArmedRef.current && !decodeReasoningManualRef.current) {
            decodeAutoCollapseArmedRef.current = false;
            if (decodeReasoningOpenRef.current) setDecodeReasoningOpen(false);
          }
          pushDecodeChunk("c", d);
        },
        onReasoning: (d) => {
          accReasoning += d;
          pushDecodeChunk("r", d);
        },
      });
      flushDecodePendingNow();
    } catch (e) {
      aborted = (e as { name?: string }).name === "AbortError";
      if (!aborted) {
        errorMessage = e instanceof Error ? e.message : "解码失败。";
        setDecodeError(errorMessage);
      }
    } finally {
      flushDecodePendingNow();
      const finishedAt = Date.now();
      const durationMs = Math.round(Math.max(0, performance.now() - perfStart));
      const next = decodeAiHistoryRef.current.map((x) => {
        if (x.id !== exchangeId) return x;
        return {
          ...x,
          response: {
            answer: accAnswer,
            reasoning: accReasoning,
            error: errorMessage,
            aborted,
            finishedAt,
            durationMs,
          },
        } satisfies DecodeAiHistoryItemV1;
      });
      setDecodeAiHistoryPersist(next);
      setDecodeStreaming(false);
      decodeAbortRef.current = null;
    }
  }, [
    decodeAuto,
    decodeAiHistoryRef,
    decodeHistoryPickId,
    decodeMode,
    decodeModel,
    decodePacket,
    decodeStreamEnabled,
    decodeStreaming,
    decodeSummary,
    decodeThinkingEnabled,
    directSource,
    flushDecodePendingNow,
    pushDecodeChunk,
    setDecodeAiHistoryPersist,
  ]);

  useEffect(() => {
    if (!decodeAutoStartRef.current) return;
    if (activeTab !== "decode") return;
    if (decodeStreaming) return;
    if (decodeMode !== "llm_direct") return;
    if (!decodePacket) return;
    decodeAutoStartRef.current = false;
    void onDecodeStart();
  }, [activeTab, decodeMode, decodePacket, decodeStreaming, onDecodeStart]);

  useEffect(() => {
    if (decodeMode !== "llm_direct") return;
    if (directSource !== "current") setDirectSource("current");
  }, [decodeMode, directSource]);

  useEffect(() => {
    const node = decodeOutRef.current;
    if (!node) return;
    if (!decodeAuto) return;
    if (!decodeStreaming && !decodeAnswer) return;
    scrollDecodeToBottom();
  }, [decodeAnswer, decodeAuto, decodeStreaming, scrollDecodeToBottom]);

  useEffect(() => {
    const node = decodeReasonRef.current;
    if (!node) return;
    if (!decodeAuto) return;
    if (!decodeReasoningOpen) return;
    if (!decodeStreaming && !decodeReasoning) return;
    scrollReasonToBottom();
  }, [decodeAuto, decodeReasoning, decodeReasoningOpen, decodeStreaming, scrollReasonToBottom]);

  useEffect(() => {
    const handler = () => {
      if (activeTab !== "decode") return;
      flushDecodePendingNow();
      if (decodeAuto) {
        scrollDecodeToBottom();
        if (decodeReasoningOpen) scrollReasonToBottom();
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [activeTab, decodeAuto, decodeReasoningOpen, flushDecodePendingNow, scrollDecodeToBottom, scrollReasonToBottom]);

  const decodeAnswerMarkdown = useMemo(() => {
    const t = decodeAnswer || "";
    return normalizeMarkdownLatexEscapes(unwrapOuterMarkdownFence(t));
  }, [decodeAnswer]);

  const decodeReasoningMarkdown = useMemo(() => {
    const t = decodeReasoning || "";
    if (!t.trim()) return "";
    return `> ${t.replace(/\n/g, "\n> ")}`;
  }, [decodeReasoning]);

  const decodeHistoryDetail = useMemo(() => {
    if (!decodeHistoryDetailId) return null;
    return decodeAiHistory.find((x) => x.id === decodeHistoryDetailId) ?? null;
  }, [decodeAiHistory, decodeHistoryDetailId]);

  const shareCard = useShareCard({
    decodeMode,
    decodePacket,
    directSource,
    question,
    history,
    modelRef,
    decodeAnswerMarkdown,
    decodeSummary,
  });

  const decodeHistoryDetailContext = useMemo(() => {
    if (!decodeHistoryDetail) return null;
    if (decodeHistoryDetail.context.k === "hid") return loadPacketById(decodeHistoryDetail.context.hid);
    return decodeHistoryDetail.context.snapshot;
  }, [decodeHistoryDetail]);

  const decodeHistoryDetailContextJson = useMemo(() => {
    if (!decodeHistoryDetailContext) return "";
    try {
      return JSON.stringify(decodeHistoryDetailContext, null, 2);
    } catch {
      return "";
    }
  }, [decodeHistoryDetailContext]);

  const decodeHistoryAnswerMarkdown = useMemo(() => {
    if (!decodeHistoryDetail) return "";
    return normalizeMarkdownLatexEscapes(unwrapOuterMarkdownFence(decodeHistoryDetail.response.answer || ""));
  }, [decodeHistoryDetail]);

  const decodeHistoryReasoningMarkdown = useMemo(() => {
    if (!decodeHistoryDetail) return "";
    const t = decodeHistoryDetail.response.reasoning || "";
    if (!t.trim()) return "";
    return `> ${t.replace(/\n/g, "\n> ")}`;
  }, [decodeHistoryDetail]);

  const divinationHistoryDetail = useMemo(() => {
    if (!divinationHistoryDetailId) return null;
    return history.find((x) => x.id === divinationHistoryDetailId) ?? null;
  }, [divinationHistoryDetailId, history]);

  const divinationHistoryDetailPacket = useMemo(() => {
    if (!divinationHistoryDetail) return null;
    return loadPacketById(divinationHistoryDetail.id);
  }, [divinationHistoryDetail]);

  const divinationHistoryDetailPacketJson = useMemo(() => {
    if (!divinationHistoryDetailPacket) return "";
    try {
      return JSON.stringify(divinationHistoryDetailPacket, null, 2);
    } catch {
      return "";
    }
  }, [divinationHistoryDetailPacket]);

  const divinationHistoryDetailFormulaMarkdown = useMemo(() => {
    const p = divinationHistoryDetailPacket as { result?: { formulaLatex?: unknown } } | null;
    const latex = p && typeof p.result?.formulaLatex === "string" ? p.result.formulaLatex : "";
    if (!latex.trim()) return "";
    return ["", "", "$$", latex, "$$"].join("\n");
  }, [divinationHistoryDetailPacket]);

  const divinationHistoryDetailTraceMarkdown = useMemo(() => {
    const p = divinationHistoryDetailPacket as { trace?: unknown } | null;
    const t = p?.trace;
    return Array.isArray(t) ? buildScienceMarkdown(t as DivinationTraceEvent[]) : "";
  }, [divinationHistoryDetailPacket]);

  return (
    <Box className="gua-bg" mih="100dvh">
      <Container size="sm" py={64} className="gua-shell" style={{ flex: "1 0 auto" }}>
        <Stack gap={32} className="gua-main-stack">
          <Stack gap={10} align="center" className="gua-hero">
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
                  <path d="M12 20.3a.8.8 0 1 0 0-1.6.8.8 0 0 0 0 1.6Z" fill="currentColor" />
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
              这不是算命，是推演你的宇宙常量：同一输入同一设备同一输出，推演可追踪，归一可复算。
            </Text>

            <Box className="gua-viz-shell" style={{ width: "100%" }}>
              <UniverseModelViz
                model={model}
                height={180}
                className="gua-viz"
                mode={modelVizMode}
                onModeChange={setModelVizMode}
                onClick={() => setModelBoardOpen(true)}
              />
            </Box>
          </Stack>

          <Stack gap={8} className="gua-phase">
            <Group justify="space-between" className="gua-phase-labels">
              {phases.map((p, index) => {
                return (
                  <UnstyledButton
                    key={p.label}
                    className="gua-phase-tab"
                    onClick={() => {
                      if (!p.enabled) return;
                      setActiveTab(p.value);
                    }}
                    aria-current={activeTab === p.value ? "page" : undefined}
                  >
                    <Text fz="xs" className={index === phaseIndex ? "gua-phase-active" : "gua-phase-idle"}>
                      {p.label}
                    </Text>
                  </UnstyledButton>
                );
              })}
            </Group>
            <Box className="gua-stepper">
              {phases.map((p, index) => {
                return (
                  <UnstyledButton
                    key={p.label}
                    className="gua-phase-tab"
                    onClick={() => {
                      if (!p.enabled) return;
                      setActiveTab(p.value);
                    }}
                  >
                    <Box className={index === phaseIndex ? "gua-step gua-step-active" : "gua-step"} />
                  </UnstyledButton>
                );
              })}
            </Box>
            <Text fz="xs" className="gua-phase-current">
              当前页面 · {phases[phaseIndex]?.label ?? "输入"}
            </Text>
          </Stack>

          <Group justify="space-between" align="center" className="gua-controls">
            <Group gap="xs">
              <ActionIcon variant="subtle" color="gray" radius="xl" aria-label="AI 配置" onClick={() => setAiConfigOpen(true)}>
                <Text fw={700} fz="xs">
                  AI
                </Text>
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                color="gray"
                radius="xl"
                aria-label="推演历史"
                onClick={() => setDivinationHistoryOpen(true)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M12 8v4.6l3 1.8"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
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
              <ActionIcon
                variant="subtle"
                color="gray"
                radius="xl"
                aria-label="解码历史"
                onClick={() => setDecodeHistoryOpen(true)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M8.2 8.6 5.4 12l2.8 3.4"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M15.8 8.6 18.6 12l-2.8 3.4"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M10.6 18.2 13.4 5.8"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                color="gray"
                radius="xl"
                aria-label="设置"
                onClick={() => setSettingsOpen(true)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M19.4 13.6c.1-.5.1-1 .1-1.6s0-1.1-.1-1.6l2-1.5-2-3.4-2.4 1a8.6 8.6 0 0 0-2.7-1.6L14 2h-4l-.3 2.3c-1 .3-2 .9-2.7 1.6l-2.4-1-2 3.4 2 1.5c-.1.5-.1 1-.1 1.6s0 1.1.1 1.6l-2 1.5 2 3.4 2.4-1c.7.7 1.7 1.2 2.7 1.6L10 22h4l.3-2.3c1-.3 2-.9 2.7-1.6l2.4 1 2-3.4-2-1.5Z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </ActionIcon>
              <Button radius="xl" variant="default" onClick={onReset}>
                重置
              </Button>
              <Button radius="xl" variant="default" onClick={onTerminate} disabled={!isRunning}>
                终止
              </Button>
              <Button radius="xl" variant="default" onClick={shareCard.open}>
                分享卡片
              </Button>
            </Group>
            <Group gap="xs">
              {activeTab === "input" ? (
                <Button
                  radius="xl"
                  variant="default"
                  disabled={!canStart}
                  onClick={() => {
                    const q = question.trim();
                    if (!q) {
                      setError("目标/问题不可为空。");
                      return;
                    }
                    setError(null);
                    decodeAutoStartRef.current = true;
                    setDecodeMode("llm_direct");
                    setDirectSource("current");
                    setActiveTab("decode");
                  }}
                >
                  AI推演
                </Button>
              ) : null}
              <Button radius="xl" onClick={onStart} disabled={!canStart}>
                {runPhase === "input" && trace.length === 0 && !result ? "开始推演" : "再推演一次"}
              </Button>
            </Group>
          </Group>

          <InputTabSection
            active={activeTab === "input"}
            question={question}
            setQuestion={(next) => setQuestion(next)}
            datetimeValue={datetimeValue}
            setDatetimeValue={(next) => setDatetimeValue(next)}
            nickname={nickname}
            setNickname={(next) => setNickname(next)}
            shortcutHint={shortcutHint}
            canStart={canStart}
            onStart={onStart}
            modelRunCount={model?.runCount ?? null}
            error={error}
          />

          <ComputingTabSection
            active={activeTab === "computing"}
            hasData={trace.length > 0 || isRunning || formulaSeed !== null}
            traceLength={trace.length}
            traceVisible={traceVisible}
            progressPct={progressPct}
            isRunning={isRunning}
            computeSpeedMul={computeSpeedMul}
            onSpeedUp={() => {
              setComputeSpeedMul((prev) => {
                const next = Math.min(16, prev * 2);
                const resolved = Number.isFinite(next) ? next : prev;
                computeSpeedMulRef.current = resolved;
                return resolved;
              });
            }}
            onGoInput={() => setActiveTab("input")}
            formulaMarkdown={formulaMarkdown}
            progressiveParams={progressiveParams}
            scienceMarkdown={scienceMarkdown}
            lunarMarkdown={lunarMarkdown}
          />

          <ResultTabSection
            active={activeTab === "result"}
            result={result}
            runPhase={runPhase}
            resultMarkdown={resultMarkdown}
            isRunning={isRunning}
            traceLength={trace.length}
            lastHistoryId={lastHistoryId}
            lastHistoryIdRef={lastHistoryIdRef}
            onDecodeClick={() => {
              setDecodeMode("result_current");
              setDirectSource("current");
              setActiveTab("decode");
            }}
            onDislike={onDislike}
            onLike={onLike}
            feedbackLocked={feedbackLocked}
            model={model}
            setActiveTab={setActiveTab}
          />

          {activeTab === "decode" ? (
            <DecodeTabContent
              decodeMode={decodeMode}
              setDecodeMode={setDecodeMode}
              directSource={directSource}
              setDirectSource={setDirectSource}
              decodeHistoryPickId={decodeHistoryPickId}
              setDecodeHistoryPickId={setDecodeHistoryPickId}
              history={history}
              onBack={() => setActiveTab(result && runPhase === "result" ? "result" : "input")}
              summaryText={
                decodeMode === "model_current"
                  ? `runCount=${decodeSummary?.runCount ?? (model?.runCount ?? 0)}`
                  : decodeSummary?.questionText
                    ? decodeSummary.questionText
                    : decodeMode === "llm_direct" && directSource === "current"
                      ? question.trim() || "（当前输入为空）"
                      : "—"
              }
              decodeError={decodeError}
              decodeAuto={decodeAuto}
              setDecodeAuto={setDecodeAuto}
              decodeThinkingEnabled={decodeThinkingEnabled}
              decodeReasoning={decodeReasoning}
              decodeReasoningOpen={decodeReasoningOpen}
              setDecodeReasoningOpen={setDecodeReasoningOpen}
              decodeStreaming={decodeStreaming}
              decodePacket={decodePacket}
              onDecodeStart={onDecodeStart}
              onDecodeStop={onDecodeStop}
              decodeAnswerMarkdown={decodeAnswerMarkdown}
              decodeReasoningMarkdown={decodeReasoningMarkdown}
              decodeOutRef={decodeOutRef}
              decodeReasonRef={decodeReasonRef}
              decodeOutProgrammatic={decodeOutProgrammatic}
              decodeReasonProgrammatic={decodeReasonProgrammatic}
              decodeReasoningManualRef={decodeReasoningManualRef}
              decodeAutoCollapseArmedRef={decodeAutoCollapseArmedRef}
              isNearBottom={isNearBottom}
              scrollDecodeToBottom={scrollDecodeToBottom}
              scrollReasonToBottom={scrollReasonToBottom}
            />
          ) : null}

        </Stack>
      </Container>

      <footer className="gua-footer-bar">
        <div className="gua-footer-inner">
          <a className="gua-footer-mark" href="https://github.com/MindMobius/GUA" target="_blank" rel="noreferrer">
            <svg viewBox="0 0 180 48" role="img" aria-label="GUA" className="gua-footer-mark-svg">
              <path
                d="M38 12.8c-6.9 0-12.5 5.6-12.5 12.5S31.1 37.8 38 37.8c3.7 0 7.1-1.6 9.4-4.2v-8.4H37.2v-4.8H52.2v15.8c-3.6 4.3-8.9 7-14.2 7-9.6 0-17.5-7.9-17.5-17.5S28.4 7.8 38 7.8c5.1 0 9.9 2.2 13.3 5.8l-3.6 3.2c-2.4-2.6-5.8-4-9.7-4Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.2"
                strokeLinejoin="miter"
              />
              <path
                d="M73 9.8v20.9c0 4.5 3.1 7.5 7.9 7.5s7.9-3 7.9-7.5V9.8h5v21.3c0 7.3-5.2 12.1-12.9 12.1S68 38.4 68 31.1V9.8h5Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.2"
                strokeLinejoin="miter"
              />
              <path
                d="M126.6 9.8h5.7l13 33h-5.4l-3.2-8.3h-14.5l-3.2 8.3h-5.4l13-33Zm-2.7 20h10.9l-5.4-14.2-5.5 14.2Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.2"
                strokeLinejoin="miter"
              />
            </svg>
          </a>
          <a className="gua-footer-github" href="https://github.com/MindMobius/GUA" target="_blank" rel="noreferrer" aria-label="GitHub 仓库">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
              <path
                d="M12 2c5.5 0 10 4.6 10 10.3 0 4.6-2.9 8.5-7 9.9-.5.1-.7-.2-.7-.5v-1.9c0-.7-.2-1.1-.5-1.4 2.2-.3 4.5-1.1 4.5-5.2 0-1.2-.4-2.2-1.1-3 .1-.3.5-1.4-.1-3-1-.3-3.1 1.2-3.1 1.2-.9-.3-1.9-.4-2.9-.4s-2 .1-2.9.4c0 0-2.1-1.5-3.1-1.2-.6 1.6-.2 2.7-.1 3-.7.8-1.1 1.8-1.1 3 0 4.1 2.3 4.9 4.5 5.2-.2.2-.4.5-.5.9-.4.2-1.5.6-2.2-.7-.4-.7-1.1-.8-1.1-.8-.7 0 0 .5 0 .5.5.2.8.9.8.9.4 1.3 2.4.9 2.4.9v1.4c0 .3-.2.6-.7.5-4.1-1.4-7-5.3-7-9.9C2 6.6 6.5 2 12 2Z"
                fill="currentColor"
              />
            </svg>
          </a>
        </div>
      </footer>

      <Modal opened={modelBoardOpen} onClose={() => setModelBoardOpen(false)} size="xl" centered title="模型看板">
        <Stack gap="md">
          <Box className="gua-float-text">
            <Text fz="xs" c="dimmed">
              该视觉由本机模型参数确定性生成：导入同一模型到其他设备会呈现一致形态。
            </Text>
          </Box>
          <Box className="gua-viz-shell" style={{ overflow: "hidden" }}>
            <UniverseModelViz
              model={model}
              height={440}
              className="gua-viz"
              mode={modelVizMode}
              onModeChange={setModelVizMode}
              showControls
            />
          </Box>
        </Stack>
      </Modal>

      <Modal opened={aboutOpen} onClose={() => setAboutOpen(false)} size="lg" centered title="算法说明">
        <MarkdownStream content={ABOUT_ALGORITHM_MARKDOWN} />
      </Modal>

      <SettingsModals
        opened={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        helpOpened={settingsHelpOpen}
        onHelpClose={() => setSettingsHelpOpen(false)}
        helpTitle={settingsHelpTitle}
        helpMarkdown={settingsHelpMarkdown}
        openHelpTopic={(topic) => {
          setSettingsHelpTopic(topic);
          setSettingsHelpOpen(true);
        }}
        dashboard={dashboard}
        historyLength={history.length}
        modelLibrary={modelLibrary}
        model={model}
        modelLibraryError={modelLibraryError}
        onCreateNewModelSlot={onCreateNewModelSlot}
        onCloneCurrentModelSlot={onCloneCurrentModelSlot}
        onImportModelAsNewSlot={onImportModelAsNewSlot}
        onSetActiveModelSlot={onSetActiveModelSlot}
        onExportModelSlot={onExportModelSlot}
        onDeleteModelSlot={onDeleteModelSlot}
        onRenameModelSlot={onRenameModelSlot}
        enhanced={enhanced}
        requestEnhanced={requestEnhanced}
      />

      <DivinationHistoryModals
        opened={divinationHistoryOpen}
        onClose={() => setDivinationHistoryOpen(false)}
        items={history}
        openDetail={(id) => setDivinationHistoryDetailId(id)}
        detail={divinationHistoryDetail}
        closeDetail={() => setDivinationHistoryDetailId(null)}
        formatIsoMinute={formatIsoMinute}
        onSetFeedback={setHistoryFeedback}
        onDelete={(id) => {
          deleteHistoryItem(id);
          if (divinationHistoryDetailId === id) setDivinationHistoryDetailId(null);
        }}
        detailFormulaMarkdown={divinationHistoryDetailFormulaMarkdown}
        detailTraceMarkdown={divinationHistoryDetailTraceMarkdown}
        detailPacketJson={divinationHistoryDetailPacketJson}
      />

      <DecodeHistoryModals
        opened={decodeHistoryOpen}
        onClose={() => setDecodeHistoryOpen(false)}
        items={decodeAiHistory}
        openDetail={(id) => setDecodeHistoryDetailId(id)}
        detail={decodeHistoryDetail}
        closeDetail={() => setDecodeHistoryDetailId(null)}
        formatIsoMinute={formatIsoMinute}
        previewFromMarkdown={previewFromMarkdown}
        decodeHistoryAnswerMarkdown={decodeHistoryAnswerMarkdown}
        decodeHistoryReasoningMarkdown={decodeHistoryReasoningMarkdown}
        decodeHistoryDetailContextJson={decodeHistoryDetailContextJson}
      />

      <ShareCardModal
        opened={shareCard.opened}
        onClose={shareCard.close}
        template={shareCard.template}
        setTemplate={shareCard.setTemplate}
        busy={shareCard.busy}
        busyText={shareCard.busyText}
        busyPct={shareCard.busyPct}
        error={shareCard.error}
        previewUrl={shareCard.previewUrl}
        blobPresent={Boolean(shareCard.blob)}
        qrDataUrl={shareCard.qrDataUrl}
        copySupported={shareCard.copySupported}
        onGenerate={() => void shareCard.generate()}
        onDownload={shareCard.download}
        onCopy={() => void shareCard.copy()}
        sharePosterRef={shareCard.sharePosterRef}
        sharePosterProps={shareCard.sharePosterProps}
      />

      <AiConfigModal
        opened={aiConfigOpen}
        onClose={() => setAiConfigOpen(false)}
        llmConfig={llmConfig}
        llmConfigError={llmConfigError}
        decodeModel={decodeModel}
        setDecodeModel={setDecodeModelFromUser}
        decodeStreamEnabled={decodeStreamEnabled}
        setDecodeStreamEnabled={setDecodeStreamEnabledFromUser}
        decodeThinkingEnabled={decodeThinkingEnabled}
        setDecodeThinkingEnabled={setDecodeThinkingEnabledFromUser}
        decodeThinkingSupported={decodeThinkingSupported}
        onResetDefaults={() => {
          const d = llmConfig?.defaults;
          if (!d) return;
          setDecodeModelFromUser(d.model);
          setDecodeStreamEnabledFromUser(d.stream);
          setDecodeThinkingEnabledFromUser(d.thinking);
        }}
      />
    </Box>
  );
}
