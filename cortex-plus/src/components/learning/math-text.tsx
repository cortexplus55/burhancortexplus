"use client";

import "katex/dist/katex.min.css";
import { useMemo } from "react";
import { hasMath, plainMath, splitMath } from "@/lib/learning/math-split";
import { useMathRenderer } from "@/components/learning/use-math-renderer";

/**
 * Metin içindeki $...$ / $$...$$ / \ce{...} parçalarını KaTeX ile çizer.
 * Hatalı LaTeX sayfayı çökertmez; düz metin yedeği gösterir.
 * KaTeX yalnız metinde formül varsa yüklenir (6 Kasım 2026, `useMathRenderer`); o ana kadar formül düz metindir.
 */
export function MathText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const needsMath = Boolean(text) && (hasMath(text) || /\\ce\{/.test(text));
  const renderer = useMathRenderer(needsMath);
  const html = useMemo(() => {
    if (!text) return "";
    if (!needsMath) {
      return escapeText(text);
    }
    const renderMath = renderer?.renderMath ?? ((tex: string) => plainMath(tex));
    // Düz metinde çıplak \ce{...} varsa satır içi formüle sar.
    const normalized = text.replace(/\\ce\{([^}]+)\}/g, (_all, inner: string) => {
      if (text.includes(`$\\ce{${inner}}$`) || text.includes(`$$\\ce{${inner}}$$`)) {
        return `\\ce{${inner}}`;
      }
      return `$\\ce{${inner}}$`;
    });
    return splitMath(normalized)
      .map((segment) => {
        if (segment.type === "text") return escapeText(segment.value);
        try {
          return renderMath(segment.value, segment.display);
        } catch {
          return escapeText(segment.value);
        }
      })
      .join("");
  }, [text, needsMath, renderer]);

  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
