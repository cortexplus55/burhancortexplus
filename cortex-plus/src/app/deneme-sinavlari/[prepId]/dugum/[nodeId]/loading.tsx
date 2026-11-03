"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { markNodeClickIfMissing } from "@/lib/learning/node-open-click";

/**
 * Anında ilk ekran (3 Kasım 2026): yoldan bir adıma tıklanınca oturum kabuğu sunucu çizimini beklemeden çizilir
 * (önceden yüklenen rota sınırı). Sayfa gelince ders/test yerine geçer. Yanıltıcı "Kaldığın yer" yazısı yok.
 */
export default function ExamNodeLoading() {
  useEffect(() => markNodeClickIfMissing(), []);
  return (
    <div className="cp-sor-root cp-sor-root--session">
      <main className="cp-sor-main">
        <div className="cp-exam-page flex min-h-[50vh] items-center justify-center" aria-busy="true">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--c-action)]" aria-label="Yükleniyor" />
        </div>
      </main>
    </div>
  );
}
