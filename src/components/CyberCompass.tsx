"use client";

import { useEffect, useRef } from "react";

type CyberCompassProps = {
  className?: string;
  intensity?: number;
};

export function CyberCompass({ className, intensity = 1 }: CyberCompassProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let raf = 0;
    let running = true;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const start = performance.now();

    const draw = (t: number) => {
      if (!running) return;
      raf = requestAnimationFrame(draw);

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const cx = w / 2;
      const cy = h / 2;
      const r = Math.min(w, h) * 0.42;
      const dt = (t - start) / 1000;

      ctx.clearRect(0, 0, w, h);

      const pulse = 0.6 + 0.4 * Math.sin(dt * 2.2);
      const rot = dt * (0.9 + intensity * 0.35);

      ctx.save();
      ctx.translate(cx, cy);

      const g = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r * 1.1);
      g.addColorStop(0, `rgba(27, 31, 36, ${0.12 * pulse})`);
      g.addColorStop(0.6, `rgba(27, 31, 36, ${0.04 * pulse})`);
      g.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.05, 0, Math.PI * 2);
      ctx.fill();

      ctx.rotate(rot);

      ctx.lineWidth = 1.2;
      ctx.strokeStyle = `rgba(27, 31, 36, ${0.55 * pulse})`;
      ctx.shadowBlur = 14;
      ctx.shadowColor = "rgba(27, 31, 36, 0.18)";

      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.lineWidth = 0.9;
      ctx.shadowBlur = 8;
      for (let i = 0; i < 360; i += 15) {
        const a = (i * Math.PI) / 180;
        const inner = r * 0.88;
        const outer = r * 0.98;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
        ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
        ctx.stroke();
      }

      ctx.shadowBlur = 0;
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(27, 31, 36, ${0.28 + 0.18 * pulse})`;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
      ctx.stroke();

      ctx.rotate(-rot * 1.85);
      drawBagua(ctx, r * 0.6, pulse);

      ctx.rotate(rot * 2.7);
      drawCodeRing(ctx, r * 0.82, pulse);

      ctx.restore();
    };

    raf = requestAnimationFrame(draw);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [intensity]);

  return <canvas ref={canvasRef} className={className} />;
}

function drawBagua(ctx: CanvasRenderingContext2D, radius: number, pulse: number) {
  const names = ["乾", "兑", "离", "震", "巽", "坎", "艮", "坤"];
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = `rgba(27, 31, 36, ${0.55 * pulse})`;
  ctx.font = `${Math.max(14, Math.floor(radius * 0.18))}px ui-serif, STKaiti, KaiTi, Songti SC, serif`;
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * radius;
    const y = Math.sin(a) * radius;
    ctx.fillText(names[i] ?? "", x, y);
  }

  ctx.strokeStyle = `rgba(27, 31, 36, ${0.18 + 0.16 * pulse})`;
  ctx.lineWidth = 1.1;
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * (radius * 0.42), Math.sin(a) * (radius * 0.42));
    ctx.lineTo(Math.cos(a) * (radius * 0.92), Math.sin(a) * (radius * 0.92));
    ctx.stroke();
  }
  ctx.restore();
}

function drawCodeRing(ctx: CanvasRenderingContext2D, radius: number, pulse: number) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = `rgba(27, 31, 36, ${0.22 + 0.08 * pulse})`;
  ctx.font = `${Math.max(10, Math.floor(radius * 0.09))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
  const glyphs = "0101 0011 1100 0110 1010 0100";
  const count = 18;
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2;
    const x = Math.cos(a) * radius;
    const y = Math.sin(a) * radius;
    ctx.fillText(glyphs, x, y);
  }
  ctx.restore();
}
