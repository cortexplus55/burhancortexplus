import Link from "next/link";
import { notFound } from "next/navigation";
import { DuelPlay } from "@/components/duel/duel-play";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { publicQuestions, type DuelQuestion } from "@/lib/learning/duel";
import { isBotLevel } from "@/lib/learning/duel-bot";
import { duelSignupHref } from "@/lib/learning/duel-share";
import { appOrigin } from "@/lib/app-url";
import "@/styles/duel.css";

export const metadata = {
  title: "Düello",
  description: "Aynı sorularda arkadaşınla yarış.",
};
export const dynamic = "force-dynamic";

/**
 * Paylaşılan düello — hesapsız açılıyor (Astra: "hesap gerekmiyor").
 * Sayfa servis anahtarıyla okur ama tarayıcıya yalnızca soru metni ve
 * şıklar gider; doğru cevaplar sunucuda kalır.
 */
export default async function DuelPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ bot?: string }>;
}) {
  // Kod küçük harfle üretiliyor; elle büyük harfle yazılan adres de aynı düelloyu açsın.
  const code = (await params).code.toLowerCase();
  if (!/^[a-z0-9]{6,16}$/.test(code)) notFound();
  // Hazırlıktan "AI rakiple hemen başla" (29 Ekim 2026): bot düzeyi seçili açılır.
  const botParam = (await searchParams).bot;
  const initialBot = isBotLevel(botParam) ? botParam : null;

  const service = createServiceClient();
  const { data: duel } = await service
    .from("prep_duels")
    .select("id, title, topic_label, questions, creator_id")
    .eq("share_code", code)
    .maybeSingle();
  if (!duel) notFound();

  const [{ data: creator }, { data: board }] = await Promise.all([
    service.from("profiles").select("full_name, referral_code").eq("id", duel.creator_id).maybeSingle(),
    service
      .from("prep_duel_runs")
      .select("display_name, score, correct, created_at")
      .eq("duel_id", duel.id)
      .order("score", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(10),
  ]);

  let signedIn = false;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    signedIn = Boolean(data.user);
  } catch {
    signedIn = false;
  }

  const creatorName = String(creator?.full_name ?? "").trim().split(/\s+/)[0] || "Bir arkadaşın";
  const questions = (Array.isArray(duel.questions) ? duel.questions : []) as DuelQuestion[];

  return (
    <main className="cp-duel-page">
      <header className="cp-duel-top">
        <Link href="/" className="cp-duel-logo">
          cortex<span>plus</span>
        </Link>
      </header>
      <DuelPlay
        code={code}
        title={duel.title as string}
        topic={(duel.topic_label as string | null) ?? null}
        creatorName={creatorName}
        questions={publicQuestions(questions)}
        initialBoard={(board ?? []).map((row) => ({
          name: row.display_name as string,
          score: row.score as number,
          correct: row.correct as number,
        }))}
        signedIn={signedIn}
        initialBot={initialBot}
        shareUrl={`${appOrigin()}/duello/${code}`}
        signupHref={duelSignupHref((creator as { referral_code?: string | null } | null)?.referral_code)}
      />
    </main>
  );
}
