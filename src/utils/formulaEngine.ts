"use client";

export type FormulaParam = {
  key: string;
  latex: string;
  value: string;
  desc: string;
};

export type FormulaData = {
  latex: string;
  steps: string[];
  params: FormulaParam[];
};

export type FormulaPolicy = {
  pOp: number;
  pFrac: number;
  pPow: number;
  pFunc: number;
  opsW: number[];
  funcsW: number[];
  constMin: number;
  constMax: number;
  shuffleP: number;
};

type Node =
  | { type: "var"; name: string }
  | { type: "const"; value: string }
  | { type: "op"; op: string; left: Node; right: Node }
  | { type: "frac"; num: Node; den: Node }
  | { type: "pow"; base: Node; exp: Node }
  | { type: "func"; name: string; arg: Node };

const funcs = ["\\log", "\\exp", "\\sin", "\\cos", "\\tanh"];
const ops = ["+", "-", "\\cdot"];

export function buildFormulaData(seed: number, phaseTerms: string[], policy?: Partial<FormulaPolicy>): FormulaData {
  const rng = makeRng(seed ^ 0x9e3779b1);
  const p: FormulaPolicy = {
    pOp: clamp01(policy?.pOp ?? 0.4),
    pFrac: clamp01(policy?.pFrac ?? 0.2),
    pPow: clamp01(policy?.pPow ?? 0.2),
    pFunc: clamp01(policy?.pFunc ?? 0.2),
    opsW: normalizeWeights(policy?.opsW, ops.length) ?? [1, 1, 1],
    funcsW: normalizeWeights(policy?.funcsW, funcs.length) ?? [1, 1, 1, 1, 1],
    constMin: clampInt(policy?.constMin ?? 2, 0, 12),
    constMax: clampInt(policy?.constMax ?? 5, 0, 16),
    shuffleP: clamp01(policy?.shuffleP ?? 0.35),
  };
  const pSum = p.pOp + p.pFrac + p.pPow + p.pFunc || 1;
  const pOp = p.pOp / pSum;
  const pFrac = p.pFrac / pSum;
  const pPow = p.pPow / pSum;
  const pFunc = p.pFunc / pSum;
  void pFunc;

  const phases = phaseTerms.length > 0 ? phaseTerms : ["归一"];
  const phaseVars = phases.map((_, idx) => ({
    key: `Φ${idx + 1}`,
    latex: `\\Phi_{${idx + 1}}`,
    desc: `阶段因子 · ${phases[idx] ?? ""}`,
  }));

  const baseVars: FormulaParam[] = [
    { key: "Ω", latex: "\\Omega", value: "", desc: "归一输出" },
    { key: "σ", latex: "\\sigma", value: "", desc: "归一化算子" },
    { key: "Q", latex: "Q", value: "", desc: "问题向量" },
    { key: "T", latex: "T", value: "", desc: "时间基准" },
    { key: "N", latex: "N", value: "", desc: "称呼扰动" },
    { key: "ε", latex: "\\epsilon", value: "", desc: "微熵扰动" },
    { key: "α", latex: "\\alpha", value: "", desc: "权重系数" },
    { key: "β", latex: "\\beta", value: "", desc: "权重系数" },
    { key: "γ", latex: "\\gamma", value: "", desc: "权重系数" },
  ];

  const params = [...baseVars, ...phaseVars].map((item) => ({
    ...item,
    value: formatValue(rng),
  }));

  const varNodes = params
    .filter((item) => item.key !== "Ω" && item.key !== "σ")
    .map<Node>((item) => ({ type: "var", name: item.latex }));

  const constMin = Math.min(p.constMin, p.constMax);
  const constMax = Math.max(p.constMin, p.constMax);
  const constCount = constMin + Math.floor(rng() * (constMax - constMin + 1));
  for (let i = 0; i < constCount; i += 1) {
    varNodes.push({ type: "const", value: formatDecimal(rng, 0.3, 6.8) });
  }

  shuffle(varNodes, rng);

  const nodes = [...varNodes];
  while (nodes.length > 1) {
    const right = nodes.pop() as Node;
    const left = nodes.pop() as Node;
    const choice = rng();
    let node: Node;
    if (choice < pOp) {
      node = { type: "op", op: pickWeighted(ops, p.opsW, rng), left, right };
    } else if (choice < pOp + pFrac) {
      node = { type: "frac", num: left, den: right };
    } else if (choice < pOp + pFrac + pPow) {
      node = { type: "pow", base: left, exp: right };
    } else {
      node = {
        type: "op",
        op: pickWeighted(ops, p.opsW, rng),
        left: { type: "func", name: pickWeighted(funcs, p.funcsW, rng), arg: left },
        right,
      };
    }
    nodes.push(node);
    if (rng() < p.shuffleP && nodes.length > 1) {
      shuffle(nodes, rng);
    }
  }

  const core = nodes[0] ?? { type: "var", name: "Q" };
  const omega = params.find((item) => item.key === "Ω");
  const omegaValue = computeOmega(core, params);
  if (omega) omega.value = omegaValue;
  const latexCore = render(core);
  const latex = `\\Omega = ${latexCore}`;
  const depth = nodeDepth(core);
  const steps = Array.from({ length: Math.max(2, depth) }, (_, idx) => {
    const limit = idx + 1;
    const partial = render(core, limit);
    return `\\Omega = ${partial}`;
  });

  return { latex, steps, params };
}

