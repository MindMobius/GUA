"use client";

import { Box, Button, Group, Paper, Progress, Stack, Text } from "@mantine/core";
import { StreamingPanels } from "@/components/StreamingPanels";
import type { FormulaParam } from "@/utils/formulaEngine";

export function ComputingTabSection({
  active,
  hasData,
  traceLength,
  traceVisible,
  progressPct,
  isRunning,
  computeSpeedMul,
  onSpeedUp,
  onGoInput,
  formulaMarkdown,
  progressiveParams,
  scienceMarkdown,
  lunarMarkdown,
}: {
  active: boolean;
  hasData: boolean;
  traceLength: number;
  traceVisible: number;
  progressPct: number;
  isRunning: boolean;
  computeSpeedMul: number;
  onSpeedUp: () => void;
  onGoInput: () => void;
  formulaMarkdown: string;
  progressiveParams: FormulaParam[];
  scienceMarkdown: string;
  lunarMarkdown: string;
}) {
  if (!active) return null;
  if (!hasData) {
    return (
      <Paper radius="md" p="xl" className="gua-panel gua-panel-muted">
        <Stack gap="sm">
          <Text fw={600} className="gua-section-title">
            暂无推演信息
          </Text>
          <Text className="gua-section-sub">请到「输入」页面起卦后，再来这里查看推演过程。</Text>
          <Group justify="flex-end">
            <Button radius="xl" variant="default" onClick={onGoInput}>
              去输入
            </Button>
          </Group>
        </Stack>
      </Paper>
    );
  }

  return (
    <Stack gap="md">
      <Paper radius="md" p="md" className="gua-panel">
        <Group justify="space-between" align="center" wrap="wrap" gap="sm">
          <Stack gap={2}>
            <Text fw={600} fz="sm">
              推演进行中
            </Text>
            <Text fz="xs" c="dimmed">
              {traceLength > 0 ? `${Math.min(traceVisible, traceLength)}/${traceLength}` : "采样中"} · {progressPct}%
            </Text>
          </Stack>
          <Group gap="xs" wrap="wrap" style={{ justifyContent: "flex-end", flex: "1 1 260px" }}>
            <Button radius="xl" variant="default" disabled={!isRunning || computeSpeedMul >= 16} onClick={onSpeedUp}>
              加速 ×{computeSpeedMul}
            </Button>
            <Box style={{ width: "min(240px, 100%)", flex: "1 1 160px" }}>
              <Progress value={progressPct} />
            </Box>
          </Group>
        </Group>
      </Paper>
      <StreamingPanels
        formulaMarkdown={formulaMarkdown}
        formulaParams={progressiveParams}
        scienceMarkdown={scienceMarkdown}
        lunarMarkdown={lunarMarkdown}
      />
    </Stack>
  );
}

