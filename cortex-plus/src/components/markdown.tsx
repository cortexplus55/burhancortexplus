"use client";

import { useMemo } from "react";
import { renderMarkdownToHtml } from "@/lib/markdown";
import { cn } from "@/lib/utils";

export function Markdown({
  content,
  variant = "default",
}: {
  content: string;
  variant?: "default" | "astra";
}) {
  const html = useMemo(() => renderMarkdownToHtml(content), [content]);

  return (
    <div
      className={cn(
        "space-y-2 text-sm leading-relaxed [&_code]:font-mono",
        variant === "astra" &&
          "text-[var(--astra-text)] [&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-amber-100/90 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-[var(--astra-border)] [&_pre]:bg-black/35 [&_pre]:p-3 [&_pre]:text-xs [&_strong]:text-[var(--astra-text)]",
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
