"use client";

import { Badge, Box, Button, Group, Paper, Stack, Text, TextInput } from "@mantine/core";
import { useMemo, useState } from "react";
import type { UniverseModelV1 } from "@/types/universeModel";
import type { UniverseModelLibraryV1 } from "@/utils/universeModelLibrary";

export function UniverseModelLibraryPanel(props: {
  library: UniverseModelLibraryV1 | null;
  activeModel: UniverseModelV1 | null;
  error: string | null;
  onCreateNew: () => void;
  onCloneCurrent: () => void;
  onImportAsNew: (file: File) => void;
  onSetActive: (id: string) => void;
  onExportItem: (id: string) => void;
  onDeleteItem: (id: string) => void;
  onRenameItem: (id: string, name: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const activeId = props.library?.activeId ?? null;
  const items = props.library?.items;
  const sorted = useMemo(() => {
    const list = items ?? [];
    return [...list].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  }, [items]);

  return (
    <Paper radius="md" p="md" className="gua-panel">
      <Group justify="space-between" align="center" wrap="wrap" gap="sm">
        <Stack gap={2} style={{ minWidth: 180, flex: "1 1 240px" }}>
          <Text fw={600} className="gua-section-title">
            模型库
          </Text>
          <Text fz="xs" c="dimmed" lineClamp={1}>
            {props.activeModel ? `当前：salt=${String(props.activeModel.salt >>> 0)} · runCount=${props.activeModel.runCount}` : "载入中"}
          </Text>
        </Stack>
        <Badge variant="light" color="gray" radius="md" className="gua-chip">
          {(items ?? []).length}
        </Badge>
      </Group>

      <Group mt="sm" gap="xs" wrap="wrap">
        <Button radius="xl" variant="default" onClick={props.onCreateNew}>
          新建
        </Button>
        <Button radius="xl" variant="default" onClick={props.onCloneCurrent} disabled={!props.activeModel}>
          保存副本
        </Button>
        <Button radius="xl" variant="default" onClick={() => document.getElementById("gua-model-import")?.click()}>
          导入为新档
        </Button>
        <input
          id="gua-model-import"
          type="file"
          accept="application/json"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.currentTarget.files?.[0];
            e.currentTarget.value = "";
            if (f) props.onImportAsNew(f);
          }}
        />
      </Group>

      {props.error ? (
        <Text mt="xs" fz="xs" c="dimmed">
          {props.error}
        </Text>
      ) : null}

      <Box mt="sm" style={{ maxHeight: 360, overflow: "auto", paddingRight: 6 }}>
        {sorted.length === 0 ? (
          <Text fz="sm" c="dimmed">
            暂无模型档位。
          </Text>
        ) : (
          <Stack gap="xs">
            {sorted.map((item) => {
              const isActive = item.id === activeId;
              const deletingDisabled = (items ?? []).length <= 1;
              const isEditing = editingId === item.id;

              return (
                <Paper
                  key={item.id}
                  radius="md"
                  p="sm"
                  className={isActive ? "gua-panel gua-panel-strong" : "gua-panel gua-panel-muted"}
                >
                  <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
                    <Stack gap={2} style={{ minWidth: 220, flex: "1 1 260px" }}>
                      <Group gap="xs" wrap="wrap">
                        <Text fw={600} fz="sm">
                          {item.name || "未命名"}
                        </Text>
                        {isActive ? (
                          <Badge variant="light" color="gray" radius="md" className="gua-chip">
                            当前
                          </Badge>
                        ) : null}
                      </Group>
                      <Text fz="xs" c="dimmed" lineClamp={1}>
                        {new Date(item.updatedAt || item.createdAt).toLocaleString()} · salt={String(item.model?.salt ?? "—")} · runCount=
                        {String(item.model?.runCount ?? "—")}
                      </Text>
                      {isEditing ? (
                        <Group gap="xs" wrap="wrap" mt={6}>
                          <TextInput
                            value={editingName}
                            onChange={(e) => setEditingName(e.currentTarget.value)}
                            placeholder="名称"
                            style={{ flex: "1 1 240px", minWidth: 180 }}
                          />
                          <Button
                            size="xs"
                            radius="xl"
                            onClick={() => {
                              const name = editingName.trim();
                              if (name) props.onRenameItem(item.id, name);
                              setEditingId(null);
                              setEditingName("");
                            }}
                          >
                            保存
                          </Button>
                          <Button
                            size="xs"
                            radius="xl"
                            variant="default"
                            onClick={() => {
                              setEditingId(null);
                              setEditingName("");
                            }}
                          >
                            取消
                          </Button>
                        </Group>
                      ) : null}
                    </Stack>
                    <Group gap="xs" wrap="wrap" style={{ justifyContent: "flex-end" }}>
                      {!isActive ? (
                        <Button size="xs" radius="xl" onClick={() => props.onSetActive(item.id)}>
                          设为当前
                        </Button>
                      ) : null}
                      <Button size="xs" radius="xl" variant="default" onClick={() => props.onExportItem(item.id)}>
                        导出
                      </Button>
                      <Button
                        size="xs"
                        radius="xl"
                        variant="default"
                        onClick={() => {
                          setEditingId(item.id);
                          setEditingName(item.name || "");
                        }}
                      >
                        重命名
                      </Button>
                      <Button
                        size="xs"
                        radius="xl"
                        variant="default"
                        onClick={() => props.onDeleteItem(item.id)}
                        disabled={deletingDisabled}
                      >
                        删除
                      </Button>
                    </Group>
                  </Group>
                </Paper>
              );
            })}
          </Stack>
        )}
      </Box>
    </Paper>
  );
}
