import { cn } from "@/lib/utils";

/**
 * Alt pazarlama sayfası hero — tek net başlık, sakin boşluk.
 * Orb/film şovu yok; Astra brief.
 */
export function CinematicPageHero({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mk-astra-page-hero", className)}>
      <div className="mk-astra-page-hero-inner" data-cinematic-reveal>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
        {children ? <div className="mk-astra-page-hero-actions">{children}</div> : null}
      </div>
    </section>
  );
}
