"use client";

import { Button, Group, Modal, Select, Stack, Switch, Text } from "@mantine/core";

export type LlmModelConfig = { id: string; thinking: boolean };
export type LlmConfigResponse = { models: LlmModelConfig[]; defaults: { model: string; stream: boolean; thinking: boolean } };

export function AiConfigModal(props: {
  opened: boolean;
  onClose: () => void;
  llmConfig: LlmConfigResponse | null;
  llmConfigError: string | null;
  decodeModel: string | null;
  setDecodeModel: (v: string | null) => void;
  decodeStreamEnabled: boolean;
  setDecodeStreamEnabled: (v: boolean) => void;
  decodeThinkingEnabled: boolean;
  setDecodeThinkingEnabled: (v: boolean) => void;
  decodeThinkingSupported: boolean;
  onResetDefaults: () => void;
}) {
  const models = props.llmConfig?.models ?? [];

  return (
    <Modal opened={props.opened} onClose={props.onClose} size="md" centered title="AI 配置">
      <Stack gap="md">
        <Select
          label="模型"
          value={props.decodeModel}
          placeholder="选择模型"
          data={models.map((m) => ({ value: m.id, label: `${m.id}${m.thinking ? " · 思考" : ""}` }))}
          onChange={(v) => props.setDecodeModel(v)}
          comboboxProps={{ withinPortal: true }}
        />
        <Group justify="space-between" align="center" wrap="wrap">
          <Switch
            checked={props.decodeStreamEnabled}
            onChange={(e) => props.setDecodeStreamEnabled(e.currentTarget.checked)}
            label="流式输出"
          />
          <Switch
            checked={props.decodeThinkingEnabled}
            disabled={!props.decodeThinkingSupported}
            onChange={(e) => props.setDecodeThinkingEnabled(e.currentTarget.checked)}
            label="深度思考"
          />
        </Group>
        {props.llmConfigError ? (
          <Text fz="xs" c="dimmed">
            {props.llmConfigError}
          </Text>
        ) : null}
        <Group justify="space-between" align="center" wrap="wrap">
          <Button radius="xl" variant="default" onClick={props.onResetDefaults} disabled={!props.llmConfig}>
            恢复默认
          </Button>
          <Button radius="xl" onClick={props.onClose}>
            关闭
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

