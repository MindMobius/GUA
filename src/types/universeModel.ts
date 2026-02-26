import type { FormulaPolicy } from "@/utils/formulaEngine";

export type UniverseModelV1 = {
  v: 1;
  salt: number;
  runCount: number;
  theta16: number[];
  policy: FormulaPolicy;
  likes: { total: number; liked: number };
  updatedAt: number;
};

