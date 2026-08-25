import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-semibold">Sayfa bulunamadı</h1>
      <p className="text-sm text-muted-foreground">
        Aradığın sayfa taşınmış veya hiç var olmamış olabilir.
      </p>
      <Link href="/" className={cn(buttonVariants())}>
        Ana sayfaya dön
      </Link>
    </div>
  );
}
