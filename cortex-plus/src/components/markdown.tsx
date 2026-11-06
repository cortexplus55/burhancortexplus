"use client";

import "katex/dist/katex.min.css";
import { useMemo } from "react";
import { hasMath, plainMath } from "@/lib/learning/math-split";
import { renderMarkdownWith } from "@/lib/markdown-core";
import { useMathRenderer } from "@/components/learning/use-math-renderer";
import { cn } from "@/lib/utils";

const plainRender = (tex: string) => plainMath(tex);

export function Markdown({
  content,
  variant = "default",
}: {
  content: string;
  variant?: "default" | "parity";
}) {
  // KaTeX yalnız cevapta formül varsa yüklenir (6 Kasım 2026); o ana kadar formül düz metindir.
  const renderer = useMathRenderer(hasMath(content));
  const html = useMemo(
    () => renderMarkdownWith(content, renderer?.renderMath ?? plainRender),
    [content, renderer],
  );

  return (
    <div
      className={cn(
        "space-y-2 text-sm leading-relaxed [&_code]:font-mono",
        variant === "parity" &&
          "text-[var(--cs-text)] [&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-amber-100/90 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-[var(--cs-border)] [&_pre]:bg-black/35 [&_pre]:p-3 [&_pre]:text-xs [&_strong]:text-[var(--cs-text)]",
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
