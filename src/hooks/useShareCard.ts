"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import QRCode from "qrcode";
import html2canvas from "html2canvas";
import type { UniverseModelV1 } from "@/types/universeModel";
import { copyPngToClipboard, downloadBlob, type ShareCardTemplate } from "@/utils/shareCard";

type DecodeMode = "result_current" | "model_current" | "result_history" | "llm_direct";

type DirectSource = "current" | "last" | "history";

function previewFromMarkdown(markdown: string) {
  const raw = unwrapOuterMarkdownFence(markdown || "");
  const lines = raw.split("\n").map((x) => x.trim());
  const line = lines.find((x) => x && !x.startsWith("#") && !x.startsWith(">")) ?? "";
  if (!line) return "";
  return line.length > 120 ? `${line.slice(0, 120)}…` : line;
}

function unwrapOuterMarkdownFence(markdown: string) {
  const raw = String(markdown || "");
  const lines = raw.split("\n");
  if (lines.length < 3) return raw;
  const head = lines[0]?.trim() ?? "";
  const tail = lines[lines.length - 1]?.trim() ?? "";
  if (!head.startsWith("```") || !tail.startsWith("```")) return raw;
  return lines.slice(1, -1).join("\n");
}

function extractSectionConclusionFromMarkdown(markdown: string, sectionTitle: string) {
  const raw = unwrapOuterMarkdownFence(markdown || "");
  const lines = raw.split("\n");
  const start = lines.findIndex((l) => l.trim() === `## ${sectionTitle}`);
  if (start < 0) return previewFromMarkdown(raw);
  const end = lines.findIndex((l, i) => i > start && l.trim().startsWith("## "));
  const slice = lines.slice(start, end > start ? end : undefined);
  const idx = slice.findIndex((l) => l.trim().startsWith("### 结论"));
  if (idx < 0) return previewFromMarkdown(slice.join("\n"));
  for (let i = idx + 1; i < Math.min(slice.length, idx + 12); i += 1) {
    const t = slice[i]?.trim() ?? "";
    if (!t) continue;
    if (t.startsWith("#") || t.startsWith(">")) continue;
    return t.length > 220 ? `${t.slice(0, 220)}…` : t;
  }
  return previewFromMarkdown(slice.join("\n"));
}

export type SharePosterPropsV1 = {
  template: ShareCardTemplate;
  modeLabel: string;
  localTimeText: string;
  utcTimeText: string;
  qrUrlText: string;
  headline: string;
  question?: string;
  conclusionQa?: string;
  conclusionInsight?: string;
  score?: number;
  omega?: string;
  signature?: string;
  rootDigest?: string;
  formulaLatex?: string;
  runCount?: number;
  likedRatio?: number;
  recent?: Array<{ question: string; score: number; omega?: string; signature?: string }>;
  model?: UniverseModelV1 | null;
  theta16?: number[];
};

