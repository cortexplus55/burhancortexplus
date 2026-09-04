"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Kök şablonun kendisi çöktüğünde görünen ekran.
 *
 * `error.tsx` sayfa içi hataları yakalıyor; bu dosya ise şablonun kendisi
 * patladığında devreye giriyor. O anda uygulamanın hiçbir parçası ayakta
 * olmadığı için kendi `html` ve `body` etiketlerini yazmak zorunda — Tailwind
 * sınıfları bile yüklenmemiş olabileceğinden renkler doğrudan burada.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="tr">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#050505",
          color: "#fafafa",
          fontFamily: "system-ui, sans-serif",
          padding: "1.5rem",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: "28rem" }}>
          <p
            style={{
              margin: 0,
              fontSize: "0.75rem",
              fontWeight: 600,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "#e8a838",
            }}
          >
            Cortex Plus
          </p>
          <h1 style={{ marginTop: "1rem", fontSize: "1.25rem" }}>
            Uygulama açılamadı
          </h1>
          <p style={{ marginTop: "0.75rem", fontSize: "0.875rem", color: "#a3a3a3" }}>
            Beklenmedik bir sorun oluştu. Sayfayı yenilemeyi deneyebilirsin.
          </p>
          {error.digest ? (
            <p
              style={{
                marginTop: "0.5rem",
                fontFamily: "ui-monospace, monospace",
                fontSize: "0.625rem",
                color: "#737373",
              }}
            >
              Ref: {error.digest}
            </p>
          ) : null}
          {/* Bilerek düz bağlantı: bu ekran şablonun kendisi çöktüğünde
              görünüyor, yani Next.js yönlendiricisi ayakta olmayabilir.
              Sayfayı baştan yüklemek tek güvenilir çıkış. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            style={{
              display: "inline-block",
              marginTop: "1.5rem",
              borderRadius: "999px",
              background: "#e8a838",
              color: "#000",
              padding: "0.625rem 1.5rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Ana sayfa
          </a>
        </div>
      </body>
    </html>
  );
}
