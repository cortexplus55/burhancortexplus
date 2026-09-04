export function PremiumPlanHero({
  eyebrow = "Plus",
  title = "Daha iyi notlar al ve 2 kat hızlı öğren",
  description = "Tüm özellikler açık; AI işlemleri kredi ve ücretsiz hak harcar. Plus aboneliği gelişmiş model ve yüksek kredi paketi sunar.",
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
      <p className="mt-2 text-sm leading-relaxed text-[var(--astra-muted)]">
        {description}
      </p>
    </header>
  );
}
