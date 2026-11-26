import { Sparkles } from "lucide-react";
import { AI_NOTICE, type AiNoticeKind } from "@/lib/legal/ai-notice";
import "@/styles/ai-notice.css";

/** Ders ve öğretmen ekranındaki yapay zekâ notu (26 Kasım 2026). Metin `ai-notice.ts`'te. */
export function AiNotice({ kind, className }: { kind: AiNoticeKind; className?: string }) {
  return (
    <p className={className ? `cx-ai-notice ${className}` : "cx-ai-notice"} data-testid={`ai-notice-${kind}`}>
      <Sparkles className="cx-ai-notice-icon" aria-hidden focusable={false} />
      <span>{AI_NOTICE[kind]}</span>
    </p>
  );
}
