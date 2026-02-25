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
  Progress,
  Switch,
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
import type { DivinationExtras, DivinationResult, DivinationTraceEvent } from "@/utils/divinationEngine";
import { divineWithTrace } from "@/utils/divinationEngine";
import { buildFormulaData, type FormulaParam, type FormulaPolicy } from "@/utils/formulaEngine";

type Phase = "input" | "computing" | "result";

type UniverseModelV1 = {
  v: 1;
  salt: number;
  runCount: number;
  theta16: number[];
  policy: FormulaPolicy;
  likes: { total: number; liked: number };
  updatedAt: number;
};

type EnhancedStateV1 = {
  v: 1;
  enabled: boolean;
  geo: "unknown" | "granted" | "denied" | "error";
  motion: "unknown" | "granted" | "denied" | "error";
  lastGeo?: { lat: number; lon: number; acc: number };
  lastMotion?: { a: number; b: number; g: number };
};

type HistoryFeedback = -1 | 0 | 1;

type HistoryItemV1 = {
  v: 1;
  id: string;
  createdAt: number;
  questionHash: number;
  question: string;
  datetimeISO: string;
  nicknameHash: number;
  nickname: string;
  score: number;
  signature?: string;
  root?: string;
  formulaLatex?: string;
  omega?: string;
  features16: number[];
  feedback: HistoryFeedback;
};

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

const MODEL_KEY = "gua.universeModel.v1";
const ENHANCED_KEY = "gua.universeEnhanced.v1";
const HISTORY_KEY = "gua.history.v1";

function clamp01(n: number) {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function hex8(n: number) {
  return (n >>> 0).toString(16).padStart(8, "0");
}

function randU32() {
  try {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] >>> 0;
  } catch {
    return (mix32(0x12345678, Date.now() >>> 0) ^ mix32(0x9e3779b9, performance.now() >>> 0)) >>> 0;
  }
}

function hashStr32(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h = mix32(h, s.charCodeAt(i));
  }
  return h >>> 0;
}

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function normalizeLite(s: string) {
  return s.trim().replace(/\s+/g, " ");
}

function computeHistoryPrior16(history: HistoryItemV1[]) {
  const acc = Array.from({ length: 16 }, () => 0);
  let sumW = 0;
  for (const item of history) {
    const w = item.feedback === 1 ? 1 : item.feedback === 0 ? 0.35 : 0.12;
    if (!item.features16 || item.features16.length !== 16) continue;
    sumW += w;
    for (let i = 0; i < 16; i += 1) acc[i] = (acc[i] ?? 0) + clamp01(Number(item.features16[i])) * w;
  }
  if (sumW <= 0) return null;
  return acc.map((x) => clamp01(x / sumW));
}

