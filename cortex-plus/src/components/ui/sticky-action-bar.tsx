"use client";

import { cn } from "@/lib/utils";

function StickyActionBar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <>
      <div aria-hidden className="h-[calc(4.5rem+env(safe-area-inset-bottom,0px))]" />
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-[var(--z-bar)] border-t border-[var(--c-border)] bg-bg/95 px-4 pt-3 backdrop-blur-md",
          "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
          className
        )}
      >
        <div className="mx-auto flex w-full max-w-lg gap-3">{children}</div>
      </div>
    </>
  );
}

export { StickyActionBar };
