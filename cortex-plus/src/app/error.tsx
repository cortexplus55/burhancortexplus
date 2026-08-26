"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { OriginMarketingPage } from "@/components/marketing/origin-marketing";
import { OriginButton } from "@/components/marketing/origin-form";
import "@/styles/origin-marketing.css";

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
    <OriginMarketingPage title="Bir şeyler ters gitti">
      <div className="mx-auto max-w-md px-4 pb-16 text-center">
        <p className="mk-prose">
          İşlem tamamlanamadı. Tekrar denemek istersen aşağıdaki düğmeyi kullan.
          Sorun sürerse{" "}
          <Link href="/iletisim" className="mk-link-accent">
            destek
          </Link>{" "}
          ekibimize yazabilirsin.
        </p>
        <OriginButton type="button" onClick={reset} className="mt-8 max-w-xs mx-auto">
          Tekrar dene
        </OriginButton>
        <Link href="/" className="mk-btn-outline mt-3 inline-flex px-8 py-3 text-sm">
          Ana sayfa
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </OriginMarketingPage>
  );
}
