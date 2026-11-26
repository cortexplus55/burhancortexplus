"use client";

import { useState } from "react";
import { WifiOff } from "lucide-react";
import { triggerHaptic } from "@/lib/platform/native";

/**
 * Bağlantı koptu çubuğu (26 Kasım 2026, mobil uygulama). Ekranın üstünde, güvenli alanın altında; içerik yerinde
 * kalır (yükleme, ders, sohbet bozulmaz). "Tekrar dene" bağlantı döndüyse sayfayı yeniler, dönmediyse kısa bir
 * titreşimle bekler. Bağlantı gelince çubuk kendiliğinden kalkar (`useNetworkStatus`).
 */
export function OfflineBar() {
  const [checking, setChecking] = useState(false);

  async function retry() {
    setChecking(true);
    try {
      // Hafif bir dosya: sunucuya ulaşıldı mı yalnız onu sorar (veritabanına gitmez).
      const response = await fetch(`/manifest.webmanifest?ping=${Date.now()}`, { cache: "no-store" });
      if (response.ok) {
        window.location.reload();
        return;
      }
    } catch {
      /* hâlâ bağlantı yok */
    }
    void triggerHaptic("warning");
    setChecking(false);
  }

  return (
    <div className="cx-offline-bar" role="alert" data-offline-bar>
      <WifiOff className="cx-offline-icon" aria-hidden />
      <span className="cx-offline-text">Bağlantı koptu — tekrar dene</span>
      <button type="button" className="cx-offline-retry" onClick={() => void retry()} disabled={checking}>
        {checking ? "Deneniyor…" : "Tekrar dene"}
      </button>
    </div>
  );
}
