"use client";

import { Badge, Box, Button, Group, Paper, SegmentedControl, Stack, Text } from "@mantine/core";

export type DecodeMode = "result_current" | "model_current" | "result_history" | "llm_direct";
export type DirectSource = "current" | "last" | "history";

export type HistoryItemV1 = {
  v: 1;
  id: string;
  createdAt: number;
  question: string;
  datetimeISO: string;
  nickname: string;
  score: number;
  signature?: string;
  root?: string;
  omega?: string;
  feedback: -1 | 0 | 1;
};

export function DecodePromptPanel(props: {
  decodeMode: DecodeMode;
  setDecodeMode: (mode: DecodeMode) => void;
  directSource: DirectSource;
  setDirectSource: (source: DirectSource) => void;
  decodeHistoryPickId: string | null;
  setDecodeHistoryPickId: (id: string | null) => void;
  history: HistoryItemV1[];
  onBack: () => void;
  summaryText: string;
}) {
  const showHistoryPicker =
    props.decodeMode === "result_history" || (props.decodeMode === "llm_direct" && props.directSource === "history");

  return (
    <Stack gap="md">
      <Paper radius="md" p="md" className="gua-panel">
        <Group justify="space-between" align="center" wrap="wrap" gap="sm">
          <Stack gap={2} style={{ minWidth: 180, flex: "1 1 180px" }}>
            <Text fw={600} fz="sm">
              解码模式
            </Text>
            <Text fz="xs" c="dimmed" lineClamp={1}>
              {props.summaryText || "—"}
            </Text>
          </Stack>
          <Button radius="xl" variant="default" onClick={props.onBack}>
            返回
          </Button>
        </Group>

        <SegmentedControl
          mt="sm"
          fullWidth
          value={props.decodeMode}
          onChange={(v) => props.setDecodeMode(v as DecodeMode)}
          data={[
            { value: "result_current", label: "当前结果" },
            { value: "model_current", label: "模型" },
            { value: "result_history", label: "历史" },
            { value: "llm_direct", label: "直推演" },
          ]}
        />
      </Paper>

      {props.decodeMode === "llm_direct" ? (
        <Paper radius="md" p="md" className="gua-panel">
          <Text fw={600} fz="sm">
            数据来源
          </Text>
          <SegmentedControl
            mt="sm"
            fullWidth
            value={props.directSource}
            onChange={(v) => props.setDirectSource(v as DirectSource)}
            data={[
              { value: "current", label: "当前输入" },
              { value: "last", label: "最近一次" },
              { value: "history", label: "历史选择" },
            ]}
          />
        </Paper>
      ) : null}

      {showHistoryPicker ? (
        <Paper radius="md" p="md" className="gua-panel">
          <Group justify="space-between" align="center" wrap="nowrap">
            <Text fw={600} fz="sm">
              选择历史记录
            </Text>
            <Badge variant="light" color="gray" radius="md" className="gua-chip">
              {props.decodeHistoryPickId ? props.decodeHistoryPickId.slice(0, 6) : "未选择"}
            </Badge>
          </Group>
          <Box mt="sm" style={{ maxHeight: 260, overflow: "auto", paddingRight: 6 }}>
            {props.history.length === 0 ? (
              <Text fz="sm" c="dimmed">
                暂无历史记录。
              </Text>
            ) : (
              <Stack gap="xs">
                {props.history.slice(0, 40).map((item) => (
                  <Paper key={item.id} radius="md" p="sm" className="gua-panel gua-panel-muted">
                    <Group justify="space-between" align="flex-start" wrap="nowrap">
                      <Stack gap={2} style={{ minWidth: 0 }}>
                        <Text fz="xs" c="dimmed">
                          {new Date(item.datetimeISO || item.createdAt).toLocaleString()} {item.root ? `· ${String(item.root).slice(0, 8)}` : ""}
                        </Text>
                        <Text fw={600} fz="sm">
                          {item.question || "（无输入）"}
                        </Text>
                        <Text fz="sm" c="dimmed" lineClamp={1}>
                          {item.omega ? `Ω=${item.omega} · ` : ""}Score={item.score}{item.signature ? ` · ${item.signature.slice(0, 8)}` : ""}
                        </Text>
                      </Stack>
                      <Button size="xs" radius="xl" variant={props.decodeHistoryPickId === item.id ? "filled" : "default"} onClick={() => props.setDecodeHistoryPickId(item.id)}>
                        选择
                      </Button>
                    </Group>
                  </Paper>
                ))}
              </Stack>
            )}
          </Box>
        </Paper>
      ) : null}

    </Stack>
  );
}
