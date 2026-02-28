"use client";

import { Badge, Box, Button, Group, Modal, Paper, Stack, Text } from "@mantine/core";
import { MarkdownStream } from "@/components/MarkdownStream";
import { type HistoryItemV1 as PromptHistoryItemV1 } from "@/components/DecodePromptPanel";

export function DivinationHistoryModals({
  opened,
  onClose,
  items,
  openDetail,
  detail,
  closeDetail,
  formatIsoMinute,
  onSetFeedback,
  onDelete,
  detailFormulaMarkdown,
  detailTraceMarkdown,
  detailPacketJson,
}: {
  opened: boolean;
  onClose: () => void;
  items: PromptHistoryItemV1[];
  openDetail: (id: string) => void;

  detail: PromptHistoryItemV1 | null;
  closeDetail: () => void;

  formatIsoMinute: (value: string | number) => string;
  onSetFeedback: (id: string, feedback: -1 | 0 | 1) => void;
  onDelete: (id: string) => void;

  detailFormulaMarkdown: string;
  detailTraceMarkdown: string;
  detailPacketJson: string;
}) {
  return (
    <>
      <Modal opened={opened} onClose={onClose} size="lg" centered title="推演历史">
        <Stack gap="md">
          <Paper radius="md" p="md" className="gua-panel">
            <Group justify="space-between" align="center" wrap="nowrap">
              <Text fw={600} className="gua-section-title">
                归一结果记录
              </Text>
              <Badge variant="light" color="gray" radius="md" className="gua-chip">
                {items.length}
              </Badge>
            </Group>
            <Text mt="xs" fz="xs" c="dimmed">
              推演历史与反馈从设置移至此处展示。仅保存在本地。
            </Text>
          </Paper>

          <Paper radius="md" p="md" className="gua-panel">
            <Box mt="sm" style={{ maxHeight: 420, overflow: "auto", paddingRight: 6 }}>
              {items.length === 0 ? (
                <Text fz="sm" c="dimmed">
                  暂无推演历史记录。
                </Text>
              ) : (
                <Stack gap="xs">
                  {items.map((item) => (
                    <Paper
                      key={item.id}
                      radius="md"
                      p="sm"
                      className="gua-panel gua-panel-muted"
                      style={{ cursor: "pointer" }}
                      onClick={() => openDetail(item.id)}
                    >
                      <Group justify="space-between" align="flex-start" wrap="nowrap">
                        <Stack gap={2} style={{ minWidth: 0 }}>
                          <Text fz="xs" c="dimmed">
                            {formatIsoMinute(item.datetimeISO || item.createdAt)} {item.root ? `· ${String(item.root).slice(0, 8)}` : ""}
                          </Text>
                          <Text fw={600} fz="sm">
                            {item.question || "（无输入）"}
                          </Text>
                          <Text fz="sm" c="dimmed" lineClamp={2}>
                            {item.omega ? `Ω=${item.omega} · ` : ""}Score={item.score}
                            {item.signature ? ` · ${item.signature.slice(0, 12)}` : ""}
                          </Text>
                        </Stack>
                        <Group gap="xs" wrap="nowrap">
                          <Button
                            size="xs"
                            radius="xl"
                            variant={item.feedback === 1 ? "filled" : "default"}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSetFeedback(item.id, 1);
                            }}
                          >
                            满意
                          </Button>
                          <Button
                            size="xs"
                            radius="xl"
                            variant={item.feedback === -1 ? "filled" : "default"}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSetFeedback(item.id, -1);
                            }}
                          >
                            不满意
                          </Button>
                          <Button
                            size="xs"
                            radius="xl"
                            variant="default"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(item.id);
                            }}
                          >
                            删除
                          </Button>
                        </Group>
                      </Group>
                    </Paper>
                  ))}
                </Stack>
              )}
            </Box>
          </Paper>
        </Stack>
      </Modal>

      <Modal opened={Boolean(detail)} onClose={closeDetail} size="xl" centered title="推演详情">
        {detail ? (
          <Stack gap="md">
            <Paper radius="md" p="md" className="gua-panel">
              <Group justify="space-between" align="center" wrap="wrap" gap="sm">
                <Stack gap={2} style={{ minWidth: 240, flex: "1 1 240px" }}>
                  <Text fw={600} fz="sm">
                    {detail.question || "（无输入）"}
                  </Text>
                  <Text fz="xs" c="dimmed" lineClamp={2}>
                    {formatIsoMinute(detail.datetimeISO || detail.createdAt)}
                    {detail.root ? ` · ${String(detail.root).slice(0, 8)}` : ""}
                    {detail.signature ? ` · ${detail.signature.slice(0, 12)}` : ""}
                  </Text>
                </Stack>
                <Group gap="xs" wrap="nowrap">
                  <Button
                    size="xs"
                    radius="xl"
                    variant={detail.feedback === 1 ? "filled" : "default"}
                    onClick={() => onSetFeedback(detail.id, 1)}
                  >
                    满意
                  </Button>
                  <Button
                    size="xs"
                    radius="xl"
                    variant={detail.feedback === -1 ? "filled" : "default"}
                    onClick={() => onSetFeedback(detail.id, -1)}
                  >
                    不满意
                  </Button>
                  <Button size="xs" radius="xl" variant="default" onClick={() => onDelete(detail.id)}>
                    删除
                  </Button>
                </Group>
              </Group>
            </Paper>

            <Paper radius="md" p="md" className="gua-panel">
              <Group justify="space-between" align="center" wrap="nowrap">
                <Text fw={600} fz="sm">
                  归一公式
                </Text>
                <Group gap="xs" wrap="nowrap">
                  <Badge variant="light" color="gray" radius="md" className="gua-chip">
                    Score={detail.score}
                  </Badge>
                  <Badge variant="light" color="gray" radius="md" className="gua-chip">
                    {detail.omega ? `Ω=${detail.omega}` : "Ω=—"}
                  </Badge>
                </Group>
              </Group>
              <Box mt="sm" className="gua-stream-body gua-decode-body">
                <MarkdownStream content={detailFormulaMarkdown || "—"} className="gua-stream-body-inner" />
              </Box>
            </Paper>

            {detailTraceMarkdown ? (
              <Paper radius="md" p="md" className="gua-panel">
                <Text fw={600} fz="sm">
                  推演过程（现代块）
                </Text>
                <Box mt="sm" className="gua-stream-body gua-scroll-body">
                  <MarkdownStream content={detailTraceMarkdown} className="gua-stream-body-inner" />
                </Box>
              </Paper>
            ) : null}

            <Paper radius="md" p="md" className="gua-panel">
              <Text fw={600} fz="sm">
                原始数据
              </Text>
              <Box mt="sm" style={{ maxHeight: 320, overflow: "auto", paddingRight: 6 }}>
                <Text component="pre" fz="xs" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>
                  {detailPacketJson || "—"}
                </Text>
              </Box>
            </Paper>
          </Stack>
        ) : null}
      </Modal>
    </>
  );
}

