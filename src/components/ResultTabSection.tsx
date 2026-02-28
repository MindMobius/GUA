"use client";

import type { MutableRefObject } from "react";
import { Button, Group, Paper, Stack, Text } from "@mantine/core";
import { StreamingPanels } from "@/components/StreamingPanels";
import type { DivinationResult } from "@/utils/divinationEngine";
import type { UniverseModelV1 } from "@/types/universeModel";

type Phase = "input" | "computing" | "result" | "decode";

export function ResultTabSection({
  active,
  result,
  runPhase,
  resultMarkdown,
  isRunning,
  traceLength,
  lastHistoryId,
  lastHistoryIdRef,
  onDecodeClick,
  onDislike,
  onLike,
  feedbackLocked,
  model,
  setActiveTab,
}: {
  active: boolean;
  result: DivinationResult | null;
  runPhase: Phase;
  resultMarkdown: string;
  isRunning: boolean;
  traceLength: number;
  lastHistoryId: string | null;
  lastHistoryIdRef: MutableRefObject<string | null>;
  onDecodeClick: () => void;
  onDislike: () => void;
  onLike: () => void;
  feedbackLocked: boolean;
  model: UniverseModelV1 | null;
  setActiveTab: (tab: Phase) => void;
}) {
  if (!active) return null;
  if (result && runPhase === "result") {
    return (
      <Stack gap="md">
        <StreamingPanels mode="resultOnly" formulaMarkdown={resultMarkdown} scienceMarkdown="" lunarMarkdown="" />
        <Paper radius="md" p="md" className="gua-panel">
          <Group justify="space-between" align="center" wrap="wrap" gap="sm">
            <Stack gap={2}>
              <Text fw={600} fz="sm">
                归一常量结果
              </Text>
              <Text fz="xs" c="dimmed">
                Score={result.score}
                {result.signature ? ` · ${result.signature.slice(0, 8)}` : ""}
              </Text>
            </Stack>
            <Group gap="xs" wrap="wrap" style={{ justifyContent: "flex-end" }}>
              <Button
                radius="xl"
                variant="default"
                onClick={() => {
                  if (!lastHistoryIdRef.current) return;
                  onDecodeClick();
                }}
                disabled={!lastHistoryId}
              >
                解码
              </Button>
            </Group>
          </Group>
        </Paper>
        <Paper radius="md" p="md" className="gua-panel">
          <Group justify="space-between" align="center" wrap="wrap" gap="sm">
            <Stack gap={2}>
              <Text fw={600} fz="sm">
                对于此次宇宙常量的推演，是否满意
              </Text>
              <Text fz="xs" c="dimmed">
                满意会加速本机模型收敛；不满意只记录为负反馈，降低后续参考权重。
              </Text>
            </Stack>
            <Group gap="xs" wrap="wrap" style={{ justifyContent: "flex-end" }}>
              <Button radius="xl" variant="default" onClick={onDislike} disabled={feedbackLocked}>
                不满意
              </Button>
              <Button radius="xl" onClick={onLike} disabled={feedbackLocked || !model}>
                满意
              </Button>
            </Group>
          </Group>
        </Paper>
      </Stack>
    );
  }

  const fallbackToComputing = isRunning || traceLength > 0;
  return (
    <Paper radius="md" p="xl" className="gua-panel gua-panel-muted">
      <Stack gap="sm">
        <Text fw={600} className="gua-section-title">
          暂无归一结果
        </Text>
        <Text className="gua-section-sub">请到「推演」等待完成，或回到「输入」重新起卦。</Text>
        <Group justify="flex-end">
          <Button radius="xl" variant="default" onClick={() => setActiveTab(fallbackToComputing ? "computing" : "input")}>
            {fallbackToComputing ? "去推演" : "去输入"}
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}

