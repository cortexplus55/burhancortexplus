import Link from "next/link";
import { Mail } from "lucide-react";
import { CortexMark } from "@/components/brand/cortex-mark";
import { Icon3D } from "@/components/ui/icon-3d";
import "@/styles/not-found.css";

/**
 * 404 (17 Ekim 2026, tasarım 8. adım). Astra'nınki sade ve şakacı: üstte logo, ortada bir
 * çizim ("4×0≠4"), başlık, tek düğme, destek adresi. Bizimki kendi şakamız: sıfırın yerinde
 * beyin (cortex = beyin kabuğu), rakamlar karşılamadaki piksel yazıyla. Oturumlu ya da
 * oturumsuz herkese aynı; pazarlama menüsü oturumlu öğrenciye "Giriş yap" gösteriyordu.
 */
export default function NotFound() {
  return (
    <main className="cp-404">
      <Link href="/" className="cp-404-logo" aria-label="Cortex Plus">
        <CortexMark size={22} />
        <span>cortex</span>
      </Link>
      <p className="cp-404-art" aria-label="404">
        <span aria-hidden>4</span>
        <Icon3D name="avatar" size={112} className="cp-404-zero" />
        <span aria-hidden>4</span>
      </p>
      <h1 className="cp-404-title">Sayfa bulunamadı</h1>
      <p className="cp-404-text">Adres yanlış yazılmış ya da sayfa taşınmış olabilir.</p>
      <Link href="/" className="cp-404-go">
        Ana sayfaya dön
      </Link>
      <p className="cp-404-help">
        <Mail className="h-4 w-4" aria-hidden />
        cortexplus@cortexplus.app
      </p>
    </main>
  );
}