function computeDashboardMetrics(model: UniverseModelV1 | null, history: HistoryItemV1[], enhanced: EnhancedStateV1) {
  const recent = history.slice(0, 20);
  const scores = recent.map((x) => (Number.isFinite(x.score) ? x.score : 0));
  const scoreMean = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const scoreStd = scores.length
    ? Math.sqrt(scores.reduce((acc, s) => acc + (s - scoreMean) * (s - scoreMean), 0) / scores.length)
    : 0;

  const omegaFiniteRatio01 = recent.length
    ? recent.filter((x) => typeof x.omega === "string" && x.omega.length > 0 && !x.omega.includes("\\infty")).length / recent.length
    : 0;

  const feedbackBias = recent.length ? recent.reduce((acc, x) => acc + (x.feedback ?? 0), 0) / recent.length : 0;
  const likedFromHistory = recent.filter((x) => x.feedback === 1).length;
  const totalFromHistory = recent.filter((x) => x.feedback !== 0).length;

  const likesRatio01 = model
    ? model.likes.total
      ? model.likes.liked / model.likes.total
      : totalFromHistory
        ? likedFromHistory / totalFromHistory
        : 0
    : totalFromHistory
      ? likedFromHistory / totalFromHistory
      : 0;

  const theta16 = model?.theta16?.length === 16 ? model.theta16.map((x) => clamp01(Number(x))) : Array.from({ length: 16 }, () => 0.5);
  const sumTheta = theta16.reduce((acc, v) => acc + Math.max(0, v), 0) || 1;
  const p = theta16.map((v) => Math.max(0, v) / sumTheta);
  const h = p.reduce((acc, pi) => (pi > 1e-12 ? acc - pi * Math.log2(pi) : acc), 0);
  const thetaEntropy01 = clamp01(h / (Math.log2(p.length || 1) || 1));
  const thetaStability01 = clamp01(1 - thetaEntropy01);

  const recentSignature =
    (typeof history[0]?.signature === "string" && history[0].signature) ||
    (typeof model?.salt === "number" ? hex8(model.salt) : null);

  return {
    runCount: model?.runCount ?? 0,
    progress01: clamp01((model?.runCount ?? 0) / 120),
    likesRatio01: clamp01(likesRatio01),
    scoreMean,
    scoreStd,
    omegaFiniteRatio01: clamp01(omegaFiniteRatio01),
    feedbackBias: Math.max(-1, Math.min(1, feedbackBias)),
    feedbackCounts: {
      liked: recent.filter((x) => x.feedback === 1).length,
      disliked: recent.filter((x) => x.feedback === -1).length,
      total: recent.length,
    },
    theta16,
    thetaStability01,
    enhancedStatus: {
      enabled: Boolean(enhanced.enabled),
      geo: enhanced.geo,
      motion: enhanced.motion,
      hasLastGeo: Boolean(enhanced.lastGeo),
      hasLastMotion: Boolean(enhanced.lastMotion),
    },
    recentSignature,
  };
}

function defaultPolicyFromTheta(theta16: number[], runCount: number, likedRatio: number): FormulaPolicy {
  const t = (i: number) => clamp01(theta16[i] ?? 0.5);
  const settle = clamp01(runCount / 80);
  const likeBoost = clamp01(likedRatio);
  const pFrac = clamp01(0.22 - settle * 0.1 + (t(9) - 0.5) * 0.06);
  const pPow = clamp01(0.2 - settle * 0.06 + (t(10) - 0.5) * 0.06);
  const pFunc = clamp01(0.2 - settle * 0.08 + (t(11) - 0.5) * 0.06);
  const pOp = clamp01(1 - (pFrac + pPow + pFunc));
  const shuffleP = clamp01(0.38 - settle * 0.22 - likeBoost * 0.12 + (t(12) - 0.5) * 0.08);

  const opsW = [
    clamp01(0.9 + (t(13) - 0.5) * 0.5),
    clamp01(0.9 + (t(14) - 0.5) * 0.5),
    clamp01(0.9 + (t(15) - 0.5) * 0.5),
  ];
  const funcsW = [
    clamp01(0.9 + (t(0) - 0.5) * 0.6),
    clamp01(0.9 + (t(1) - 0.5) * 0.6),
    clamp01(0.9 + (t(2) - 0.5) * 0.6),
    clamp01(0.9 + (t(3) - 0.5) * 0.6),
    clamp01(0.9 + (t(4) - 0.5) * 0.6),
  ];

  const constMin = Math.max(1, Math.round(2 - settle + (t(5) - 0.5) * 2));
  const constMax = Math.max(constMin, Math.round(6 - settle * 2 + (t(6) - 0.5) * 3));

  return {
    pOp,
    pFrac,
    pPow,
    pFunc,
    opsW,
    funcsW,
    constMin,
    constMax,
    shuffleP,
  };
}

function initModel(): UniverseModelV1 {
  const theta16 = Array.from({ length: 16 }, () => 0.5);
  const likes = { total: 0, liked: 0 };
  const policy = defaultPolicyFromTheta(theta16, 0, 0);
  return {
    v: 1,
    salt: randU32(),
    runCount: 0,
    theta16,
    policy,
    likes,
    updatedAt: Date.now(),
  };
}

