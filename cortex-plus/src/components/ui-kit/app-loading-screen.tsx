import { AppPageSkeleton } from "@/components/ui-kit/app-page-skeleton";

/**
 * Sayfa yüklenirken görünen iskelet.
 *
 * Bilerek eşzamanlı ve hiçbir veri okumuyor — buraya `await` giren bir şey
 * konulmamalı.
 *
 * Sebebi: `loading.tsx` dosyaları React'in Suspense yedeği oluyor ve yedeğin
 * anında çizilmesi gerekiyor. Beş sayfada yedek olarak `AppShell` çiziliyordu;
 * o da kendi içinde oturum ve profil sorgusu yapan `async` bir bileşen. Yedek
 * de beklemeye girince React onu içerikle değiştiremiyor: /dashboard,
 * /dokumanlar, /flashcardlar ve /quizler'de iskelet ile asıl sayfa aynı anda
 * ekranda kalıyordu (sayfada iki tane h1 vardı), /ilerleme'de ise asıl sayfa
 * hiç görünmüyordu — öğrencinin ilerleme ekranı yayında tümüyle boştu.
 *
 * Kabuk bu sayfalarda düzenden değil sayfanın kendisinden geliyor, bu yüzden
 * yükleme anında menü yok. Koyu zemin o boşluğu beyaz bir parlamaya
 * çevirmemek için burada elle veriliyor.
 */
export function AppLoadingScreen({
  title,
  variant = "default",
}: {
  title: string;
  variant?: "default" | "dashboard";
}) {
  return (
    <div className="min-h-dvh bg-[#0f0f0f] text-white">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-6 h-8 w-40 rounded-md bg-white/10" aria-hidden />
        <span className="sr-only">{title} yükleniyor</span>
        <AppPageSkeleton variant={variant} />
      </div>
    </div>
  );
}