function computeOmega(core: Node, params: FormulaParam[]) {
  const varMap = new Map<string, number>();
  for (const p of params) {
    if (p.key === "Ω") continue;
    if (p.key === "σ") continue;
    const v = parseLatexValue(p.value);
    varMap.set(p.latex, v);
  }
  let value = evalNode(core, varMap, { eps: 1e-6, clamp: 1e6, expMax: 7.5, powExpMax: 6.5, logMin: 1e-6 });
  if (!Number.isFinite(value) || Number.isNaN(value)) {
    value = evalNode(core, varMap, { eps: 1e-4, clamp: 5e4, expMax: 6, powExpMax: 5, logMin: 1e-4 });
  }
  return formatComputedLatex(value);
}

function evalNode(
  node: Node,
  varMap: Map<string, number>,
  guard: { eps: number; clamp: number; expMax: number; powExpMax: number; logMin: number },
): number {
  switch (node.type) {
    case "var":
      return clampFinite(varMap.get(node.name) ?? NaN, guard.clamp);
    case "const":
      return clampFinite(parseFloat(node.value), guard.clamp);
    case "op": {
      const left = evalNode(node.left, varMap, guard);
      const right = evalNode(node.right, varMap, guard);
      if (node.op === "+") return clampFinite(left + right, guard.clamp);
      if (node.op === "-") return clampFinite(left - right, guard.clamp);
      return clampFinite(left * right, guard.clamp);
    }
    case "frac": {
      const num = evalNode(node.num, varMap, guard);
      let den = evalNode(node.den, varMap, guard);
      if (!Number.isFinite(den) || Number.isNaN(den)) den = guard.eps;
      if (Math.abs(den) < guard.eps) den = den >= 0 ? guard.eps : -guard.eps;
      return clampFinite(num / den, guard.clamp);
    }
    case "pow": {
      const base = evalNode(node.base, varMap, guard);
      const exp = evalNode(node.exp, varMap, guard);
      return clampFinite(safePow(base, exp, guard), guard.clamp);
    }
    case "func": {
      const arg = evalNode(node.arg, varMap, guard);
      if (node.name === "\\log") return clampFinite(Math.log(Math.max(guard.logMin, Math.abs(arg))), guard.clamp);
      if (node.name === "\\exp") return clampFinite(Math.exp(clampRange(arg, -guard.expMax, guard.expMax)), guard.clamp);
      if (node.name === "\\sin") return clampFinite(Math.sin(clampRange(arg, -1e4, 1e4)), guard.clamp);
      if (node.name === "\\cos") return clampFinite(Math.cos(clampRange(arg, -1e4, 1e4)), guard.clamp);
      return clampFinite(Math.tanh(clampRange(arg, -8, 8)), guard.clamp);
    }
    default:
      return NaN;
  }
}

