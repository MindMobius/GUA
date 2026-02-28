"use client";

import { ActionIcon, Badge, Box, Modal, Paper, Progress, SimpleGrid, Stack, Switch, Text, type ModalProps } from "@mantine/core";
import { MarkdownStream } from "@/components/MarkdownStream";
import { UniverseModelLibraryPanel } from "@/components/UniverseModelLibraryPanel";
import type { UniverseModelV1 } from "@/types/universeModel";
import type { UniverseModelLibraryV1 } from "@/utils/universeModelLibrary";

type SettingsHelpTopic = "status" | "score" | "theta";

type DashboardMetricsV1 = {
  runCount: number;
  progress01: number;
  likesRatio01: number;
  scoreMean: number;
  scoreStd: number;
  omegaFiniteRatio01: number;
  feedbackBias: number;
  feedbackCounts: { liked: number; disliked: number };
  theta16: number[];
  thetaStability01: number;
  enhancedStatus: { enabled: boolean; geo: string; motion: string };
  recentSignature: string | null;
};

type EnhancedStateV1 = {
  enabled: boolean;
  geo: string;
  motion: string;
};

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function SettingsModals({
  opened,
  onClose,
  helpOpened,
  onHelpClose,
  helpTitle,
  helpMarkdown,
  openHelpTopic,
  dashboard,
  historyLength,
  modelLibrary,
  model,
  modelLibraryError,
  onCreateNewModelSlot,
  onCloneCurrentModelSlot,
  onImportModelAsNewSlot,
  onSetActiveModelSlot,
  onExportModelSlot,
  onDeleteModelSlot,
  onRenameModelSlot,
  enhanced,
  requestEnhanced,
}: {
  opened: boolean;
  onClose: () => void;
  helpOpened: boolean;
  onHelpClose: () => void;
  helpTitle: string;
  helpMarkdown: string;
  openHelpTopic: (topic: SettingsHelpTopic) => void;
  dashboard: DashboardMetricsV1;
  historyLength: number;
  modelLibrary: UniverseModelLibraryV1 | null;
  model: UniverseModelV1 | null;
  modelLibraryError: string | null;
  onCreateNewModelSlot: () => void;
  onCloneCurrentModelSlot: () => void;
  onImportModelAsNewSlot: (file: File) => void;
  onSetActiveModelSlot: (id: string) => void;
  onExportModelSlot: (id: string) => void;
  onDeleteModelSlot: (id: string) => void;
  onRenameModelSlot: (id: string, name: string) => void;
  enhanced: EnhancedStateV1;
  requestEnhanced: (nextEnabled: boolean) => void;
}) {
  const settingsModalProps = { opened, onClose, size: "lg", centered: true, title: "设置" } satisfies ModalProps;
  return (
    <>
      <Modal {...settingsModalProps}>
        <Stack gap="md">
          <Paper radius="md" p="md" className="gua-panel">
            <Stack gap="xs">
              <Box>
                <Box style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Box style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Text fw={600} className="gua-section-title">
                      个人宇宙常量 · 现状
                    </Text>
                    <ActionIcon variant="subtle" color="gray" radius="xl" aria-label="现状说明" onClick={() => openHelpTopic("status")}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path
                          d="M12 17v-5.2c0-1.1.9-2 2-2h.2c.9 0 1.8-.7 1.8-1.6 0-1.1-1.1-2-2.4-2h-3.2C8.6 6.2 7 7.7 7 9.5"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path d="M12 20.3a.8.8 0 1 0 0-1.6.8.8 0 0 0 0 1.6Z" fill="currentColor" />
                        <path
                          d="M12 22c5.5 0 10-4.5 10-10S17.5 2 12 2 2 6.5 2 12s4.5 10 10 10Z"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </ActionIcon>
                  </Box>
                  <Badge variant="light" color="gray" radius="md" className="gua-chip">
                    {dashboard.runCount}
                  </Badge>
                </Box>
              </Box>
              <Stack gap="xs" mt="sm">
                <Box style={{ display: "flex", justifyContent: "space-between" }}>
                  <Text fz="xs" c="dimmed">
                    演化进度
                  </Text>
                  <Text fz="xs" c="dimmed">
                    {Math.round(dashboard.progress01 * 100)}%
                  </Text>
                </Box>
                <Progress value={dashboard.progress01 * 100} />
                <Box style={{ display: "flex", justifyContent: "space-between" }}>
                  <Text fz="xs" c="dimmed">
                    满意比例
                  </Text>
                  <Text fz="xs" c="dimmed">
                    {Math.round(dashboard.likesRatio01 * 100)}%
                  </Text>
                </Box>
                <Text fz="xs" c="dimmed">
                  签名：{dashboard.recentSignature ? String(dashboard.recentSignature).slice(0, 8) : "—"}
                </Text>
              </Stack>
            </Stack>
          </Paper>

          <Paper radius="md" p="md" className="gua-panel">
            <Box style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Box style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Text fw={600} className="gua-section-title">
                  多维度评分
                </Text>
                <ActionIcon variant="subtle" color="gray" radius="xl" aria-label="评分说明" onClick={() => openHelpTopic("score")}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M12 17v-5.2c0-1.1.9-2 2-2h.2c.9 0 1.8-.7 1.8-1.6 0-1.1-1.1-2-2.4-2h-3.2C8.6 6.2 7 7.7 7 9.5"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path d="M12 20.3a.8.8 0 1 0 0-1.6.8.8 0 0 0 0 1.6Z" fill="currentColor" />
                    <path
                      d="M12 22c5.5 0 10-4.5 10-10S17.5 2 12 2 2 6.5 2 12s4.5 10 10 10Z"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </ActionIcon>
              </Box>
              <Badge variant="light" color="gray" radius="md" className="gua-chip">
                N={Math.min(20, historyLength)}
              </Badge>
            </Box>
            <Stack gap="xs" mt="sm">
              <Text fz="sm">
                Score：均值 {dashboard.scoreMean.toFixed(1)} · 波动 {dashboard.scoreStd.toFixed(1)}
              </Text>
              <Box style={{ display: "flex", justifyContent: "space-between" }}>
                <Text fz="xs" c="dimmed">
                  Ω 有限率
                </Text>
                <Text fz="xs" c="dimmed">
                  {Math.round(dashboard.omegaFiniteRatio01 * 100)}%
                </Text>
              </Box>
              <Progress value={dashboard.omegaFiniteRatio01 * 100} />
              <Text fz="xs" c="dimmed">
                反馈倾向：{dashboard.feedbackBias.toFixed(2)} · 满意 {dashboard.feedbackCounts.liked} · 不满意 {dashboard.feedbackCounts.disliked}
              </Text>
              <Text fz="xs" c="dimmed">
                观测：{dashboard.enhancedStatus.enabled ? "增强开启" : "增强关闭"} · 地理 {dashboard.enhancedStatus.geo} · 方向{" "}
                {dashboard.enhancedStatus.motion}
              </Text>
            </Stack>
          </Paper>

          <Paper radius="md" p="md" className="gua-panel">
            <Box style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Box style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Text fw={600} className="gua-section-title">
                  模型维度（θ16）
                </Text>
                <ActionIcon variant="subtle" color="gray" radius="xl" aria-label="维度说明" onClick={() => openHelpTopic("theta")}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M12 17v-5.2c0-1.1.9-2 2-2h.2c.9 0 1.8-.7 1.8-1.6 0-1.1-1.1-2-2.4-2h-3.2C8.6 6.2 7 7.7 7 9.5"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path d="M12 20.3a.8.8 0 1 0 0-1.6.8.8 0 0 0 0 1.6Z" fill="currentColor" />
                    <path
                      d="M12 22c5.5 0 10-4.5 10-10S17.5 2 12 2 2 6.5 2 12s4.5 10 10 10Z"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </ActionIcon>
              </Box>
              <Badge variant="light" color="gray" radius="md" className="gua-chip">
                稳定度 {Math.round(dashboard.thetaStability01 * 100)}%
              </Badge>
            </Box>
            <SimpleGrid cols={{ base: 8, sm: 16 }} spacing={6} mt="sm">
              {dashboard.theta16.map((v, i) => (
                <Box
                  key={`theta-${i}`}
                  style={{
                    height: 44,
                    borderRadius: 10,
                    background: "rgba(15,23,42,0.06)",
                    display: "flex",
                    alignItems: "flex-end",
                    padding: 4,
                  }}
                >
                  <Box
                    style={{
                      width: "100%",
                      height: `${Math.max(2, Math.round(clamp01(v) * 100))}%`,
                      borderRadius: 8,
                      background: "rgba(15,23,42,0.75)",
                    }}
                  />
                </Box>
              ))}
            </SimpleGrid>
          </Paper>

          <UniverseModelLibraryPanel
            library={modelLibrary}
            activeModel={model}
            error={modelLibraryError}
            onCreateNew={onCreateNewModelSlot}
            onCloneCurrent={onCloneCurrentModelSlot}
            onImportAsNew={(f) => void onImportModelAsNewSlot(f)}
            onSetActive={onSetActiveModelSlot}
            onExportItem={onExportModelSlot}
            onDeleteItem={onDeleteModelSlot}
            onRenameItem={onRenameModelSlot}
          />

          <Paper radius="md" p="md" className="gua-panel">
            <Box style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Text fw={600} className="gua-section-title">
                增强观测
              </Text>
              <Switch checked={enhanced.enabled} onChange={(e) => requestEnhanced(e.currentTarget.checked)} />
            </Box>
            <Text mt="xs" fz="xs" c="dimmed">
              地理：{enhanced.geo} · 方向：{enhanced.motion}
            </Text>
            <Text fz="xs" c="dimmed">
              授权仅用于本地观测，不会上传。历史反馈会影响后续推演的参考权重。
            </Text>
          </Paper>
        </Stack>
      </Modal>

      <Modal opened={helpOpened} onClose={onHelpClose} size="lg" centered title={helpTitle}>
        <Paper radius="md" p="md" className="gua-panel">
          <MarkdownStream content={helpMarkdown} />
        </Paper>
      </Modal>
    </>
  );
}

