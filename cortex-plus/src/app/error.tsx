"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.error(error);
    }
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-semibold">Bir şeyler ters gitti</h1>
      <p className="text-sm text-muted-foreground">
        İşlem tamamlanamadı. Tekrar denemek istersen aşağıdaki düğmeyi kullan.
        Sorun sürerse destek ekibimize yazabilirsin.
      </p>
      <Button type="button" onClick={reset}>
        Tekrar dene
      </Button>
    </div>
  );
}
