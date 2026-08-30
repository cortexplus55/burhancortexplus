import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function AppPageSkeleton({
  variant = "default",
}: {
  variant?: "default" | "dashboard" | "study-plan";
}) {
  if (variant === "dashboard") {
    return (
      <div className="space-y-6" aria-busy aria-label="Yükleniyor">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48 bg-white/10" />
          <Skeleton className="h-4 w-64 bg-white/10" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="astra-pay-card h-24 bg-white/5" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="astra-pay-card h-40 bg-white/5" />
          <Skeleton className="astra-pay-card h-40 bg-white/5" />
        </div>
      </div>
    );
  }

  if (variant === "study-plan") {
    return (
      <div className="ap-plan-page space-y-4" aria-busy aria-label="Yükleniyor">
        <Skeleton className="h-8 w-40 bg-white/10" />
        <Skeleton className="h-16 w-72 max-w-full bg-white/10" />
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-20 bg-white/5" />
          <Skeleton className="h-20 bg-white/5" />
          <Skeleton className="h-20 bg-white/5" />
        </div>
        <Skeleton className="h-36 bg-white/5" />
        <Skeleton className="h-48 bg-white/5" />
      </div>
    );
  }

  return (
    <div className={cn("space-y-4")} aria-busy aria-label="Yükleniyor">
      <Skeleton className="h-6 w-40 bg-white/10" />
      <Skeleton className="astra-pay-card h-32 bg-white/5" />
      <Skeleton className="astra-pay-card h-32 bg-white/5" />
    </div>
  );
}
