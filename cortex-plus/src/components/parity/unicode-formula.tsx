"use client";

import { Fragment, type ReactNode } from "react";
import { RichBody } from "@/components/parity/lesson-rich-text";
import { splitMath } from "@/lib/learning/math-split";
import { studentSafeText } from "@/lib/learning/student-safe-text";
import { SUB_SCRIPTS, mapScript, texToUnicodeParts, type UnicodeMathPart } from "@/lib/text/unicode-math";

/**
 * Formül satırı, yazı tipinden bağımsız (Faz 5 §1.1, 19 Kasım 2026). Basit formül (`\sqrt[2n]{a^{2n}} = |a|`) sistem
 * yazı tipiyle Unicode olarak çizilir: `²ⁿ√(a²ⁿ) = |a|`. KaTeX'in matematik yazı tipi telefona inmese de değişkenler
 * kaybolmaz. Unicode'a çevrilemeyen formül (matris, çok katlı kesir…) eskisi gibi KaTeX ile (`RichBody`) çizilir;
 * düz metin parçaları da `RichBody`den geçer (vurgu ve terim biçimi aynı).
 */
export function UnicodeFormulaText({ text, topicHint = "" }: { text: string; topicHint?: string }) {
  const safe = studentSafeText(text);
  const segments = splitMath(safe);
  if (!segments.some((segment) => segment.type === "math")) return <RichBody text={safe} topicHint={topicHint} />;
  return (
    <>
      {segments.map((segment, index) => {
        if (segment.type === "text") return <RichBody key={`t-${index}`} text={segment.value} topicHint={topicHint} />;
        const parts = texToUnicodeParts(segment.value);
        if (!parts) {
          const wrapped = segment.display ? `$$${segment.value}$$` : `$${segment.value}$`;
          return <RichBody key={`k-${index}`} text={wrapped} topicHint={topicHint} />;
        }
        return <UnicodeMath key={`u-${index}`} parts={parts} />;
      })}
    </>
  );
}

/** Parçaların okunur hâli (ekran okuyucu ve kopyalama için tek satır). */
export function unicodeMathLabel(parts: readonly UnicodeMathPart[]): string {
  return parts
    .map((part) => (part.kind === "base" ? part.text : (mapScript(part.text, part.kind === "sup" ? undefined : SUB_SCRIPTS) ?? part.text)))
    .join("");
}

function UnicodeMath({ parts }: { parts: readonly UnicodeMathPart[] }) {
  return (
    <span className="cp-uni-math" role="math" aria-label={unicodeMathLabel(parts)} data-unicode-math="">
      {parts.map((part, index) => {
        if (part.kind === "base") return <Fragment key={index}>{italicLetters(part.text)}</Fragment>;
        const mapped = mapScript(part.text, part.kind === "sup" ? undefined : SUB_SCRIPTS);
        if (mapped !== null) {
          return (
            <span key={index} className="cp-uni-script" aria-hidden>
              {mapped}
            </span>
          );
        }
        const Tag = part.kind === "sup" ? "sup" : "sub";
        return (
          <Tag key={index} className="cp-uni-fallback" aria-hidden>
            {italicLetters(part.text)}
          </Tag>
        );
      })}
    </span>
  );
}

/** Değişken harfleri eğik (matematik geleneği); rakam, işaret ve ayraç dik. */
function italicLetters(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let buffer = "";
  let index = 0;
  const flush = () => {
    if (buffer) out.push(<span key={`p-${index++}`}>{buffer}</span>);
    buffer = "";
  };
  for (const char of text) {
    if (/[A-Za-zα-ωΑ-Ω]/u.test(char)) {
      flush();
      out.push(
        <i key={`v-${index++}`} className="cp-uni-var">
          {char}
        </i>,
      );
    } else buffer += char;
  }
  flush();
  return out;
}
