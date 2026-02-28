"use client";

import type { UniverseModelV1 } from "@/types/universeModel";
import type { FormulaPolicy } from "@/utils/formulaEngine";
import { clamp01, hashStr32, hex8, mix32, randU32 } from "@/utils/guaMath";

export type EnhancedStateV1 = {
  v: 1;
  enabled: boolean;
  geo: "unknown" | "granted" | "denied" | "error";
  motion: "unknown" | "granted" | "denied" | "error";
  lastGeo?: { lat: number; lon: number; acc: number };
  lastMotion?: { a: number; b: number; g: number };
};

export type HistoryFeedback = -1 | 0 | 1;

export type HistoryItemV1 = {
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

export function computeHistoryPrior16(history: HistoryItemV1[]) {
  const acc = Array.from({ length: 16 }, () => 0);
  let sumW = 0;
  for (const item of history) {
    const score01 = clamp01(Number(item.score ?? 0) / 100);
    const omegaFinite =
      typeof item.omega === "string" && item.omega.length > 0 && !item.omega.includes("\\infty") && !item.omega.includes("∞");
    const quality01 = clamp01(0.15 + score01 * 0.65 + (omegaFinite ? 0.2 : 0));
    let w = 0.08 + quality01 * 0.92;
    if (item.feedback === 1) w *= 1.25;
    if (item.feedback === -1) w *= 0.55;
    w = Math.max(0.02, Math.min(1.5, w));
    if (!item.features16 || item.features16.length !== 16) continue;
    sumW += w;
    for (let i = 0; i < 16; i += 1) acc[i] = (acc[i] ?? 0) + clamp01(Number(item.features16[i])) * w;
  }
  if (sumW <= 0) return null;
  return acc.map((x) => clamp01(x / sumW));
}

export function computeDashboardMetrics(model: UniverseModelV1 | null, history: HistoryItemV1[], enhanced: EnhancedStateV1) {
  const recent = history.slice(0, 20);
  const scores = recent.map((x) => (Number.isFinite(x.score) ? x.score : 0));
  const scoreMean = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const scoreStd = scores.length ? Math.sqrt(scores.reduce((acc, s) => acc + (s - scoreMean) * (s - scoreMean), 0) / scores.length) : 0;

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

  const recentSignature = (typeof history[0]?.signature === "string" && history[0].signature) || (typeof model?.salt === "number" ? hex8(model.salt) : null);

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

export function defaultPolicyFromTheta(theta16: number[], runCount: number, likedRatio: number): FormulaPolicy {
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

export function initModel() {
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
  } satisfies UniverseModelV1;
}

export function deriveFormulaSeed(entropy: number, model: UniverseModelV1, obsHash: number) {
  const settle = clamp01(model.runCount / 96);
  const bucket = Math.max(1, Math.floor(1 + settle * 9));
  const drift = mix32(model.salt, Math.floor(model.runCount / bucket));
  const thetaHash = model.theta16.reduce((acc, v, i) => mix32(acc, (Math.round(clamp01(v) * 1e6) ^ (i * 131)) >>> 0), 0x9e3779b9);
  const h = mix32(mix32(entropy, obsHash), mix32(drift, thetaHash));
  return h >>> 0;
}

export function collectPassiveObservables() {
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

