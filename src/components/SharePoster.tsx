"use client";

import { forwardRef, useEffect, useRef } from "react";
import Image from "next/image";
import { InlineMath, BlockMath } from "react-katex";
import type { UniverseModelV1 } from "@/types/universeModel";
import { UniverseModelBoard } from "@/components/UniverseModelBoard";
import styles from "./SharePoster.module.css";

export type SharePosterTemplate = "ai_direct" | "divination_decode" | "model_snapshot";

export type SharePosterProps = {
  template: SharePosterTemplate;
  modeLabel: string;
  localTimeText: string;
  utcTimeText: string;
  qrDataUrl: string;
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

export const SharePoster = forwardRef<HTMLDivElement, SharePosterProps>(function SharePoster(props, ref) {
  const omega = (props.omega || "").trim() || "\\square";
  const score = Math.round(Number.isFinite(Number(props.score)) ? Number(props.score) : 0);
  const recent = Array.isArray(props.recent) ? props.recent.slice(0, 3) : [];
  const likeText =
    typeof props.likedRatio === "number" && Number.isFinite(props.likedRatio) ? `${Math.round(props.likedRatio * 100)}%` : "—";
  const formulaRef = useRef<HTMLDivElement | null>(null);
  const questionRef = useRef<HTMLDivElement | null>(null);
  const conclusionQaRef = useRef<HTMLDivElement | null>(null);
  const conclusionInsightRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = formulaRef.current;
    if (!node) return;
    const ro = new ResizeObserver(() => scaleFormula(node));
    ro.observe(node);
    let raf = 0;
    raf = requestAnimationFrame(() => scaleFormula(node));
    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [props.formulaLatex]);

  useEffect(() => {
    const nodes = [questionRef.current, conclusionQaRef.current, conclusionInsightRef.current].filter(Boolean) as HTMLDivElement[];
    if (nodes.length === 0) return;
    const ros = nodes.map((n) => {
      const ro = new ResizeObserver(() => applyAutoClamp(n));
      ro.observe(n);
      return ro;
    });
    let raf = 0;
    raf = requestAnimationFrame(() => nodes.forEach((n) => applyAutoClamp(n)));
    return () => {
      if (raf) cancelAnimationFrame(raf);
      ros.forEach((r) => r.disconnect());
    };
  }, [props.question, props.conclusionQa, props.conclusionInsight, props.template]);

  return (
    <div className={styles.root} data-template={props.template} ref={ref}>
      <div className={styles.grain} />
      <div className={styles.topBand} />

      <div className={styles.qrWrap}>
        <Image className={styles.qrImg} src={props.qrDataUrl} alt="" width={182} height={182} unoptimized />
      </div>
      <div className={`${styles.mono} ${styles.qrUrlTop}`}>{props.qrUrlText}</div>
      <div className={styles.qrBar} />

      <div className={`${styles.header} ${styles.headerRight}`}>
        <div className={styles.headerRow}>
          <div className={`${styles.mono} ${styles.mode}`}>{props.modeLabel}</div>
          <div className={`${styles.mono} ${styles.time}`}>
            <div>{props.localTimeText}</div>
          </div>
        </div>
        <div className={styles.brandRow}>
          <div className={styles.brand}>GUA</div>
          <div className={styles.dot} />
          <div className={styles.tag}>POSTER</div>
        </div>
      </div>

      <div className={styles.panel}>
        {props.template === "divination_decode" ? (
          <>
            <div className={styles.sigRow}>
              <div className={`${styles.mono} ${styles.sigText}`}>
                SIGN {props.signature || ""}
                {props.rootDigest ? ` · ROOT ${props.rootDigest}` : ""}
              </div>
              <div className={styles.statMeta}>可复算 · 可追溯</div>
            </div>

            <div className={styles.statsRow}>
              <div className={styles.statMain}>Score {score}</div>
              <div className={styles.statMeta}>DIVINATION · DECODE</div>
            </div>

            <div className={styles.omegaRow}>
              <div className={styles.omegaSymbol}>Ω</div>
              <div style={{ fontSize: 34, fontWeight: 700, opacity: 0.86 }}>
                <InlineMath math={omega} />
              </div>
            </div>

            {props.formulaLatex ? (
              <div className={styles.formulaBox} ref={formulaRef}>
                <div className="gua-formula-block">
                  <BlockMath math={props.formulaLatex} />
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {props.template === "model_snapshot" ? (
          <>
            <div className={styles.sigRow}>
              <div className={`${styles.mono} ${styles.sigText}`}>RUNCOUNT {Math.max(0, Math.trunc(Number(props.runCount ?? 0)))}</div>
              <div className={`${styles.mono} ${styles.sigText}`} style={{ opacity: 0.66 }}>
                LIKE {likeText}
              </div>
            </div>
            <div className={styles.modelTitle}>本机宇宙常量模型</div>
            <div className={styles.modelGrid}>
              <div className={styles.modelTile}>
                <div className={`${styles.mono} ${styles.modelTileLabel}`}>星图</div>
                <UniverseModelBoard model={props.model ?? null} mode="mesh" background height={330} className={styles.modelCanvas} />
              </div>
              <div className={styles.modelTile}>
                <div className={`${styles.mono} ${styles.modelTileLabel}`}>流场</div>
                <UniverseModelBoard model={props.model ?? null} mode="flow" background height={330} className={styles.modelCanvas} />
              </div>
              <div className={styles.modelTile}>
                <div className={`${styles.mono} ${styles.modelTileLabel}`}>仪表</div>
                <UniverseModelBoard model={props.model ?? null} mode="hud" background height={330} className={styles.modelCanvas} />
              </div>
              <div className={styles.modelTileMeta}>
                <div className={`${styles.mono} ${styles.modelTileLabel}`}>摘要</div>
                <div className={styles.modelMetaBlock}>
                  <div className={styles.modelMetaTop}>
                    <div className={styles.modelMetaBig}>{Math.max(0, Math.trunc(Number(props.runCount ?? 0)))}</div>
                    <div className={styles.modelMetaSub}>
                      <div className={`${styles.mono} ${styles.modelMetaKeyLine}`}>推演次数</div>
                      <div className={`${styles.mono} ${styles.modelMetaKeyLine}`}>满意 {likeText}</div>
                    </div>
                  </div>
                  <div className={styles.modelMiniBars}>
                    {normalizeTheta16(props.theta16).map((v, i) => (
                      <div key={`${i}`} className={styles.modelMiniBar}>
                        <div className={styles.modelMiniFill} style={{ height: `${Math.max(6, Math.round(v * 100))}%` }} />
                      </div>
                    ))}
                  </div>
                  {recent[0]?.question ? (
                    <div className={styles.modelRecentLine}>
                      <span className={styles.modelRecentLabel}>最近</span>
                      <span className={styles.modelRecentText}>{recent[0].question}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </>
        ) : null}

        {props.template !== "model_snapshot" ? (
          <>
            <div className={styles.questionWrap}>
              <div className={styles.sectionLabel}>问题</div>
              <div ref={questionRef} className={`${styles.question} ${styles.textClamp}`}>
                {props.question || ""}
              </div>
            </div>

            <div className={styles.conclusions}>
              <div className={styles.card}>
                <div className={styles.cardTitle}>问题解答 · 结论</div>
                <div className={styles.cardBody}>
                  <div ref={conclusionQaRef} className={styles.cardText}>
                    {props.conclusionQa || "—"}
                  </div>
                </div>
              </div>
              <div className={styles.card}>
                <div className={styles.cardTitle}>模型启示 · 结论</div>
                <div className={styles.cardBody}>
                  <div ref={conclusionInsightRef} className={styles.cardText}>
                    {props.conclusionInsight || "—"}
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : null}

        <div className={styles.footer}>
          <div className={styles.headline}>{props.headline}</div>
        </div>
      </div>

      <div className={styles.bottomBar}>
        <div className={styles.bottomRow}>
          <svg className={styles.githubIcon} viewBox="0 0 16 16" aria-hidden="true">
            <path
              fill="currentColor"
              d="M8 0C3.58 0 0 3.65 0 8.16c0 3.61 2.29 6.67 5.47 7.75.4.08.55-.18.55-.39 0-.19-.01-.82-.01-1.49-2.01.38-2.53-.5-2.69-.96-.09-.23-.48-.96-.82-1.15-.28-.15-.68-.52-.01-.53.63-.01 1.08.6 1.23.85.72 1.24 1.87.89 2.33.68.07-.54.28-.89.51-1.09-1.78-.21-3.64-.92-3.64-4.07 0-.9.31-1.64.82-2.22-.08-.21-.36-1.06.08-2.2 0 0 .67-.22 2.2.85.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.07 2.2-.85 2.2-.85.44 1.14.16 1.99.08 2.2.51.58.82 1.32.82 2.22 0 3.16-1.87 3.86-3.65 4.07.29.26.54.77.54 1.56 0 1.13-.01 2.04-.01 2.32 0 .21.15.47.55.39A8.09 8.09 0 0 0 16 8.16C16 3.65 12.42 0 8 0Z"
            />
          </svg>
          <span className={`${styles.mono} ${styles.githubText}`}>MindMobius/GUA</span>
        </div>
      </div>
    </div>
  );
});

function normalizeTheta16(value: unknown) {
  const arr = Array.isArray(value) ? value : [];
  const out = new Array<number>(16).fill(0);
  for (let i = 0; i < 16; i += 1) {
    const n = typeof arr[i] === "number" ? (arr[i] as number) : Number(arr[i]);
    out[i] = Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
  }
  return out;
}

function applyAutoClamp(node: HTMLDivElement) {
  applyMeasuredEllipsis(node);
}

function applyMeasuredEllipsis(node: HTMLDivElement) {
  const currentText = node.textContent ?? "";
  const prevRendered = node.dataset.rendered ?? "";
  if (currentText && currentText !== prevRendered) node.dataset.fulltext = currentText;
  const fullText = node.dataset.fulltext ?? currentText;
  if (!fullText) return;

  node.textContent = fullText;
  const maxH = node.clientHeight;
  if (maxH <= 0) return;
  if (node.scrollHeight <= maxH + 1) {
    node.dataset.rendered = fullText;
    return;
  }

  const chars = Array.from(fullText);
  const suffix = "…";
  let lo = 0;
  let hi = chars.length;
  let best = 0;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const candidate = `${chars.slice(0, mid).join("").trimEnd()}${suffix}`;
    node.textContent = candidate;
    if (node.scrollHeight <= maxH + 1) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  const finalText = `${chars.slice(0, Math.max(0, best)).join("").trimEnd()}${suffix}`;
  node.textContent = finalText;
  node.dataset.rendered = finalText;
}

function scaleFormula(container: HTMLDivElement | null) {
  if (!container) return;
  const display = container.querySelector(".katex-display") as HTMLElement | null;
  if (!display) return;
  display.style.transform = "";
  display.style.transformOrigin = "left top";
  const st = window.getComputedStyle(container);
  const paddingX = Number.parseFloat(st.paddingLeft || "0") + Number.parseFloat(st.paddingRight || "0");
  const paddingY = Number.parseFloat(st.paddingTop || "0") + Number.parseFloat(st.paddingBottom || "0");
  const availableW = Math.max(0, container.clientWidth - paddingX - 2);
  const availableH = Math.max(0, container.clientHeight - paddingY - 2);
  const width = display.scrollWidth;
  const height = display.scrollHeight;
  if (availableW <= 0 || width <= 0) return;
  const scaleW = availableW / width;
  const scaleH = availableH > 0 && height > 0 ? availableH / height : 1;
  const scale = Math.min(1, scaleW, scaleH) * 0.98;
  display.style.transform = `scale(${scale})`;
  display.style.width = `${width}px`;
}
