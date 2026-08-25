"use client";

import { useMemo } from "react";
import { renderMarkdownToHtml } from "@/lib/markdown";

export function Markdown({ content }: { content: string }) {
  const html = useMemo(() => renderMarkdownToHtml(content), [content]);

  return (
    <div
      className="space-y-2 text-sm leading-relaxed [&_code]:font-mono"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