function deriveFormulaSeed(entropy: number, model: UniverseModelV1, obsHash: number) {
  const settle = clamp01(model.runCount / 96);
  const bucket = Math.max(1, Math.floor(1 + settle * 9));
  const drift = mix32(model.salt, Math.floor(model.runCount / bucket));
  const thetaHash = model.theta16.reduce((acc, v, i) => mix32(acc, (Math.round(clamp01(v) * 1e6) ^ (i * 131)) >>> 0), 0x9e3779b9);
  const h = mix32(mix32(entropy, obsHash), mix32(drift, thetaHash));
  return h >>> 0;
}

function collectPassiveObservables() {
  const nav = typeof navigator !== "undefined" ? navigator : null;
  const scr = typeof screen !== "undefined" ? screen : null;
  const tz = -new Date().getTimezoneOffset() / 60;
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio ?? 1 : 1;
  const lang = nav?.language ?? "unknown";
  const hc = (nav as unknown as { hardwareConcurrency?: number })?.hardwareConcurrency ?? 4;
  const dm = (nav as unknown as { deviceMemory?: number })?.deviceMemory ?? 4;
  const w = scr?.width ?? 0;
  const h = scr?.height ?? 0;
  const prefDark = typeof window !== "undefined" ? (window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false) : false;
  const prefReduce = typeof window !== "undefined" ? (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false) : false;
  const conn = (nav as unknown as { connection?: { effectiveType?: string; rtt?: number; downlink?: number } })?.connection;
  const effectiveType = conn?.effectiveType ?? "unknown";
  const rtt = conn?.rtt ?? 0;
  const downlink = conn?.downlink ?? 0;

  const fp8 = [
    clamp01((tz + 12) / 26),
    clamp01(Math.log2(Math.max(1, hc)) / 6),
    clamp01(Math.max(0, Math.min(16, dm)) / 16),
    clamp01(Math.log2(Math.max(1, w * h)) / 24),
    clamp01(Math.max(0.5, Math.min(3, dpr)) / 3),
    clamp01(prefDark ? 0.78 : 0.22),
    clamp01(prefReduce ? 0.78 : 0.22),
    clamp01(effectiveType === "4g" ? 0.9 : effectiveType === "3g" ? 0.65 : effectiveType === "2g" ? 0.45 : 0.55),
  ];

  let hash = 0x811c9dc5;
  hash = mix32(hash, Math.round(tz * 1000));
  hash = mix32(hash, Math.round(dpr * 1000));
  hash = mix32(hash, hc >>> 0);
  hash = mix32(hash, Math.round(dm * 1000));
  hash = mix32(hash, (w << 16) ^ h);
  hash = mix32(hash, prefDark ? 1 : 0);
  hash = mix32(hash, prefReduce ? 1 : 0);
  hash = mix32(hash, hashStr32(effectiveType));
  hash = mix32(hash, Math.round(rtt * 10));
  hash = mix32(hash, Math.round(downlink * 100));
  hash = mix32(hash, hashStr32(lang));

  return { hash: hash >>> 0, fp8 };
}

