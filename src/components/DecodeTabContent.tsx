"use client";

import type { MutableRefObject, RefObject } from "react";
import { Alert, Badge, Box, Button, Group, Modal, Paper, Stack, Text } from "@mantine/core";
import { DecodePromptPanel, type DecodeMode, type DirectSource, type HistoryItemV1 as PromptHistoryItemV1 } from "@/components/DecodePromptPanel";
import { MarkdownStream } from "@/components/MarkdownStream";

type DecodeAiHistoryItemV1 = {
  v: 1;
  id: string;
  createdAt: number;
  mode: DecodeMode;
  directSource: DirectSource;
  historyPickId: string | null;
  options: { model: string | null; stream: boolean; thinking: boolean };
  context: { k: "hid"; hid: string } | { k: "snapshot"; snapshot: unknown };
  summary: {
    question: string;
    nickname: string;
    datetimeISO: string;
    score: number;
    omega: string;
    signature: string;
  };
  response: {
    answer: string;
    reasoning: string;
    error: string | null;
    aborted: boolean;
    finishedAt: number | null;
    durationMs: number | null;
  };
};

export function DecodeTabContent({
  decodeMode,
  setDecodeMode,
  directSource,
  setDirectSource,
  decodeHistoryPickId,
  setDecodeHistoryPickId,
  history,
  onBack,
  summaryText,
  decodeError,
  decodeAuto,
  setDecodeAuto,
  decodeThinkingEnabled,
  decodeReasoning,
  decodeReasoningOpen,
  setDecodeReasoningOpen,
  decodeStreaming,
  decodePacket,
  onDecodeStart,
  onDecodeStop,
  decodeAnswerMarkdown,
  decodeReasoningMarkdown,
  decodeOutRef,
  decodeReasonRef,
  decodeOutProgrammatic: decodeOutProgrammaticRef,
  decodeReasonProgrammatic: decodeReasonProgrammaticRef,
  decodeReasoningManualRef,
  decodeAutoCollapseArmedRef,
  isNearBottom,
  scrollDecodeToBottom,
  scrollReasonToBottom,
}: {
  decodeMode: DecodeMode;
  setDecodeMode: (mode: DecodeMode) => void;
  directSource: DirectSource;
  setDirectSource: (source: DirectSource) => void;
  decodeHistoryPickId: string | null;
  setDecodeHistoryPickId: (id: string | null) => void;
  history: PromptHistoryItemV1[];
  onBack: () => void;
  summaryText: string;

  decodeError: string | null;
  decodeAuto: boolean;
  setDecodeAuto: (next: boolean | ((prev: boolean) => boolean)) => void;
  decodeThinkingEnabled: boolean;
  decodeReasoning: string;
  decodeReasoningOpen: boolean;
  setDecodeReasoningOpen: (next: boolean | ((prev: boolean) => boolean)) => void;
  decodeStreaming: boolean;
  decodePacket: unknown | null;
  onDecodeStart: () => void;
  onDecodeStop: () => void;

  decodeAnswerMarkdown: string;
  decodeReasoningMarkdown: string;

  decodeOutRef: RefObject<HTMLDivElement | null>;
  decodeReasonRef: RefObject<HTMLDivElement | null>;
  decodeOutProgrammatic: MutableRefObject<boolean>;
  decodeReasonProgrammatic: MutableRefObject<boolean>;
  decodeReasoningManualRef: MutableRefObject<boolean>;
  decodeAutoCollapseArmedRef: MutableRefObject<boolean>;

  isNearBottom: (node: HTMLDivElement, thresholdPx: number) => boolean;
  scrollDecodeToBottom: () => void;
  scrollReasonToBottom: () => void;
}) {
  return (
    <Stack gap="md">
      <DecodePromptPanel
        decodeMode={decodeMode}
        setDecodeMode={setDecodeMode}
        directSource={directSource}
        setDirectSource={setDirectSource}
        decodeHistoryPickId={decodeHistoryPickId}
        setDecodeHistoryPickId={setDecodeHistoryPickId}
        history={history}
        onBack={onBack}
        summaryText={summaryText}
      />

      {decodeError ? (
        <Alert color="gray" variant="light" radius="md" className="gua-alert">
          {decodeError}
        </Alert>
      ) : null}

      <Paper radius="md" p="md" className="gua-panel">
        <Group justify="space-between" align="center" wrap="wrap" gap="sm">
          <Text fw={600} fz="sm">
            解码输出
          </Text>
          <Group gap="xs" wrap="wrap" style={{ justifyContent: "flex-end", flex: "1 1 360px" }}>
            <Group gap="xs" wrap="wrap">
              <Button
                radius="xl"
                variant={decodeAuto ? "filled" : "default"}
                onClick={() => {
                  if (decodeAuto) {
                    setDecodeAuto(false);
                    return;
                  }
                  setDecodeAuto(true);
                  scrollDecodeToBottom();
                }}
              >
                {decodeAuto ? "滚屏开" : "滚屏关"}
              </Button>
              {decodeThinkingEnabled || decodeReasoning.trim() ? (
                <Button
                  radius="xl"
                  variant="default"
                  onClick={() => {
                    decodeReasoningManualRef.current = true;
                    decodeAutoCollapseArmedRef.current = false;
                    setDecodeReasoningOpen((v) => !v);
                    if (!decodeReasoningOpen && decodeAuto) queueMicrotask(() => scrollReasonToBottom());
                  }}
                >
                  {decodeReasoningOpen ? "收起思考" : "查看思考"}
                </Button>
              ) : null}
            </Group>
            <Group gap="xs" wrap="wrap">
              <Button radius="xl" variant="default" onClick={onDecodeStop} disabled={!decodeStreaming}>
                停止
              </Button>
              <Button radius="xl" onClick={onDecodeStart} disabled={!decodePacket || decodeStreaming}>
                {decodeStreaming ? "解码中…" : "开始解码"}
              </Button>
            </Group>
          </Group>
        </Group>
        {decodeReasoningOpen && (decodeReasoningMarkdown || (decodeStreaming && decodeThinkingEnabled)) ? (
          <Box
            ref={decodeReasonRef}
            mt="sm"
            className="gua-stream-body gua-scroll-body gua-decode-reasoning"
            onScroll={(e) => {
              const node = e.currentTarget;
              if (decodeReasonProgrammaticRef.current) {
                decodeReasonProgrammaticRef.current = false;
                return;
              }
              if (decodeAuto && !isNearBottom(node, 48)) setDecodeAuto(false);
            }}
          >
            <MarkdownStream
              content={decodeReasoningMarkdown || (decodeStreaming && decodeThinkingEnabled ? "思考中…" : "")}
              className="gua-stream-body-inner"
            />
          </Box>
        ) : null}
        <Box
          ref={decodeOutRef}
          mt="sm"
          className="gua-stream-body gua-decode-body"
          onScroll={(e) => {
            const node = e.currentTarget;
            if (decodeOutProgrammaticRef.current) {
              decodeOutProgrammaticRef.current = false;
              return;
            }
            if (decodeAuto && !isNearBottom(node, 48)) setDecodeAuto(false);
          }}
        >
          <MarkdownStream content={decodeAnswerMarkdown || (decodeStreaming ? "正在解码…" : "")} className="gua-stream-body-inner" />
        </Box>
      </Paper>
    </Stack>
  );
}

