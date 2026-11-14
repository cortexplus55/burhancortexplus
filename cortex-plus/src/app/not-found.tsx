import Link from "next/link";
import { StatusScreen } from "@/components/brand/status-screen";

/**
 * 404 (Faz 12A, 14 Kasım 2026). Sarı "404" ve üç boyutlu çizim kalktı (altın yalnız Plus kimliği); gerçek logo, başlık,
 * tek cümle, tek brand eylem. Oturumlu ya da oturumsuz herkese aynı.
 */
export default function NotFound() {
  return (
    <StatusScreen
      title="Sayfa bulunamadı"
      text="Aradığın sayfa taşınmış ya da silinmiş olabilir."
      primary={
        <Link href="/" className="cx-status-brand">
          Ana sayfaya dön
        </Link>
      }
    />
  );
}