function clampRange(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function clampFinite(n: number, clamp: number) {
  if (!Number.isFinite(n) || Number.isNaN(n)) return NaN;
  if (n > clamp) return clamp;
  if (n < -clamp) return -clamp;
  return n;
}

function safePow(base: number, exp: number, guard: { eps: number; clamp: number; powExpMax: number; logMin: number }) {
  const e = clampRange(exp, -guard.powExpMax, guard.powExpMax);
  const b = clampRange(base, -guard.clamp, guard.clamp);
  if (Math.abs(b) < guard.eps) return 0;
  if (b < 0 && Math.abs(e - Math.round(e)) > 1e-6) return NaN;
  const abs = Math.abs(b);
  const out = Math.exp(e * Math.log(Math.max(guard.logMin, abs)));
  return b < 0 && Math.round(e) % 2 === 1 ? -out : out;
}

function parseLatexValue(value: string): number {
  const trimmed = value.trim();
  if (trimmed === "\\pi") return Math.PI;
  if (trimmed === "e") return Math.E;
  if (trimmed === "\\infty") return 10000;
  if (trimmed === "\\lim_{x \\to 0} \\frac{\\sin x}{x}") return 1;

  const frac = trimmed.match(/^\\frac\{(\d+)\}\{(\d+)\}$/);
  if (frac) {
    const num = parseFloat(frac[1] ?? "");
    const den = parseFloat(frac[2] ?? "");
    return num / den;
  }

  const sqrt = trimmed.match(/^\\sqrt\{(\d+)\}$/);
  if (sqrt) {
    const n = parseFloat(sqrt[1] ?? "");
    return Math.sqrt(n);
  }

  const square = trimmed.match(/^\\left\((\d+)\\right\)\^\{2\}$/);
  if (square) {
    const n = parseFloat(square[1] ?? "");
    return n * n;
  }

  const num = Number.parseFloat(trimmed);
  if (!Number.isNaN(num)) return num;
  return NaN;
}

function formatComputedLatex(value: number) {
  if (!Number.isFinite(value)) return "\\infty";
  if (Number.isNaN(value)) return "\\square";
  const abs = Math.abs(value);
  if (abs !== 0 && (abs >= 100000 || abs < 0.0001)) {
    const exp = Math.floor(Math.log10(abs));
    const mantissa = value / Math.pow(10, exp);
    return `${mantissa.toFixed(4)}\\times 10^{${exp}}`;
  }
  return value.toFixed(4).replace(/\.?0+$/, "");
}

function render(node: Node, limit?: number, depth = 1): string {
  if (limit && depth > limit) return "\\square";
  switch (node.type) {
    case "var":
      return node.name;
    case "const":
      return node.value;
    case "op": {
      const left = render(node.left, limit, depth + 1);
      const right = render(node.right, limit, depth + 1);
      return `${wrap(node.left, left)} ${node.op} ${wrap(node.right, right)}`;
    }
    case "frac": {
      const num = render(node.num, limit, depth + 1);
      const den = render(node.den, limit, depth + 1);
      return `\\frac{${num}}{${den}}`;
    }
    case "pow": {
      const base = render(node.base, limit, depth + 1);
      const exp = render(node.exp, limit, depth + 1);
      return `${wrap(node.base, base)}^{${exp}}`;
    }
    case "func": {
      const arg = render(node.arg, limit, depth + 1);
      return `${node.name}\\left(${arg}\\right)`;
    }
    default:
      return "";
  }
}

function wrap(node: Node, content: string) {
  if (node.type === "op") return `\\left(${content}\\right)`;
  if (node.type === "frac") return `\\left(${content}\\right)`;
  if (node.type === "pow") return `\\left(${content}\\right)`;
  return content;
}

function nodeDepth(node: Node): number {
  switch (node.type) {
    case "var":
    case "const":
      return 1;
    case "op":
      return 1 + Math.max(nodeDepth(node.left), nodeDepth(node.right));
    case "frac":
      return 1 + Math.max(nodeDepth(node.num), nodeDepth(node.den));
    case "pow":
      return 1 + Math.max(nodeDepth(node.base), nodeDepth(node.exp));
    case "func":
      return 1 + nodeDepth(node.arg);
    default:
      return 1;
  }
}

function makeRng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function randRange(rng: () => number, min: number, max: number) {
  return min + (max - min) * rng();
}

function clamp01(n: number) {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function normalizeWeights(weights: number[] | undefined, expectedLen: number) {
  if (!weights || weights.length !== expectedLen) return null;
  const s = weights.reduce((a, b) => a + (Number.isFinite(b) ? Math.max(0, b) : 0), 0);
  if (s <= 0) return null;
  return weights.map((w) => (Number.isFinite(w) ? Math.max(0, w) / s : 0));
}

function pickWeighted<T>(items: T[], weights: number[], rng: () => number) {
  const w = normalizeWeights(weights, items.length);
  if (!w) return pick(items, rng);
  let x = rng();
  for (let i = 0; i < items.length; i += 1) {
    x -= w[i] ?? 0;
    if (x <= 0) return items[i] as T;
  }
  return items[items.length - 1] as T;
}

function pick<T>(list: T[], rng: () => number) {
  return list[Math.floor(rng() * list.length)] as T;
}

function shuffle<T>(list: T[], rng: () => number) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = list[i];
    list[i] = list[j] as T;
    list[j] = tmp as T;
  }
}

function formatValue(rng: () => number) {
  const choice = rng();
  if (choice < 0.14) return formatDecimal(rng, 0.01, 9.99, 1);
  if (choice < 0.28) return formatDecimal(rng, 10, 99.99, 2);
  if (choice < 0.4) return formatDecimal(rng, 100, 999.99, 3);
  if (choice < 0.52) return formatDecimal(rng, 1000, 9999.99, 4);
  if (choice < 0.62) return `\\frac{${randInt(rng, 1, 99)}}{${randInt(rng, 2, 99)}}`;
  if (choice < 0.7) return `\\sqrt{${randInt(rng, 2, 99)}}`;
  if (choice < 0.76) return `\\left(${randInt(rng, 2, 19)}\\right)^{2}`;
  if (choice < 0.82) return `\\lim_{x \\to 0} \\frac{\\sin x}{x}`;
  if (choice < 0.88) return `\\pi`;
  if (choice < 0.94) return `e`;
  return formatDecimal(rng, 120, 12000, 2);
}

function formatDecimal(rng: () => number, min: number, max: number, digits?: number) {
  const value = randRange(rng, min, max);
  const places = digits ?? (1 + Math.floor(rng() * 4));
  return value.toFixed(places);
}

function randInt(rng: () => number, min: number, max: number) {
  return Math.floor(randRange(rng, min, max + 1));
}