export function useShareCard(args: {
  decodeMode: DecodeMode;
  decodePacket: unknown | null;
  directSource: DirectSource;
  question: string;
  history: Array<{ id: string; question: string; score: number; omega?: string; signature?: string; root?: string }>;
  modelRef: MutableRefObject<UniverseModelV1 | null>;
  decodeAnswerMarkdown: string;
  decodeSummary: { score: number; sig: string; omega: string; questionText: string; runCount: number | null } | null;
}) {
  const [shareCardBusy, setShareCardBusy] = useState(false);
  const [shareCardError, setShareCardError] = useState<string | null>(null);
  const [shareCardOpen, setShareCardOpen] = useState(false);
  const [shareCardTemplate, setShareCardTemplate] = useState<ShareCardTemplate>("divination_decode");
  const [shareCardPreviewUrl, setShareCardPreviewUrl] = useState<string | null>(null);
  const [shareCardBlob, setShareCardBlob] = useState<Blob | null>(null);
  const [sharePosterQrDataUrl, setSharePosterQrDataUrl] = useState<string>("");
  const [shareCardBusyText, setShareCardBusyText] = useState<string>("");
  const [shareCardBusyPct, setShareCardBusyPct] = useState<number>(0);

  const shareCardCacheRef = useRef(new Map<ShareCardTemplate, { key: string; blob: Blob; url: string }>());
  const sharePosterRef = useRef<HTMLDivElement | null>(null);
  const shareCardOpenedAtRef = useRef<string>(new Date().toISOString());

  const shareCardQrUrl = useMemo(() => {
    const envUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
    if (envUrl) return envUrl;
    if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
    return "http://localhost:3000";
  }, []);

  useEffect(() => {
    if (!shareCardOpen) return;
    void (async () => {
      try {
        const url = await QRCode.toDataURL(shareCardQrUrl, {
          width: 256,
          margin: 0,
          errorCorrectionLevel: "M",
          color: { dark: "#0b0f17", light: "#ffffff" },
        });
        setSharePosterQrDataUrl(url);
      } catch {
        setSharePosterQrDataUrl("");
      }
    })();
  }, [shareCardOpen, shareCardQrUrl]);

  useEffect(() => {
    if (!shareCardBusy) {
      setShareCardBusyText("");
      setShareCardBusyPct(0);
      return;
    }
    const steps = ["排版中…", "渲染中…", "合成 PNG…", "写入预览…"];
    let i = 0;
    setShareCardBusyText(steps[0] ?? "生成中…");
    setShareCardBusyPct(12);
    const id = window.setInterval(() => {
      i += 1;
      setShareCardBusyText(steps[i % steps.length] ?? "生成中…");
      setShareCardBusyPct((v) => {
        const next = v + 9 + Math.round(Math.random() * 10);
        return Math.min(95, Math.max(v, next));
      });
    }, 650);
    return () => window.clearInterval(id);
  }, [shareCardBusy]);

  const shareCardCopySupported =
    typeof window !== "undefined" && typeof navigator?.clipboard?.write === "function" && typeof ClipboardItem !== "undefined";

  const shareCardDefaultTemplate = useMemo<ShareCardTemplate>(() => {
    if (args.decodeMode === "llm_direct") return "ai_direct";
    if (args.decodeMode === "model_current") return "model_snapshot";
    if (!args.decodePacket) return "model_snapshot";
    return "divination_decode";
  }, [args.decodeMode, args.decodePacket]);

  useEffect(() => {
    if (!shareCardOpen) return;
    setShareCardTemplate(shareCardDefaultTemplate);
  }, [shareCardDefaultTemplate, shareCardOpen]);

  const sharePosterProps = useMemo<SharePosterPropsV1>(() => {
    const pkt = args.decodePacket as
      | {
          hid?: unknown;
          input?: { question?: unknown; datetimeISO?: unknown };
          payload?: { input?: { question?: unknown; datetimeISO?: unknown } };
          result?: { signature?: unknown; omega?: unknown; formulaLatex?: unknown };
          recent?: Array<{ question?: unknown; score?: unknown; omega?: unknown; signature?: unknown }>;
          model?: UniverseModelV1 | { runCount?: unknown; likes?: { total?: unknown; liked?: unknown } } | null;
        }
      | null;
    const input = pkt?.input ?? pkt?.payload?.input ?? null;
    const createdAtISO = typeof input?.datetimeISO === "string" ? input.datetimeISO : shareCardOpenedAtRef.current;
    const createdAt = new Date(createdAtISO);
    const safeDate = Number.isFinite(createdAt.getTime()) ? createdAt : new Date();
    const localTimeText = (() => {
      try {
        const s = new Intl.DateTimeFormat("zh-CN", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
          timeZoneName: "short",
        }).format(safeDate);
        return `Local ${s}`;
      } catch {
        return `Local ${safeDate.toLocaleString()}`;
      }
    })();
    const utcISO = safeDate.toISOString().replace(".000Z", "Z");
    const utcTimeText = `UTC ${utcISO.replace("T", " ")}`;
    const baseQuestion =
      args.question.trim() ||
      args.decodeSummary?.questionText ||
      (typeof input?.question === "string" ? input.question : "") ||
      (args.decodeMode === "llm_direct" && args.directSource === "current" ? args.question.trim() : "");

    const sigFromPacket = typeof pkt?.result?.signature === "string" ? pkt.result.signature : "";
    const omegaFromPacket = typeof pkt?.result?.omega === "string" ? pkt.result.omega : "";
    const formulaFromPacket = typeof pkt?.result?.formulaLatex === "string" ? pkt.result.formulaLatex : "";
    const signature = args.decodeSummary?.sig || sigFromPacket || "—";
    const omegaRaw = args.decodeSummary?.omega || omegaFromPacket || "";
    const omega = omegaRaw && omegaRaw !== "—" ? omegaRaw : "\\square";
    const score = args.decodeSummary?.score ?? 0;

    const rootDigest = typeof pkt?.hid === "string" ? (args.history.find((x) => x.id === pkt.hid)?.root ?? "") : "";

    const qrUrlText = shareCardQrUrl.replace(/^https?:\/\//, "");
    const modeLabel = shareCardTemplate === "ai_direct" ? "AI 直推" : shareCardTemplate === "model_snapshot" ? "模型快照" : "推演解码";

    if (shareCardTemplate === "ai_direct") {
      const conclusionQa = extractSectionConclusionFromMarkdown(args.decodeAnswerMarkdown, "问题解答");
      const conclusionInsight = extractSectionConclusionFromMarkdown(args.decodeAnswerMarkdown, "模型启示");
      return {
        template: "ai_direct" as const,
        modeLabel,
        localTimeText,
        utcTimeText,
        qrUrlText,
        headline: "一句问题，得到可晒的模型解码。",
        question: baseQuestion,
        conclusionQa,
        conclusionInsight,
        score,
        omega,
        signature,
        formulaLatex: formulaFromPacket || undefined,
      };
    }

    if (shareCardTemplate === "model_snapshot") {
      const m =
        (pkt?.model && typeof (pkt.model as { runCount?: unknown }).runCount !== "undefined" ? (pkt.model as UniverseModelV1) : null) ??
        args.modelRef.current;
      const runCount = Math.max(0, Math.trunc(Number(m?.runCount ?? args.decodeSummary?.runCount ?? 0)));
      const total = Number(m?.likes?.total ?? NaN);
      const liked = Number(m?.likes?.liked ?? NaN);
      const likedRatio = total > 0 && Number.isFinite(liked) ? liked / total : undefined;
      const sourceRecent = Array.isArray(pkt?.recent) ? pkt.recent : args.history.slice(0, 3);
      const recent = sourceRecent.slice(0, 3).map((x) => ({
        question: typeof (x as { question?: unknown }).question === "string" ? (x as { question: string }).question : "",
        score: Number.isFinite(Number((x as { score?: unknown }).score)) ? Number((x as { score?: unknown }).score) : 0,
        omega: typeof (x as { omega?: unknown }).omega === "string" ? ((x as { omega?: string }).omega as string) : undefined,
        signature: typeof (x as { signature?: unknown }).signature === "string" ? ((x as { signature?: string }).signature as string) : undefined,
      }));
      return {
        template: "model_snapshot" as const,
        modeLabel,
        localTimeText,
        utcTimeText,
        qrUrlText,
        headline: "该视觉由本机模型参数确定性生成：导入同一模型到其他设备会呈现一致形态。",
        runCount,
        likedRatio,
        recent,
        model: m ?? null,
        theta16: Array.isArray(m?.theta16) ? m!.theta16 : [],
      };
    }

    return {
      template: "divination_decode" as const,
      modeLabel,
      localTimeText,
      utcTimeText,
      qrUrlText,
      headline: "可复算 · 可追溯 · 本机宇宙常量",
      question: baseQuestion,
      conclusionQa: extractSectionConclusionFromMarkdown(args.decodeAnswerMarkdown, "问题解答"),
      conclusionInsight: extractSectionConclusionFromMarkdown(args.decodeAnswerMarkdown, "模型启示"),
      score,
      omega,
      signature,
      formulaLatex: formulaFromPacket || undefined,
      rootDigest: rootDigest || undefined,
    };
  }, [
    args.decodeAnswerMarkdown,
    args.decodeMode,
    args.decodePacket,
    args.decodeSummary,
    args.directSource,
    args.history,
    args.modelRef,
    args.question,
    shareCardQrUrl,
    shareCardTemplate,
  ]);

  const shareCardPayload = useMemo(() => {
    return { ...sharePosterProps, qrUrl: shareCardQrUrl };
  }, [sharePosterProps, shareCardQrUrl]);

  const shareCardPayloadKey = useMemo(() => {
    try {
      return JSON.stringify(shareCardPayload);
    } catch {
      return `${shareCardPayload.template}:${Date.now()}`;
    }
  }, [shareCardPayload]);

  const generate = useCallback(async () => {
    if (shareCardBusy) return;
    setShareCardError(null);
    setShareCardBusy(true);
    try {
      if (!sharePosterQrDataUrl) throw new Error("二维码未就绪：请稍后重试。");
      const node = sharePosterRef.current;
      if (!node) throw new Error("海报节点未就绪：请稍后重试。");
      const fonts = (document as unknown as { fonts?: { ready?: Promise<void> } }).fonts;
      if (fonts?.ready) await fonts.ready;
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      const canvas = await html2canvas(node, { backgroundColor: null, scale: 2, useCORS: true, logging: false, removeContainer: true });
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("生成失败：请重试。"))), "image/png");
      });
      const nextUrl = URL.createObjectURL(blob);
      const prevCached = shareCardCacheRef.current.get(shareCardTemplate);
      if (prevCached?.url) URL.revokeObjectURL(prevCached.url);
      setShareCardBlob(blob);
      setShareCardPreviewUrl(nextUrl);
      shareCardCacheRef.current.set(shareCardTemplate, { key: shareCardPayloadKey, blob, url: nextUrl });
    } catch (e) {
      setShareCardBlob(null);
      setShareCardPreviewUrl(null);
      setShareCardError(e instanceof Error ? e.message : "生成分享海报失败。");
    } finally {
      setShareCardBusy(false);
    }
  }, [shareCardBusy, shareCardPayloadKey, shareCardTemplate, sharePosterQrDataUrl]);

  useEffect(() => {
    if (!shareCardOpen) return;
    setShareCardError(null);
    const cached = shareCardCacheRef.current.get(shareCardTemplate);
    if (cached) {
      setShareCardBlob(cached.blob);
      setShareCardPreviewUrl(cached.url);
      return;
    }
    setShareCardBlob(null);
    setShareCardPreviewUrl(null);
  }, [shareCardOpen, shareCardTemplate]);

  const open = useCallback(() => {
    shareCardOpenedAtRef.current = new Date().toISOString();
    setShareCardError(null);
    setShareCardOpen(true);
  }, []);

  const close = useCallback(() => {
    shareCardCacheRef.current.forEach((v) => {
      if (v.url) URL.revokeObjectURL(v.url);
    });
    shareCardCacheRef.current.clear();
    setShareCardOpen(false);
    setShareCardError(null);
    setShareCardBlob(null);
    setShareCardPreviewUrl(null);
    setShareCardBusy(false);
    setShareCardBusyText("");
    setShareCardBusyPct(0);
  }, []);

  const download = useCallback(() => {
    if (!shareCardBlob) return;
    const sig = (sharePosterProps.signature || "gua").replace(/[^\w-]+/g, "").slice(0, 12) || "gua";
    downloadBlob(`gua-share-card-${sharePosterProps.template}-${sig}-${Date.now()}.png`, shareCardBlob);
  }, [shareCardBlob, sharePosterProps.signature, sharePosterProps.template]);

  const copy = useCallback(async () => {
    if (!shareCardCopySupported) return;
    if (!shareCardBlob) return;
    const ok = await copyPngToClipboard(shareCardBlob);
    if (!ok) setShareCardError("当前浏览器不支持复制图片到剪贴板。");
  }, [shareCardBlob, shareCardCopySupported]);

  return {
    open,
    close,
    opened: shareCardOpen,
    template: shareCardTemplate,
    setTemplate: setShareCardTemplate,
    busy: shareCardBusy,
    error: shareCardError,
    busyText: shareCardBusyText,
    busyPct: shareCardBusyPct,
    previewUrl: shareCardPreviewUrl,
    blob: shareCardBlob,
    qrDataUrl: sharePosterQrDataUrl,
    qrUrl: shareCardQrUrl,
    copySupported: shareCardCopySupported,
    generate,
    download,
    copy,
    sharePosterRef,
    sharePosterProps,
  };
}

