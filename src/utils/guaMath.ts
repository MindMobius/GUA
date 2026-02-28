"use client";

export function mix32(seed: number, n: number) {
  let x = (seed ^ n) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x >>> 0;
}

export function clamp01(n: number) {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function clamp11(n: number) {
  if (n < -1) return -1;
  if (n > 1) return 1;
  return n;
}

export function meanStd(values: number[]) {
  if (values.length <= 0) return { mean: 0, std: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const std = Math.sqrt(values.reduce((acc, x) => acc + (x - mean) * (x - mean), 0) / values.length);
  return { mean, std };
}

export function hex8(n: number) {
  return (n >>> 0).toString(16).padStart(8, "0");
}

export function randU32() {
  try {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] >>> 0;
  } catch {
    return (mix32(0x12345678, Date.now() >>> 0) ^ mix32(0x9e3779b9, performance.now() >>> 0)) >>> 0;
  }
}

export function hashStr32(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h = mix32(h, s.charCodeAt(i));
  }
  return h >>> 0;
}

