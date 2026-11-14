"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Kök şablonun kendisi çöktüğünde görünen ekran (Faz 12A metinleri).
 *
 * `error.tsx` sayfa içi hataları yakalıyor; bu dosya ise şablonun kendisi patladığında devreye giriyor. O anda
 * uygulamanın hiçbir parçası ayakta olmadığı için kendi `html` ve `body` etiketlerini yazar; stil dosyaları yüklenmemiş
 * olabileceğinden renkler tasarım token'larının değerleriyle burada (sıcak siyah zemin, marka gradyanı; altın yok).
 */
const TOKENS = {
  bg0: "#0b0907",
  bg2: "#1e1813",
  text: "#f7f1e8",
  muted: "#b9ada0",
  brand: "radial-gradient(55% 90% at 100% 50%, #ffffff1f, #fff0 70%), linear-gradient(90deg, #4F46E5, #6366F1)",
} as const;

const button = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "48px",
  padding: "0 24px",
  border: 0,
  borderRadius: "999px",
  fontSize: "16px",
  fontWeight: 600,
  fontFamily: "inherit",
  textDecoration: "none",
  cursor: "pointer",
} as const;

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
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
          background: TOKENS.bg0,
          color: TOKENS.text,
          fontFamily: "Figtree, system-ui, sans-serif",
          padding: "1.5rem",
          textAlign: "center",
        }}
      >
        <main style={{ maxWidth: "28rem" }}>
          <p style={{ margin: 0, fontSize: "18px", fontWeight: 600, letterSpacing: "-0.02em" }}>Cortex Plus</p>
          <h1 style={{ margin: "32px 0 0", fontSize: "28px", lineHeight: 1.1, fontWeight: 600, letterSpacing: "-0.02em" }}>
            Bir şeyler ters gitti
          </h1>
          <p style={{ margin: "12px 0 0", fontSize: "16px", lineHeight: 1.4, color: TOKENS.muted }}>
            Sorun bizde. Sayfayı yenilemeyi dene; sürerse biraz sonra tekrar bak.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "12px", marginTop: "32px" }}>
            <button
              type="button"
              onClick={() => (reset ? reset() : window.location.reload())}
              style={{ ...button, background: TOKENS.brand, color: "#ffffff" }}
            >
              Yeniden dene
            </button>
            {/* Bilerek düz bağlantı: bu ekran şablonun kendisi çöktüğünde görünüyor, Next.js yönlendiricisi ayakta
                olmayabilir. Sayfayı baştan yüklemek tek güvenilir çıkış. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" style={{ ...button, background: TOKENS.bg2, color: TOKENS.muted }}>
              Ana sayfaya dön
            </a>
          </div>
          {error.digest ? (
            <p style={{ margin: "24px 0 0", fontFamily: "ui-monospace, monospace", fontSize: "11px", color: TOKENS.muted }}>
              Hata kodu: {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
