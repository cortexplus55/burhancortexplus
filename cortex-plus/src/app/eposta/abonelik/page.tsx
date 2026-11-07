import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPage } from "@/components/layout/marketing-page";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribe";
import { UnsubscribeButton } from "./unsubscribe-button";

export const metadata: Metadata = {
  title: "E-posta aboneliği",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const COPY = {
  marketing: {
    title: "Duyuru ve kampanya e-postalarından çık",
    body: "Bu seçimle Cortex Plus'tan duyuru, yeni özellik ve davet kampanyası e-postaları almazsın. Hesabın ve çalışma hatırlatmaların etkilenmez.",
    label: "Evet, bu e-postaları istemiyorum",
    done: "Tamam, artık duyuru ve kampanya e-postası göndermeyeceğiz.",
  },
  reminder: {
    title: "Çalışma hatırlatmalarından çık",
    body: "Bu seçimle sınavına kalan günü ve kaldığın yeri hatırlatan e-postaları almazsın. Uygulamaya girince yolunu yine görürsün.",
    label: "Evet, hatırlatma e-postası istemiyorum",
    done: "Tamam, artık hatırlatma e-postası göndermeyeceğiz.",
  },
} as const;

/**
 * E-postadaki bağlantının açtığı sayfa (7 Kasım 2026). Oturum gerekmez; bağlantı imzalıdır ve hesabı bellidir. GET
 * hiçbir şeyi değiştirmez: çıkış yalnız düğmeye basınca olur (posta önizlemeleri öğrenciyi sessizce çıkarmasın).
 */
export default async function EpostaAbonelikPage({ searchParams }: { searchParams: Promise<{ t?: string | string[] }> }) {
  const raw = (await searchParams).t;
  const token = Array.isArray(raw) ? raw[0] : raw;
  const claims = verifyUnsubscribeToken(token);

  return (
    <MarketingPage
      title={claims ? COPY[claims.category].title : "Bağlantı geçersiz"}
      description={claims ? undefined : "Bu abonelik bağlantısı geçerli değil."}
      variant="legal"
    >
      <div className="mk-card max-w-xl space-y-5 p-6">
        {claims && token ? (
          <>
            <p className="text-sm leading-relaxed text-[var(--mk-muted)]">{COPY[claims.category].body}</p>
            <UnsubscribeButton token={token} label={COPY[claims.category].label} doneText={COPY[claims.category].done} />
          </>
        ) : (
          <p className="text-sm leading-relaxed text-[var(--mk-muted)]">
            Bağlantı eksik ya da bozulmuş olabilir. E-posta tercihlerini{" "}
            <Link href="/ayarlar" className="underline underline-offset-4">
              Ayarlar
            </Link>
            &apos;dan değiştirebilir ya da{" "}
            <Link href="/iletisim" className="underline underline-offset-4">
              bize yazabilirsin
            </Link>
            .
          </p>
        )}
      </div>
    </MarketingPage>
  );
}
