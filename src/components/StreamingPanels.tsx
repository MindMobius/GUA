"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Group, Modal, Paper, SimpleGrid, Stack, Text } from "@mantine/core";
import { MarkdownStream } from "@/components/MarkdownStream";
import type { FormulaParam } from "@/utils/formulaEngine";

type StreamingPanelsProps = {
  formulaMarkdown: string;
  formulaParams?: FormulaParam[];
  scienceMarkdown: string;
  lunarMarkdown: string;
};

export function StreamingPanels({ formulaMarkdown, formulaParams, scienceMarkdown, lunarMarkdown }: StreamingPanelsProps) {
  const [scienceAuto, setScienceAuto] = useState(true);
  const [lunarAuto, setLunarAuto] = useState(true);
  const [formulaOpen, setFormulaOpen] = useState(false);

  const formulaRef = useRef<HTMLDivElement | null>(null);
  const scienceRef = useRef<HTMLDivElement | null>(null);
  const lunarRef = useRef<HTMLDivElement | null>(null);
  const formulaModalRef = useRef<HTMLDivElement | null>(null);

  const scienceProgrammatic = useRef(false);
  const lunarProgrammatic = useRef(false);

  useEffect(() => {
    if (scienceAuto) scrollToBottom(scienceRef, scienceProgrammatic);
  }, [scienceMarkdown, scienceAuto]);

  useEffect(() => {
    if (lunarAuto) scrollToBottom(lunarRef, lunarProgrammatic);
  }, [lunarMarkdown, lunarAuto]);

  useEffect(() => {
    const node = formulaRef.current;
    if (!node) return;
    const ro = new ResizeObserver(() => scaleFormula(node));
    ro.observe(node);
    let raf = 0;
    let scheduled = false;
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      raf = requestAnimationFrame(() => {
        scheduled = false;
        scaleFormula(node);
      });
    };
    const mo = new MutationObserver(() => schedule());
    mo.observe(node, { childList: true, subtree: true, characterData: true });
    schedule();
    return () => {
      mo.disconnect();
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    if (formulaOpen) {
      const node = formulaModalRef.current;
      if (!node) return;
      const ro = new ResizeObserver(() => scaleFormula(node));
      ro.observe(node);
      let raf = 0;
      let scheduled = false;
      const schedule = () => {
        if (scheduled) return;
        scheduled = true;
        raf = requestAnimationFrame(() => {
          scheduled = false;
          scaleFormula(node);
        });
      };
      const mo = new MutationObserver(() => schedule());
      mo.observe(node, { childList: true, subtree: true, characterData: true });
      schedule();
      return () => {
        mo.disconnect();
        ro.disconnect();
        if (raf) cancelAnimationFrame(raf);
      };
    }
    return undefined;
  }, [formulaOpen, formulaMarkdown]);

  return (
    <Stack gap="lg">
      <Paper
        radius="md"
        p="xl"
        className="gua-panel gua-panel-strong gua-stream-panel gua-formula-panel"
        onClick={() => setFormulaOpen(true)}
      >
        <Group justify="space-between" align="center" className="gua-stream-header">
          <Text fw={600} className="gua-section-title">
            公式块
          </Text>
          <Group gap="xs">
            <Button
              size="xs"
              variant="default"
              onClick={(e) => {
                e.stopPropagation();
                setFormulaOpen(true);
              }}
            >
              放大
            </Button>
          </Group>
        </Group>
        <div
          ref={formulaRef}
          className="gua-stream-body gua-stream-formula gua-formula-fit"
        >
          <MarkdownStream content={formulaMarkdown} className="gua-stream-body-inner" />
        </div>
      </Paper>

      {formulaParams && formulaParams.length > 0 ? (
        <Paper radius="md" p="xl" className="gua-panel gua-panel-soft gua-stream-panel">
          <Group justify="space-between" align="center" className="gua-stream-header">
            <Text fw={600} className="gua-section-title">
              参数块
            </Text>
          </Group>
          <div className="gua-param-table">
            <div className="gua-param-head">
              <Text fz="xs" className="gua-param-head-cell">
                中文释义
              </Text>
              <Text fz="xs" className="gua-param-head-cell">
                符号
              </Text>
              <Text fz="xs" className="gua-param-head-cell">
                值
              </Text>
            </div>
            {formulaParams.map((item) => (
              <div key={item.key} className="gua-param-row">
                <Text className="gua-param-meaning">{item.desc}</Text>
                <div className="gua-param-math">
                  <MarkdownStream content={`$${item.latex}$`} />
                </div>
                <div className="gua-param-math gua-param-math-value">
                  <MarkdownStream content={`$${item.value}$`} />
                </div>
              </div>
            ))}
          </div>
        </Paper>
      ) : null}

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <Paper radius="md" p="xl" className="gua-panel gua-panel-soft gua-stream-panel gua-panel-traditional">
          <Group justify="space-between" align="center" className="gua-stream-header">
            <Text fw={600} className="gua-section-title">
              传统块
            </Text>
            <Button size="xs" variant={lunarAuto ? "filled" : "default"} onClick={() => toggleAuto(lunarAuto, setLunarAuto, lunarRef, lunarProgrammatic)}>
              {lunarAuto ? "滚屏开" : "滚屏关"}
            </Button>
          </Group>
          <div
            ref={lunarRef}
            className="gua-stream-body gua-scroll-body"
            onScroll={(e) => handleUserScroll(e.currentTarget, lunarAuto, setLunarAuto, lunarProgrammatic)}
          >
            <MarkdownStream content={lunarMarkdown} className="gua-stream-body-inner" />
          </div>
        </Paper>

        <Paper radius="md" p="xl" className="gua-panel gua-panel-soft gua-stream-panel gua-panel-modern">
          <Group justify="space-between" align="center" className="gua-stream-header">
            <Text fw={600} className="gua-section-title">
              现代块
            </Text>
            <Button size="xs" variant={scienceAuto ? "filled" : "default"} onClick={() => toggleAuto(scienceAuto, setScienceAuto, scienceRef, scienceProgrammatic)}>
              {scienceAuto ? "滚屏开" : "滚屏关"}
            </Button>
          </Group>
          <div
            ref={scienceRef}
            className="gua-stream-body gua-scroll-body"
            onScroll={(e) => handleUserScroll(e.currentTarget, scienceAuto, setScienceAuto, scienceProgrammatic)}
          >
            <MarkdownStream content={scienceMarkdown} className="gua-stream-body-inner" />
          </div>
        </Paper>
      </SimpleGrid>

      <Modal opened={formulaOpen} onClose={() => setFormulaOpen(false)} size="calc(100vw - 96px)" centered>
        <div ref={formulaModalRef} className="gua-formula-modal gua-formula-fit">
          <MarkdownStream content={formulaMarkdown} className="gua-stream-body-inner gua-stream-formula" />
        </div>
      </Modal>
    </Stack>
  );
}

