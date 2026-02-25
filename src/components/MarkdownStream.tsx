"use client";

import { useMemo } from "react";
import MarkdownRender from "markstream-react";

type MarkdownStreamProps = {
  content: string;
  className?: string;
};

export function MarkdownStream({ content, className }: MarkdownStreamProps) {
  const merged = useMemo(() => content ?? "", [content]);
  return (
    <div className={className}>
      <MarkdownRender content={merged} />
    </div>
  );
}
