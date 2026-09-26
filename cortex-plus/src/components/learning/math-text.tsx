"use client";

import { useMemo } from "react";
import { hasMath, renderMath, splitMath } from "@/lib/learning/math-text";

/**
 * Metin içindeki $...$ / $$...$$ / \ce{...} parçalarını KaTeX ile çizer.
 * Hatalı LaTeX sayfayı çökertmez; düz metin yedeği gösterir.
 */
export function MathText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const html = useMemo(() => {
    if (!text) return "";
    if (!hasMath(text) && !/\\ce\{/.test(text)) {
      return escapeText(text);
    }
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
  }, [text]);

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