function handleUserScroll(
  node: HTMLDivElement,
  enabled: boolean,
  setEnabled: (value: boolean) => void,
  programmaticRef: React.MutableRefObject<boolean>,
) {
  if (programmaticRef.current) {
    programmaticRef.current = false;
    return;
  }
  if (enabled && !isNearBottom(node, 48)) setEnabled(false);
}

function scrollToBottom(
  ref: React.MutableRefObject<HTMLDivElement | null>,
  programmaticRef: React.MutableRefObject<boolean>,
) {
  if (!ref.current) return;
  programmaticRef.current = true;
  ref.current.scrollTop = ref.current.scrollHeight;
}

function isNearBottom(node: HTMLDivElement, thresholdPx: number) {
  const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
  return distance <= thresholdPx;
}

function toggleAuto(
  current: boolean,
  setEnabled: (value: boolean) => void,
  ref: React.MutableRefObject<HTMLDivElement | null>,
  programmaticRef: React.MutableRefObject<boolean>,
) {
  if (current) {
    setEnabled(false);
    return;
  }
  setEnabled(true);
  scrollToBottom(ref, programmaticRef);
}

function scaleFormula(container: HTMLDivElement | null) {
  if (!container) return;
  const display = container.querySelector(".katex-display") as HTMLElement | null;
  if (!display) return;
  display.style.transform = "";
  display.style.transformOrigin = "left top";
  const availableW = container.clientWidth;
  const availableH = container.clientHeight;
  const width = display.scrollWidth;
  const height = display.scrollHeight;
  if (availableW <= 0 || width <= 0) return;
  const scaleW = availableW / width;
  const scaleH = availableH > 0 && height > 0 ? availableH / height : 1;
  const scale = Math.min(1, scaleW, scaleH);
  display.style.transform = `scale(${scale})`;
  display.style.width = `${width}px`;
}
