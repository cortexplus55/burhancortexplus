import { notFound } from "next/navigation";
import { DuelPlay } from "@/components/duel/duel-play";
import "@/styles/duel.css";

export const dynamic = "force-dynamic";

/**
 * Uçtan uca fikstür (26 Kasım 2026, mobil 1. adım): düello sıralamasında "Bildir" ve "Engelle", veritabanısız. Bildirim
 * ve engel uçları testte `page.route` ile karşılanır. `?oturum=1` oturumlu öğrenciyi taklit eder.
 */
export default async function E2eDuelloPage({ searchParams }: { searchParams: Promise<{ oturum?: string }> }) {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  const signedIn = (await searchParams).oturum === "1";
  return (
    <main className="cp-duel-page">
      <DuelPlay
        code="ornek1"
        title="Örnek düello"
        topic="Birinci konu"
        creatorName="Ece"
        questions={[]}
        initialBoard={[
          { runId: "11111111-1111-4111-8111-111111111111", name: "Ben", score: 640, correct: 6, own: true },
          { runId: "22222222-2222-4222-8222-222222222222", name: "Uzun adlı bir oyuncu adı burada", score: 610, correct: 6, own: false },
          { runId: "33333333-3333-4333-8333-333333333333", name: "Oyuncu", score: 420, correct: 4, own: false },
        ]}
        signedIn={signedIn}
        countdownSeconds={0}
      />
    </main>
  );
}
