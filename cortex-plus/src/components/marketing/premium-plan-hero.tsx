import { FREE_FIRST_LESSON_SENTENCE, PLUS_ONLY_SENTENCE } from "@/lib/billing/free-tier-copy";

/** 11 Kasım 2026: ücretsizde ne açık, Plus'a ne özel; cümleler tek kaynaktan (`free-tier-copy.ts`). */
const DEFAULT_DESCRIPTION = `${FREE_FIRST_LESSON_SENTENCE} ${PLUS_ONLY_SENTENCE} Plus ayrıca bütün konuları ve geniş aylık hakkı açar; abonelik kendiliğinden yenilenmez.`;

export function PremiumPlanHero({
  eyebrow = "Plus",
  title = "Daha fazla çalış, sınırda kalma",
  description = DEFAULT_DESCRIPTION,
  align = "center",
  headingLevel = "h2",
}: {
  eyebrow?: string;
  title?: string;
  description?: string;
  align?: "center" | "start";
  /**
   * Sayfada tek bir `h1` olmalı. Bu blok `/fiyatlandirma`'da sayfanın kendi
   * başlığının altında bir bölüm; orada `h2`. `/pay`'de ise sayfanın konusu
   * bunun kendisi, orada `h1` geçilir.
   */
  headingLevel?: "h1" | "h2";
}) {
  const Heading = headingLevel;
  return (
    <header className={align === "center" ? "text-center" : "text-left"}>
      <p className="cortex-premium-section-eyebrow">{eyebrow}</p>
      <Heading className="cortex-premium-section-title mt-2">{title}</Heading>
      <p className="mt-2 text-sm leading-relaxed text-[var(--cs-muted)]">
        {description}
      </p>
    </header>
  );
}