function downloadJson(filename: string, data: unknown) {
  const text = JSON.stringify(data, null, 2);
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CyberGuaApp() {
  const [runPhase, setRunPhase] = useState<Phase>("input");
  const [activeTab, setActiveTab] = useState<Phase>("input");
  const [isRunning, setIsRunning] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [nickname, setNickname] = useState("");
  const [model, setModel] = useState<UniverseModelV1 | null>(null);
  const [enhanced, setEnhanced] = useState<EnhancedStateV1>({
    v: 1,
    enabled: false,
    geo: "unknown",
    motion: "unknown",
  });
  const [history, setHistory] = useState<HistoryItemV1[]>([]);

  const [datetimeValue, setDatetimeValue] = useState(() => toDatetimeLocalValue(new Date()));
  const datetime = useMemo(() => parseDatetimeLocalValue(datetimeValue), [datetimeValue]);

  const [result, setResult] = useState<DivinationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trace, setTrace] = useState<DivinationTraceEvent[]>([]);
  const [traceVisible, setTraceVisible] = useState(0);
  const [formulaSeed, setFormulaSeed] = useState<number | null>(null);
  const [feedbackLocked, setFeedbackLocked] = useState(false);

  const runIdRef = useRef(0);
  const modelRef = useRef<UniverseModelV1 | null>(null);
  const lastRunRef = useRef<{ fv16: number[]; entropy: number; obsHash: number } | null>(null);
  const lastHistoryIdRef = useRef<string | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);
  const enhancedWriteRef = useRef(0);
  const enhancedRef = useRef(enhanced);
  const historyRef = useRef<HistoryItemV1[]>([]);

  function setEnhancedPersist(next: EnhancedStateV1) {
    setEnhanced(next);
    localStorage.setItem(ENHANCED_KEY, JSON.stringify(next));
  }

  function setHistoryPersist(next: HistoryItemV1[]) {
    setHistory(next);
    historyRef.current = next;
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  }

  const entropyRef = useRef({
    seed: 0x12345678,
    lastT: 0,
    lastX: 0,
    lastY: 0,
    has: false,
  });

  useEffect(() => {
    const loaded = safeJsonParse<UniverseModelV1>(localStorage.getItem(MODEL_KEY));
    if (loaded && loaded.v === 1 && Number.isFinite(loaded.salt) && Array.isArray(loaded.theta16) && loaded.theta16.length === 16) {
      const likedRatio = loaded.likes?.total ? loaded.likes.liked / loaded.likes.total : 0;
      const policy = loaded.policy ? loaded.policy : defaultPolicyFromTheta(loaded.theta16, loaded.runCount, likedRatio);
      const next: UniverseModelV1 = {
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
      };
      queueMicrotask(() => {
        setModel(next);
        modelRef.current = next;
      });
    } else {
      const next = initModel();
      localStorage.setItem(MODEL_KEY, JSON.stringify(next));
      queueMicrotask(() => {
        setModel(next);
        modelRef.current = next;
      });
    }

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

  const onStart = async () => {
    const q = question.trim();
    if (!q) {
      setError("目标/问题不可为空。");
      return;
    }

    runIdRef.current += 1;
    const runId = runIdRef.current;
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

      const totalMs = 20000;
      const baseDelay = Math.floor(totalMs / Math.max(1, steps.length));
      for (let i = 0; i < steps.length; i += 1) {
        if (runIdRef.current !== runId) return;
        setTraceVisible(i + 1);
        const phaseBoost =
          steps[i]?.phase === "易经" ? 180 : steps[i]?.phase === "融合" ? 140 : steps[i]?.phase === "归一" ? 220 : 0;
        const jitter = Math.floor(((mix32(entropy, i + 31) >>> 0) % 160) - 80);
        await sleep(Math.max(18, baseDelay + phaseBoost + jitter));
      }

      if (runIdRef.current !== runId) return;
      await sleep(260);

      setResult(res);
      setRunPhase("result");
      setIsRunning(false);
      setActiveTab("result");

      const fp = steps.find((evt) => evt.phase === "融合" && evt.message === "多学科指纹")?.fp ?? steps.find((evt) => evt.phase === "融合" && evt.message === "多学科因子注入")?.fp;
      const fp8 = (fp && fp.length >= 8 ? fp.slice(0, 8) : Array.from({ length: 8 }, () => 0.5)).map((x) => clamp01(Number(x)));
      const fv16 = [...fp8, ...obsFp8.map((x) => clamp01(Number(x)))].slice(0, 16);
      lastRunRef.current = { fv16, entropy, obsHash };

      const nextRunCount = Math.max(0, currentModel.runCount) + 1;
      const settle = clamp01(nextRunCount / 120);
      const eta = Math.max(0.008, Math.min(0.042, 0.04 - settle * 0.022));
      const theta16 = currentModel.theta16.map((v, i) => clamp01(v + (fv16[i]! - v) * eta));
      const likedRatio = currentModel.likes.total ? currentModel.likes.liked / currentModel.likes.total : 0;
      const policy = defaultPolicyFromTheta(theta16, nextRunCount, likedRatio);
      const nextModel: UniverseModelV1 = {
        ...currentModel,
        runCount: nextRunCount,
        theta16,
        policy,
        updatedAt: Date.now(),
      };
      setModel(nextModel);
      modelRef.current = nextModel;
      localStorage.setItem(MODEL_KEY, JSON.stringify(nextModel));

      const phases = Array.from(new Set(steps.map((x) => x.phase).filter(Boolean)));
      const formulaDataFinal = buildFormulaData(fSeed, phases, currentModel.policy);
      const formulaLatex = formulaDataFinal.latex;
      const omega = formulaDataFinal.params.find((p) => p.key === "Ω")?.value;
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
        omega: omega ? String(omega) : undefined,
        features16: fv16,
        feedback: 0,
      };
      const nextHistory = [record, ...historyRef.current].slice(0, 60);
      setHistoryPersist(nextHistory);
      lastHistoryIdRef.current = id;
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
  };

  const setHistoryFeedback = (id: string, feedback: HistoryFeedback) => {
    const next = historyRef.current.map((item) => (item.id === id ? { ...item, feedback } : item));
    setHistoryPersist(next);
  };

  const deleteHistoryItem = (id: string) => {
    const next = historyRef.current.filter((item) => item.id !== id);
    setHistoryPersist(next);
    if (lastHistoryIdRef.current === id) lastHistoryIdRef.current = null;
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
    setModel(nextModel);
    modelRef.current = nextModel;
    localStorage.setItem(MODEL_KEY, JSON.stringify(nextModel));
    const lastId = lastHistoryIdRef.current;
    if (lastId) setHistoryFeedback(lastId, 1);
    setFeedbackLocked(true);
  };

  const onExportModel = () => {
    const m = modelRef.current;
    if (!m) return;
    downloadJson(`gua-universe-model-${hex8(m.salt)}-${m.runCount}.json`, m);
  };

  const onImportModel = async (file: File) => {
    const text = await file.text();
    const parsed = safeJsonParse<UniverseModelV1>(text);
    if (!parsed || parsed.v !== 1 || !Number.isFinite(parsed.salt) || !Array.isArray(parsed.theta16) || parsed.theta16.length !== 16) {
      setError("模型格式不正确。");
      return;
    }
    const next: UniverseModelV1 = {
      v: 1,
      salt: parsed.salt >>> 0,
      runCount: Math.max(0, Math.trunc(parsed.runCount ?? 0)),
      theta16: parsed.theta16.map((x) => clamp01(Number(x))),
      policy: parsed.policy ?? defaultPolicyFromTheta(parsed.theta16, parsed.runCount ?? 0, 0),
      likes: {
        total: Math.max(0, Math.trunc(parsed.likes?.total ?? 0)),
        liked: Math.max(0, Math.trunc(parsed.likes?.liked ?? 0)),
      },
      updatedAt: Date.now(),
    };
    setModel(next);
    modelRef.current = next;
    localStorage.setItem(MODEL_KEY, JSON.stringify(next));
    setError(null);
  };

  const canStart = question.trim().length > 0;
  const shortcutHint = "Ctrl/⌘ + Enter";
  const dashboard = useMemo(() => computeDashboardMetrics(model, history, enhanced), [model, history, enhanced]);

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
  const phaseLabels = ["输入", "推演", "归一"];
  const phaseIndex = activeTab === "input" ? 0 : activeTab === "computing" ? 1 : 2;
  const progressPct = useMemo(() => {
    if (trace.length <= 0) return isRunning ? 6 : 0;
    const p = Math.round((traceVisible / Math.max(1, trace.length)) * 100);
    return Math.max(0, Math.min(100, p));
  }, [isRunning, traceVisible, trace.length]);

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
              这不是算命，是推演你的宇宙常量：同一输入同一设备同一输出，推演可追踪，归一可复算。
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
                {runPhase === "input" && trace.length === 0 && !result ? "开始推演" : "再推演一次"}
              </Button>
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
            </Group>
          </Group>

          {activeTab === "input" ? (
            <Paper radius="md" p="xl" className="gua-panel">
              <Stack gap="md">
                <Group justify="space-between" align="center">
                  <Text fw={600} className="gua-section-title">
                    推演输入
                  </Text>
                  <Badge variant="light" color="gray" radius="md" className="gua-chip">
                    步骤 1/3
                  </Badge>
                </Group>
                <Text className="gua-section-sub">描述你的目标或问题。系统将结合本地观测与模型进行离线推演。</Text>

                <Textarea
                  label="目标/问题"
                  placeholder="例如：评估本周上线方案的稳定度风险"
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
                    label="参考时间"
                    type="datetime-local"
                    value={datetimeValue}
                    onChange={(e) => setDatetimeValue(e.currentTarget.value)}
                  />
                  <TextInput
                    label="标识（可选）"
                    placeholder="例如：AB-方案-第3轮"
                    value={nickname}
                    onChange={(e) => setNickname(e.currentTarget.value)}
                    maxLength={24}
                  />
                </SimpleGrid>
                <Text fz="xs" c="dimmed">
                  {model ? `本机已推演 ${model.runCount} 次。` : "本机模型载入中。"} 模型/历史/权限在设置里管理。
                </Text>

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
              <Stack gap="md">
                <Paper radius="md" p="md" className="gua-panel">
                  <Group justify="space-between" align="center" wrap="nowrap">
                    <Stack gap={2}>
                      <Text fw={600} fz="sm">
                        推演进行中
                      </Text>
                      <Text fz="xs" c="dimmed">
                        {trace.length > 0 ? `${Math.min(traceVisible, trace.length)}/${trace.length}` : "采样中"} · {progressPct}%
                      </Text>
                    </Stack>
                    <Box style={{ width: 160 }}>
                      <Progress value={progressPct} />
                    </Box>
                  </Group>
                </Paper>
                <StreamingPanels
                  formulaMarkdown={formulaMarkdown}
                  formulaParams={progressiveParams}
                  scienceMarkdown={scienceMarkdown}
                  lunarMarkdown={lunarMarkdown}
                />
              </Stack>
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
              <Stack gap="md">
                <StreamingPanels
                  mode="resultOnly"
                  formulaMarkdown={resultMarkdown}
                  scienceMarkdown=""
                  lunarMarkdown=""
                />
                <Paper radius="md" p="md" className="gua-panel">
                  <Group justify="space-between" align="center" wrap="nowrap">
                    <Stack gap={2}>
                      <Text fw={600} fz="sm">
                        归一常量结果
                      </Text>
                      <Text fz="xs" c="dimmed">
                        Score={result.score}{result.signature ? ` · ${result.signature.slice(0, 8)}` : ""}
                      </Text>
                    </Stack>
                  </Group>
                </Paper>
                <Paper radius="md" p="md" className="gua-panel">
                  <Group justify="space-between" align="center" wrap="nowrap">
                    <Stack gap={2}>
                      <Text fw={600} fz="sm">
                        对于此次宇宙常量的推演，是否满意
                      </Text>
                      <Text fz="xs" c="dimmed">
                        满意会加速本机模型收敛；不满意只记录为负反馈，降低后续参考权重。
                      </Text>
                    </Stack>
                    <Group gap="xs" wrap="nowrap">
                      <Button radius="xl" variant="default" onClick={onDislike} disabled={feedbackLocked}>
                        不满意
                      </Button>
                      <Button radius="xl" onClick={onLike} disabled={feedbackLocked || !model}>
                        满意
                      </Button>
                    </Group>
                  </Group>
                </Paper>
              </Stack>
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
            本项目为个人宇宙常量推演装置，仅供体验与思辨。输出不对应现实世界因果。
          </Text>
        </Stack>
      </Container>

      <Modal opened={aboutOpen} onClose={() => setAboutOpen(false)} size="lg" centered title="算法说明">
        <MarkdownStream
          content={[
            "## 摘要",
            "",
            "本文描述一种面向“个人宇宙常量”的确定性推演流程。系统以问题、时间与本地观测构造种子，生成可解释的符号参数集，并据此合成表达式结构；推演阶段分层揭示参数与结构，归一阶段将其数值化求解，输出标量 $\\Omega$ 及其可复算的代入等式。推演次数越多，本机常量将缓慢收敛，形成专属法则。",
            "",
            "## 1. 输入、观测、模型与随机种子",
            "",
            "- 显式输入：问题文本 $x$、起卦时间 $t$、可选昵称 $n$。",
            "- 本地观测：被动观测 $o$（设备/系统/网络/偏好）与交互扰动 $e$（微熵）。可选增强观测 $o^{+}$（需授权）。",
            "- 本机模型：宇宙常量模型 $M$ 存于本地，用于调制推演与公式生成。",
            "- 构造 32 位种子 $s = \\mathrm{mix}(t, x, n, o, o^{+}, e, M)$，其中 $\\mathrm{mix}$ 为可复算的整数散列混合。",
            "- 种子驱动伪随机数发生器 $r(s)$，保证同条件可复现，并对微扰保持敏感。",
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

      <Modal opened={settingsOpen} onClose={() => setSettingsOpen(false)} size="lg" centered title="设置">
        <Stack gap="md">
          <Paper radius="md" p="md" className="gua-panel">
            <Group justify="space-between" align="center" wrap="nowrap">
              <Text fw={600} className="gua-section-title">
                个人宇宙常量 · 现状
              </Text>
              <Badge variant="light" color="gray" radius="md" className="gua-chip">
                {dashboard.runCount}
              </Badge>
            </Group>
            <Stack gap="xs" mt="sm">
              <Group justify="space-between" wrap="nowrap">
                <Text fz="xs" c="dimmed">
                  演化进度
                </Text>
                <Text fz="xs" c="dimmed">
                  {Math.round(dashboard.progress01 * 100)}%
                </Text>
              </Group>
              <Progress value={dashboard.progress01 * 100} />
              <Group justify="space-between" wrap="nowrap">
                <Text fz="xs" c="dimmed">
                  满意比例
                </Text>
                <Text fz="xs" c="dimmed">
                  {Math.round(dashboard.likesRatio01 * 100)}%
                </Text>
              </Group>
              <Text fz="xs" c="dimmed">
                签名：{dashboard.recentSignature ? String(dashboard.recentSignature).slice(0, 8) : "—"}
              </Text>
            </Stack>
          </Paper>

          <Paper radius="md" p="md" className="gua-panel">
            <Group justify="space-between" align="center" wrap="nowrap">
              <Text fw={600} className="gua-section-title">
                多维度评分
              </Text>
              <Badge variant="light" color="gray" radius="md" className="gua-chip">
                N={Math.min(20, history.length)}
              </Badge>
            </Group>
            <Stack gap="xs" mt="sm">
              <Text fz="sm">
                Score：均值 {dashboard.scoreMean.toFixed(1)} · 波动 {dashboard.scoreStd.toFixed(1)}
              </Text>
              <Group justify="space-between" wrap="nowrap">
                <Text fz="xs" c="dimmed">
                  Ω 有限率
                </Text>
                <Text fz="xs" c="dimmed">
                  {Math.round(dashboard.omegaFiniteRatio01 * 100)}%
                </Text>
              </Group>
              <Progress value={dashboard.omegaFiniteRatio01 * 100} />
              <Text fz="xs" c="dimmed">
                反馈倾向：{dashboard.feedbackBias.toFixed(2)} · 满意 {dashboard.feedbackCounts.liked} · 不满意 {dashboard.feedbackCounts.disliked}
              </Text>
              <Text fz="xs" c="dimmed">
                观测：{dashboard.enhancedStatus.enabled ? "增强开启" : "增强关闭"} · 地理 {dashboard.enhancedStatus.geo} · 方向 {dashboard.enhancedStatus.motion}
              </Text>
            </Stack>
          </Paper>

          <Paper radius="md" p="md" className="gua-panel">
            <Group justify="space-between" align="center" wrap="nowrap">
              <Text fw={600} className="gua-section-title">
                模型维度（θ16）
              </Text>
              <Badge variant="light" color="gray" radius="md" className="gua-chip">
                稳定度 {Math.round(dashboard.thetaStability01 * 100)}%
              </Badge>
            </Group>
            <SimpleGrid cols={{ base: 8, sm: 16 }} spacing={6} mt="sm">
              {dashboard.theta16.map((v, i) => (
                <Box key={`theta-${i}`} style={{ height: 44, borderRadius: 10, background: "rgba(15,23,42,0.06)", display: "flex", alignItems: "flex-end", padding: 4 }}>
                  <Box style={{ width: "100%", height: `${Math.max(2, Math.round(clamp01(v) * 100))}%`, borderRadius: 8, background: "rgba(15,23,42,0.75)" }} />
                </Box>
              ))}
            </SimpleGrid>
          </Paper>

          <Paper radius="md" p="md" className="gua-panel">
            <Group justify="space-between" align="center" wrap="nowrap">
              <Text fw={600} className="gua-section-title">
                历史记录
              </Text>
              <Badge variant="light" color="gray" radius="md" className="gua-chip">
                {history.length}
              </Badge>
            </Group>
            <Box mt="sm" style={{ maxHeight: 360, overflow: "auto", paddingRight: 6 }}>
              {history.length === 0 ? (
                <Text fz="sm" c="dimmed">
                  暂无历史记录。
                </Text>
              ) : (
                <Stack gap="xs">
                  {history.map((item) => (
                    <Paper key={item.id} radius="md" p="sm" className="gua-panel gua-panel-muted">
                      <Group justify="space-between" align="flex-start" wrap="nowrap">
                        <Stack gap={2} style={{ minWidth: 0 }}>
                          <Text fz="xs" c="dimmed">
                            {new Date(item.datetimeISO || item.createdAt).toLocaleString()} {item.root ? `· ${String(item.root).slice(0, 8)}` : ""}
                          </Text>
                          <Text fw={600} fz="sm">
                            {item.question || "（无输入）"}
                          </Text>
                          <Text fz="sm" c="dimmed" lineClamp={2}>
                            {item.omega ? `Ω=${item.omega} · ` : ""}Score={item.score}{item.signature ? ` · ${item.signature.slice(0, 8)}` : ""}
                          </Text>
                        </Stack>
                        <Group gap="xs" wrap="nowrap">
                          <Button
                            size="xs"
                            radius="xl"
                            variant={item.feedback === 1 ? "filled" : "default"}
                            onClick={() => setHistoryFeedback(item.id, 1)}
                          >
                            满意
                          </Button>
                          <Button
                            size="xs"
                            radius="xl"
                            variant={item.feedback === -1 ? "filled" : "default"}
                            onClick={() => setHistoryFeedback(item.id, -1)}
                          >
                            不满意
                          </Button>
                          <Button size="xs" radius="xl" variant="default" onClick={() => deleteHistoryItem(item.id)}>
                            删除
                          </Button>
                        </Group>
                      </Group>
                    </Paper>
                  ))}
                </Stack>
              )}
            </Box>
          </Paper>

          <Paper radius="md" p="md" className="gua-panel">
            <Group justify="space-between" align="center" wrap="nowrap">
              <Text fw={600} className="gua-section-title">
                宇宙常量模型
              </Text>
              <Badge variant="light" color="gray" radius="md" className="gua-chip">
                {model ? `已推演 ${model.runCount} 次` : "载入中"}
              </Badge>
            </Group>
            <Group mt="sm" justify="flex-end">
              <Button radius="xl" variant="default" onClick={onExportModel} disabled={!model}>
                导出
              </Button>
              <Button radius="xl" variant="default" onClick={() => importRef.current?.click()}>
                导入
              </Button>
              <input
                ref={importRef}
                type="file"
                accept="application/json"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.currentTarget.files?.[0];
                  e.currentTarget.value = "";
                  if (f) void onImportModel(f);
                }}
              />
            </Group>
          </Paper>

          <Paper radius="md" p="md" className="gua-panel">
            <Group justify="space-between" align="center" wrap="nowrap">
              <Text fw={600} className="gua-section-title">
                增强观测
              </Text>
              <Switch checked={enhanced.enabled} onChange={(e) => requestEnhanced(e.currentTarget.checked)} />
            </Group>
            <Text mt="xs" fz="xs" c="dimmed">
              地理：{enhanced.geo} · 方向：{enhanced.motion}
            </Text>
            <Text fz="xs" c="dimmed">
              授权仅用于本地观测，不会上传。历史反馈会影响后续推演的参考权重。
            </Text>
          </Paper>
        </Stack>
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
