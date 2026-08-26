import Link from "next/link";
import { OriginMarketingPage } from "@/components/marketing/origin-marketing";
import { OriginFeatureGrid } from "@/components/layout/marketing-page";
import "@/styles/origin-marketing.css";

export const metadata = {
  title: "Özellikler",
  description:
    "AI öğretmen, doküman tabanlı çalışma, quiz, flashcard, deneme sınavı ve çalışma planı.",
};

export default function OzelliklerPage() {
  return (
    <OriginMarketingPage title="Özellikler">
      <div className="mx-auto max-w-[var(--page-max-width)] px-4 pb-16">
        <p className="mb-8 max-w-2xl text-[var(--mk-muted)]">
          Cortex Plus, çalışmanı tek bir akışta toplayan yapay zekâ destekli öğrenme
          platformudur.
        </p>
        <OriginFeatureGrid />
        <div className="mt-10">
          <Link href="/kayit" className="mk-btn-primary inline-flex px-8 py-3 text-sm">
            Ücretsiz dene
          </Link>
        </div>
      </div>
    </OriginMarketingPage>
  );
}
