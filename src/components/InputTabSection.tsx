"use client";

import { Alert, Badge, Group, Paper, SimpleGrid, Stack, Text, TextInput, Textarea } from "@mantine/core";

export function InputTabSection({
  active,
  question,
  setQuestion,
  datetimeValue,
  setDatetimeValue,
  nickname,
  setNickname,
  shortcutHint,
  canStart,
  onStart,
  modelRunCount,
  error,
}: {
  active: boolean;
  question: string;
  setQuestion: (next: string) => void;
  datetimeValue: string;
  setDatetimeValue: (next: string) => void;
  nickname: string;
  setNickname: (next: string) => void;
  shortcutHint: string;
  canStart: boolean;
  onStart: () => void;
  modelRunCount: number | null;
  error: string | null;
}) {
  if (!active) return null;
  return (
    <Paper radius="md" p="xl" className="gua-panel gua-panel-input">
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Text fw={600} className="gua-section-title">
            推演输入
          </Text>
          <Badge variant="light" color="gray" radius="md" className="gua-chip">
            步骤 1/3
          </Badge>
        </Group>
        <Text className="gua-section-sub">描述你的目标或问题。系统将结合本地观测与模型进行离线推演。</Text>

        <Textarea
          label="目标/问题"
          placeholder="例如：评估本周上线方案的稳定度风险"
          value={question}
          onChange={(e) => setQuestion(e.currentTarget.value)}
          autosize
          minRows={3}
          maxRows={6}
          maxLength={120}
          description={
            <Text component="span" fz="xs" className="gua-hint">
              {Math.min(120, question.length)}/120 · {shortcutHint}
            </Text>
          }
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && canStart) onStart();
          }}
        />

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <TextInput
            label="参考时间"
            type="datetime-local"
            value={datetimeValue}
            onChange={(e) => setDatetimeValue(e.currentTarget.value)}
          />
          <TextInput
            label="标识（可选）"
            placeholder="例如：AB-方案-第3轮"
            value={nickname}
            onChange={(e) => setNickname(e.currentTarget.value)}
            maxLength={24}
          />
        </SimpleGrid>
        <Text fz="xs" c="dimmed">
          {typeof modelRunCount === "number" ? `本机已推演 ${modelRunCount} 次。` : "本机模型载入中。"} 模型/历史/权限在设置里管理。
        </Text>

        {error ? (
          <Alert color="gray" variant="light" radius="md" className="gua-alert">
            {error}
          </Alert>
        ) : null}
      </Stack>
    </Paper>
  );
}

