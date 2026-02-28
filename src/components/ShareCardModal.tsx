"use client";

import type { RefObject } from "react";
import { Box, Button, Group, Modal, Progress, SegmentedControl, Stack, Text } from "@mantine/core";
import { SharePoster, type SharePosterProps } from "@/components/SharePoster";
import type { ShareCardTemplate } from "@/utils/shareCard";

const FALLBACK_QR_DATA_URL = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

export function ShareCardModal({
  opened,
  onClose,
  template,
  setTemplate,
  busy,
  busyText,
  busyPct,
  error,
  previewUrl,
  blobPresent,
  qrDataUrl,
  copySupported,
  onGenerate,
  onDownload,
  onCopy,
  sharePosterRef,
  sharePosterProps,
}: {
  opened: boolean;
  onClose: () => void;
  template: ShareCardTemplate;
  setTemplate: (v: ShareCardTemplate) => void;
  busy: boolean;
  busyText: string;
  busyPct: number;
  error: string | null;
  previewUrl: string | null;
  blobPresent: boolean;
  qrDataUrl: string;
  copySupported: boolean;
  onGenerate: () => void;
  onDownload: () => void;
  onCopy: () => void;
  sharePosterRef: RefObject<HTMLDivElement | null>;
  sharePosterProps: Omit<SharePosterProps, "qrDataUrl">;
}) {
  return (
    <Modal opened={opened} onClose={onClose} size="lg" centered title="分享海报预览">
      <Stack gap="md">
        <Group justify="space-between" align="center" wrap="wrap">
          <SegmentedControl
            value={template}
            onChange={(v) => setTemplate(v as ShareCardTemplate)}
            data={[
              { value: "ai_direct", label: "AI 直推" },
              { value: "divination_decode", label: "推演解码" },
              { value: "model_snapshot", label: "模型快照" },
            ]}
          />
          <Group gap="xs" wrap="wrap">
            <Button radius="xl" variant="default" onClick={onGenerate} disabled={busy || !qrDataUrl}>
              {busy ? "生成中…" : previewUrl ? "重新生成" : "生成海报"}
            </Button>
            <Button radius="xl" variant="default" onClick={onDownload} disabled={!blobPresent}>
              下载 PNG
            </Button>
            <Button radius="xl" variant="default" onClick={onCopy} disabled={!copySupported || !blobPresent}>
              复制图片
            </Button>
          </Group>
        </Group>

        {error ? (
          <Text fz="xs" c="dimmed">
            {error}
          </Text>
        ) : null}
        {busy ? (
          <Stack gap={6}>
            <Text fz="xs" c="dimmed">
              {busyText || "生成中…"}
            </Text>
            <Progress value={busyPct} animated />
          </Stack>
        ) : null}

        <Box style={{ position: "fixed", left: -20000, top: 0, pointerEvents: "none" }}>
          <Box
            ref={sharePosterRef}
            style={{
              width: 1080,
              height: 1350,
              display: "inline-block",
            }}
          >
            <SharePoster {...sharePosterProps} qrDataUrl={qrDataUrl || FALLBACK_QR_DATA_URL} />
          </Box>
        </Box>

        <Box
          style={{
            borderRadius: 16,
            border: "1px solid var(--line)",
            background: "var(--surface-2)",
            overflow: "auto",
            maxHeight: "70vh",
            padding: 14,
          }}
        >
          {previewUrl ? (
            <Box
              component="img"
              src={previewUrl}
              alt="分享海报预览"
              style={{ display: "block", width: "100%", height: "auto", borderRadius: 12 }}
            />
          ) : (
            <Box p="md">
              <Text fz="sm" c="dimmed">
                {busy ? "生成中…" : "暂无预览：请选择类型后点击“生成海报”。"}
              </Text>
            </Box>
          )}
        </Box>
      </Stack>
    </Modal>
  );
}

