"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatTryWhole } from "@/lib/format";
import {
  storeManageUrl,
  storeName,
  storePeriodUnit,
  storePeriodWord,
  storeRenewalTerms,
  type StorePlanOffer,
} from "@/lib/billing/store-products";
import {
  STORE_BILLING_CLOSED_NOTE,
  STORE_BILLING_LIVE,
  restoreAccountPurchases,
  restoreMessage,
} from "@/lib/billing/store-billing";
import type { NativePlatform } from "@/lib/platform/native-ua";
import { ExternalAnchor } from "@/components/ui/external-anchor";
import "@/styles/native-subscription.css";

/**
 * Mobil uygulamanın abonelik ekranı (26 Kasım 2026, mağaza uyumluluğu). Uygulamada `/pay` bunu çizer; PayTR, veli ödeme
 * bağlantısı, kampanya kodu ve web fiyat karşılaştırması burada yoktur (App Store 3.1.1, Google Play ödeme politikası).
 * Ekranda zorunlu olanlar: planın adı, dönemi ve fiyatı, otomatik yenileme ve 24 saat kuralı, mağazadan iptal yolu,
 * "Satın Alımları Geri Yükle", Gizlilik Politikası ve Kullanım Şartları bağlantıları.
 */
export function NativeSubscriptionScreen({
  platform,
  offers,
  currentPlan,
  founder = false,
}: {
  platform: NativePlatform;
  offers: StorePlanOffer[];
  /** Hesabın bugünkü planı ("Plus", "Sigma"), ücretsizse null. */
  currentPlan: string | null;
  founder?: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(offers.find((offer) => offer.slug === "plus-aylik")?.slug ?? offers[0]?.slug ?? "");
  const [restoring, startRestore] = useTransition();
  const store = storeName(platform);
  const chosen = offers.find((offer) => offer.slug === selected) ?? null;

  function restore() {
    startRestore(async () => {
      const outcome = await restoreAccountPurchases();
      const message = restoreMessage(outcome);
      if (outcome.kind === "failed") toast.error(message);
      else toast.success(message);
      router.refresh();
    });
  }

  return (
    <section className="cx-store" aria-labelledby="cx-store-title">
      <header className="cx-store-head">
        <h1 id="cx-store-title">Abonelik</h1>
        <p className="cx-store-current" data-testid="store-current-plan">
          {founder
            ? "Kurucu hesabında bütün özellikler açık; ödeme gerekmez."
            : currentPlan
              ? `Şu anki planın: ${currentPlan}`
              : "Şu anki planın: Ücretsiz"}
        </p>
      </header>

      {offers.length ? (
        <div className="cx-store-plans" role="radiogroup" aria-label="Abonelik planları">
          {offers.map((offer) => {
            const active = offer.slug === selected;
            return (
              <button
                key={offer.slug}
                type="button"
                role="radio"
                aria-checked={active}
                className="cx-store-plan"
                data-active={active || undefined}
                onClick={() => setSelected(offer.slug)}
              >
                <span className="cx-store-plan-main">
                  <span className="cx-store-plan-name">{offer.label}</span>
                  <span className="cx-store-plan-period">
                    {offer.periodDays} gün · {storePeriodWord(offer.period)} otomatik yenilenir
                  </span>
                </span>
                <span className="cx-store-plan-price">
                  {formatTryWhole(offer.priceKurus)}
                  <span className="cx-store-plan-unit"> / {storePeriodUnit(offer.period)}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="cx-store-note">Planlar şu an okunamadı. Sayfayı yenileyip yeniden dene.</p>
      )}

      <div className="cx-store-actions">
        <button
          type="button"
          className="cx-store-buy"
          disabled={!STORE_BILLING_LIVE || !chosen || founder}
          aria-describedby={STORE_BILLING_LIVE ? undefined : "cx-store-closed"}
        >
          {chosen
            ? `${chosen.label} · ${formatTryWhole(chosen.priceKurus)} / ${storePeriodUnit(chosen.period)} ile başla`
            : "Plan seç"}
        </button>
        {STORE_BILLING_LIVE ? null : (
          <p id="cx-store-closed" className="cx-store-note">
            {STORE_BILLING_CLOSED_NOTE}
          </p>
        )}
        <button type="button" className="cx-store-restore" onClick={restore} disabled={restoring}>
          {restoring ? "Kontrol ediliyor…" : "Satın Alımları Geri Yükle"}
        </button>
      </div>

      <div className="cx-store-terms" aria-label="Abonelik koşulları">
        <h2>Otomatik yenileme ve iptal</h2>
        <ul>
          {storeRenewalTerms(platform).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <ExternalAnchor className="cx-store-manage" href={storeManageUrl(platform)}>
          {store} aboneliklerini yönet
        </ExternalAnchor>
      </div>

      <nav className="cx-store-legal" aria-label="Hukuki metinler">
        <Link href="/gizlilik">Gizlilik Politikası</Link>
        <Link href="/kullanim-kosullari">Kullanım Şartları</Link>
      </nav>
    </section>
  );
}
