"use client";

import { useMemo } from "react";
import { BlockMath } from "react-katex";
import { Group, SimpleGrid, Stack, Text } from "@mantine/core";
import type { FormulaData } from "@/utils/formulaEngine";
import { buildFormulaData } from "@/utils/formulaEngine";

type ProgressiveFormulaProps = {
  seed: number | null;
  phaseTerms: string[];
  traceVisible: number;
  traceTotal: number;
  mode: "computing" | "result";
};

export function ProgressiveFormula({
  seed,
  phaseTerms,
  traceVisible,
  traceTotal,
  mode,
}: ProgressiveFormulaProps) {
  const data = useMemo<FormulaData | null>(() => {
    if (seed === null) return null;
    return buildFormulaData(seed, phaseTerms);
  }, [seed, phaseTerms]);

  if (!data) return null;

  const stepIndex =
    traceTotal > 0 ? Math.min(data.steps.length - 1, Math.floor((traceVisible / traceTotal) * data.steps.length)) : 0;
  const latex = mode === "computing" ? data.steps[Math.max(0, stepIndex)] ?? data.latex : data.latex;

  return (
    <Stack gap="sm" className="gua-formula-block">
      <BlockMath math={latex} />
      {mode === "result" ? (
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs" className="gua-params">
          {data.params.map((item) => (
            <Group key={item.key} justify="space-between" wrap="nowrap" className="gua-param-item">
              <Text className="gua-param-key">{item.key}</Text>
              <Text className="gua-param-value">{item.value}</Text>
              <Text className="gua-param-desc">{item.desc}</Text>
            </Group>
          ))}
        </SimpleGrid>
      ) : null}
    </Stack>
  );
}
