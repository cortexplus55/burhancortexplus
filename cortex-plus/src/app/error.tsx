"use client";

import Link from "next/link";
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { StatusScreen } from "@/components/brand/status-screen";

/**
 * Sayfa içi hata ekranı (Faz 12A metinleri). Kök şablonun kendisi çöktüğünde global-error.tsx devreye giriyor; adları
 * karışmasın diye bu dosyanın bileşeni "RouteError" adını taşıyor. Teknik ayrıntı gösterilmez; yalnız kısa hata kodu.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Yerelde konsola, yayında Sentry'ye. Sentry adresi girilmemişse bu çağrı sessizce hiçbir şey yapmıyor.
    if (process.env.NODE_ENV !== "production") {
      console.error(error);
    } else {
      Sentry.captureException(error);
    }
  }, [error]);

  return (
    <StatusScreen
      title="Bir şeyler ters gitti"
      text="Sorun bizde. Sayfayı yenilemeyi dene; sürerse biraz sonra tekrar bak."
      digest={error.digest}
      primary={
        <button type="button" className="cx-status-brand" onClick={reset}>
          Yeniden dene
        </button>
      }
      secondary={
        <Link href="/" className="cx-status-weak">
          Ana sayfaya dön
        </Link>
      }
    />
  );
}
