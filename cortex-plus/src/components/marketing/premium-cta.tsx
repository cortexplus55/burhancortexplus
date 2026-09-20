"use client";

import Link from "next/link";
import {
  useCallback,
  useRef,
  type MouseEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/** Premium birincil CTA — shine + hafif manyetik hover. */
export function PremiumPrimaryCta({
  href,
  children,
  className,
  icon,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  const ref = useRef<HTMLAnchorElement>(null);

  const onMove = useCallback((e: MouseEvent<HTMLAnchorElement>) => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `translate(${x * 6}px, ${y * 4}px)`;
  }, []);

  const onLeave = useCallback(() => {
    if (ref.current) ref.current.style.transform = "";
  }, []);

  return (
    <Link
      ref={ref}
      href={href}
      className={cn("mk-premium-btn mk-premium-btn--primary", className)}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      <span className="mk-premium-btn-shine" aria-hidden />
      {icon ? <span className="mk-premium-btn-icon">{icon}</span> : null}
      <span className="mk-premium-btn-label">{children}</span>
    </Link>
  );
}

export function PremiumGhostCta({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn("mk-premium-btn mk-premium-btn--ghost", className)}
    >
      {children}
    </Link>
  );
}
