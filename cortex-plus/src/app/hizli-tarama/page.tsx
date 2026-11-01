import type { Metadata } from "next";
import { buildSetupTree } from "@/lib/curriculum/official-setup";
import { createClient } from "@/lib/supabase/server";
import { GuestQuickScan } from "@/components/level-check/guest-quick-scan";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Akıllı Hızlı Tarama · ön izleme" };

/** Herkese açık misafir ön izlemesi (3 soru, kayıt yok). `?sinav=yks|lgs&alan=tyt&ders=tyt-tarih`. */
export default async function HizliTaramaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const exam = sp.sinav === "lgs" ? "lgs" : "yks";
  const tree = buildSetupTree(exam);
  const part = exam === "yks" && (sp.alan ?? "tyt") === "tyt" ? "TYT" : null;
  const subjects = tree.subjects
    .filter((s) => (part ? s.part === part : true))
    .map((s) => ({ key: s.key, label: s.label, unitIds: s.units.map((u) => u.id) }));
  const next = `/deneme-sinavlari/resmi/kurulum?sinav=${exam}${part ? "&alan=tyt" : ""}`;
  // Oturum açık kullanıcı ön izleme yerine tam taramaya (kurulum, kayıtlı + sonuç ekranlı) yönlendirilir.
  const { data } = await (await createClient()).auth.getUser().catch(() => ({ data: { user: null } }));
  return <GuestQuickScan subjects={subjects} initialKey={sp.ders ?? null} nextHref={next} signedIn={Boolean(data.user)} />;
}
