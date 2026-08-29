export function PremiumPlanHero({
  eyebrow = "Plus",
  title = "Daha iyi notlar al ve 2 kat hızlı öğren",
  description = "Tüm özellikler açık; AI işlemleri kredi ve ücretsiz hak harcar. Plus aboneliği gelişmiş model ve yüksek kredi paketi sunar.",
  align = "center",
}: {
  eyebrow?: string;
  title?: string;
  description?: string;
  align?: "center" | "start";
}) {
  return (
    <header className={align === "center" ? "text-center" : "text-left"}>
      <p className="cortex-premium-section-eyebrow">{eyebrow}</p>
      <h1 className="cortex-premium-section-title mt-2">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--astra-muted)]">
        {description}
      </p>
    </header>
  );
}
