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

type Node =
  | { type: "var"; name: string }
  | { type: "const"; value: string }
  | { type: "op"; op: string; left: Node; right: Node }
  | { type: "frac"; num: Node; den: Node }
  | { type: "pow"; base: Node; exp: Node }
  | { type: "func"; name: string; arg: Node };

const funcs = ["\\log", "\\exp", "\\sin", "\\cos", "\\tanh"];
const ops = ["+", "-", "\\cdot"];

export function buildFormulaData(seed: number, phaseTerms: string[]): FormulaData {
  const rng = makeRng(seed ^ 0x9e3779b1);
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

  const constCount = 2 + Math.floor(rng() * 4);
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
    if (choice < 0.4) {
      node = { type: "op", op: pick(ops, rng), left, right };
    } else if (choice < 0.6) {
      node = { type: "frac", num: left, den: right };
    } else if (choice < 0.8) {
      node = { type: "pow", base: left, exp: right };
    } else {
      node = { type: "op", op: pick(ops, rng), left: { type: "func", name: pick(funcs, rng), arg: left }, right };
    }
    nodes.push(node);
    if (rng() < 0.35 && nodes.length > 1) {
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
  const value = evalNode(core, varMap);
  return formatComputedLatex(value);
}

function evalNode(node: Node, varMap: Map<string, number>): number {
  switch (node.type) {
    case "var":
      return varMap.get(node.name) ?? NaN;
    case "const":
      return parseFloat(node.value);
    case "op": {
      const left = evalNode(node.left, varMap);
      const right = evalNode(node.right, varMap);
      if (node.op === "+") return left + right;
      if (node.op === "-") return left - right;
      return left * right;
    }
    case "frac": {
      const num = evalNode(node.num, varMap);
      const den = evalNode(node.den, varMap);
      return num / den;
    }
    case "pow": {
      const base = evalNode(node.base, varMap);
      const exp = evalNode(node.exp, varMap);
      return Math.pow(base, exp);
    }
    case "func": {
      const arg = evalNode(node.arg, varMap);
      if (node.name === "\\log") return Math.log(arg);
      if (node.name === "\\exp") return Math.exp(arg);
      if (node.name === "\\sin") return Math.sin(arg);
      if (node.name === "\\cos") return Math.cos(arg);
      return Math.tanh(arg);
    }
    default:
      return NaN;
  }
}

function parseLatexValue(value: string): number {
  const trimmed = value.trim();
  if (trimmed === "\\pi") return Math.PI;
  if (trimmed === "e") return Math.E;
  if (trimmed === "\\infty") return Number.POSITIVE_INFINITY;
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
  return `\\infty`;
}

function formatDecimal(rng: () => number, min: number, max: number, digits?: number) {
  const value = randRange(rng, min, max);
  const places = digits ?? (1 + Math.floor(rng() * 4));
  return value.toFixed(places);
}

function randInt(rng: () => number, min: number, max: number) {
  return Math.floor(randRange(rng, min, max + 1));
}
