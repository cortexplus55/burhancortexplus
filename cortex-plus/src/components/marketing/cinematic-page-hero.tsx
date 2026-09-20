"use client";

import { motion, useReducedMotion } from "framer-motion";
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
  const reduce = useReducedMotion();
  return (
    <section className={cn("mk-lux-page-hero", className)}>
      <div className="mk-lux-page-hero-ambient" aria-hidden>
        <span />
      </div>
      <motion.div
        className="mk-lux-page-hero-inner"
        initial={reduce ? false : { opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] as const }}
      >
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
        {children ? <div className="mk-lux-page-hero-actions">{children}</div> : null}
      </motion.div>
    </section>
  );
}