export function DecodeHistoryModals({
  opened,
  onClose,
  items,
  openDetail,
  detail,
  closeDetail,
  formatIsoMinute,
  previewFromMarkdown,
  decodeHistoryAnswerMarkdown,
  decodeHistoryReasoningMarkdown,
  decodeHistoryDetailContextJson,
}: {
  opened: boolean;
  onClose: () => void;
  items: DecodeAiHistoryItemV1[];
  openDetail: (id: string) => void;

  detail: DecodeAiHistoryItemV1 | null;
  closeDetail: () => void;

  formatIsoMinute: (value: string | number) => string;
  previewFromMarkdown: (markdown: string) => string;

  decodeHistoryAnswerMarkdown: string;
  decodeHistoryReasoningMarkdown: string;
  decodeHistoryDetailContextJson: string;
}) {
  const decodeHistoryDetail = detail;
  return (
    <>
      <Modal opened={opened} onClose={onClose} size="lg" centered title="解码历史">
        <Stack gap="md">
          <Paper radius="md" p="md" className="gua-panel">
            <Group justify="space-between" align="center" wrap="nowrap">
              <Text fw={600} className="gua-section-title">
                请求与响应
              </Text>
              <Badge variant="light" color="gray" radius="md" className="gua-chip">
                {items.length}
              </Badge>
            </Group>
            <Text mt="xs" fz="xs" c="dimmed">
              记录每次点击「开始解码」触发的 AI 解码请求与输出。仅保存在本地。
            </Text>
          </Paper>

          <Paper radius="md" p="md" className="gua-panel">
            <Box mt="sm" style={{ maxHeight: 420, overflow: "auto", paddingRight: 6 }}>
              {items.length === 0 ? (
                <Text fz="sm" c="dimmed">
                  暂无解码历史记录。
                </Text>
              ) : (
                <Stack gap="xs">
                  {items.map((item) => {
                    const modeLabel =
                      item.mode === "result_current"
                        ? "当前结果"
                        : item.mode === "model_current"
                          ? "模型"
                          : item.mode === "result_history"
                            ? "历史结果"
                            : "直推演";
                    const preview =
                      previewFromMarkdown(item.response.answer) ||
                      (item.response.error ? `错误：${item.response.error}` : item.response.aborted ? "已取消" : "—");
                    return (
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
                              {formatIsoMinute(item.createdAt)} · {modeLabel}
                              {item.options.model ? ` · ${item.options.model}` : ""}
                            </Text>
                            <Text fw={600} fz="sm">
                              {item.summary.question || "（无输入）"}
                            </Text>
                            <Text fz="sm" c="dimmed" lineClamp={2}>
                              {preview}
                            </Text>
                          </Stack>
                          <Badge variant="light" color="gray" radius="md" className="gua-chip">
                            {item.id.slice(0, 6)}
                          </Badge>
                        </Group>
                      </Paper>
                    );
                  })}
                </Stack>
              )}
            </Box>
          </Paper>
        </Stack>
      </Modal>

      <Modal opened={Boolean(decodeHistoryDetail)} onClose={closeDetail} size="xl" centered title="解码详情">
        {decodeHistoryDetail ? (
          <Stack gap="md">
            <Paper radius="md" p="md" className="gua-panel">
              <Group justify="space-between" align="center" wrap="wrap" gap="sm">
                <Stack gap={2} style={{ minWidth: 240, flex: "1 1 240px" }}>
                  <Text fw={600} fz="sm">
                    {decodeHistoryDetail.summary.question || "（无输入）"}
                  </Text>
                  <Text fz="xs" c="dimmed" lineClamp={2}>
                    {formatIsoMinute(decodeHistoryDetail.createdAt)}
                    {decodeHistoryDetail.options.model ? ` · ${decodeHistoryDetail.options.model}` : ""}
                    {decodeHistoryDetail.response.durationMs ? ` · ${decodeHistoryDetail.response.durationMs}ms` : ""}
                    {decodeHistoryDetail.response.aborted ? " · 已取消" : ""}
                  </Text>
                </Stack>
                <Group gap="xs" wrap="nowrap">
                  <Badge variant="light" color="gray" radius="md" className="gua-chip">
                    Score={decodeHistoryDetail.summary.score}
                  </Badge>
                  <Badge variant="light" color="gray" radius="md" className="gua-chip">
                    {decodeHistoryDetail.summary.omega ? `Ω=${decodeHistoryDetail.summary.omega}` : "Ω=—"}
                  </Badge>
                </Group>
              </Group>
            </Paper>

            {decodeHistoryDetail.response.error ? (
              <Alert color="gray" variant="light" radius="md" className="gua-alert">
                {decodeHistoryDetail.response.error}
              </Alert>
            ) : null}

            <Paper radius="md" p="md" className="gua-panel">
              <Text fw={600} fz="sm">
                AI 回答
              </Text>
              <Box mt="sm" className="gua-stream-body gua-decode-body">
                <MarkdownStream content={decodeHistoryAnswerMarkdown || "—"} className="gua-stream-body-inner" />
              </Box>
            </Paper>

            {decodeHistoryReasoningMarkdown ? (
              <Paper radius="md" p="md" className="gua-panel">
                <Text fw={600} fz="sm">
                  思考过程
                </Text>
                <Box mt="sm" className="gua-stream-body gua-scroll-body gua-decode-reasoning">
                  <MarkdownStream content={decodeHistoryReasoningMarkdown} className="gua-stream-body-inner" />
                </Box>
              </Paper>
            ) : null}

            <Paper radius="md" p="md" className="gua-panel">
              <Group justify="space-between" align="center" wrap="nowrap">
                <Text fw={600} fz="sm">
                  请求上下文
                </Text>
                <Badge variant="light" color="gray" radius="md" className="gua-chip">
                  {decodeHistoryDetail.context.k === "hid" ? `hid:${decodeHistoryDetail.context.hid.slice(0, 6)}` : "snapshot"}
                </Badge>
              </Group>
              <Box mt="sm" style={{ maxHeight: 320, overflow: "auto", paddingRight: 6 }}>
                <Text component="pre" fz="xs" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>
                  {decodeHistoryDetailContextJson || "—"}
                </Text>
              </Box>
            </Paper>
          </Stack>
        ) : null}
      </Modal>
    </>
  );
}
