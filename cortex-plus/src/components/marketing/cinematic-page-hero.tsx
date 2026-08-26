import { cn } from "@/lib/utils";

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
    <section
      className={cn(
        "relative overflow-hidden px-4 py-14 md:py-20",
        className,
      )}
    >
      <div className="mk-page-hero-bg" aria-hidden />
      <div
        className="relative z-10 mx-auto max-w-3xl text-center"
        data-cinematic-reveal
      >
        <h1 className="mk-display text-4xl leading-tight md:text-5xl lg:text-6xl">
          {title}
        </h1>
        {description ? (
          <p className="mx-auto mt-4 max-w-2xl text-base text-[var(--mk-muted)] md:text-lg">
            {description}
          </p>
        ) : null}
        {children ? <div className="mt-8">{children}</div> : null}
      </div>
    </section>
  );
}
