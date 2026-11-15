import { notFound } from "next/navigation";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { createServiceClient } from "@/lib/supabase/server";
import { examPrepHomeHref } from "@/lib/learning/exam-prep-hrefs";
import { formatDayLong } from "@/lib/format";
import { CramSheetView, type CramShare } from "@/components/parity/cram-sheet-view";
import { PlusOnlyPage } from "@/components/parity/plus-only-gate";
import { plusOnlyLocked } from "@/lib/billing/node-free-meter";
import { CRAM_SHEET_NAME, cramShareText, examPrepCramSheetHref } from "@/lib/learning/cram-sheet";
import { createPrepInviteToken, prepInviteUrl } from "@/lib/learning/prep-invite";
import { isAbsoluteHttpUrl } from "@/lib/learning/prep-share";
import { whatsappShareHref } from "@/lib/learning/duel-share";
import { qrDataUri } from "@/lib/qr";
import { loadCramSheet } from "@/lib/learning/cram-sheet-load";

export const metadata = { title: "Sınav sabahı kâğıdı" };
export const dynamic = "force-dynamic";

/**
 * Sınav sabahı kâğıdı (31 Ekim 2026, Paket J3 #14): hazırlığın kayıtlı derslerinden formüller, sınav ipuçları,
 * tuzaklar, hafıza çivileri, "Sınavda sorulur" maddeleri ve öğrencinin en çok yanıldığı noktalar tek sayfada.
 * Model çağrısı yok, kredi düşmez. Yazdır düğmesi tarayıcının penceresini açar ("PDF olarak kaydet" oradan).
 * Bekleme kutusu (Suspense, loading.tsx) yok: bu projede sayfayı boşaltıyor.
 *
 * 11 Kasım 2026 (ürün sahibinin kararı): kâğıt Plus'a özel. Kredi işi olmadığı için kapı burada, sayfada:
 * ücretsiz hesapta kâğıt hiç yüklenmez, yerine yükseltme ekranı açılır (`plusOnlyLocked`: abone, Plus denemesi ve
 * önizlemesi kapalı kurucu açık).
 */
export default async function CramSheetPage({ params }: { params: Promise<{ prepId: string }> }) {
  const { prepId } = await params;
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  const { data: prep } = await supabase
    .from("exam_preps")
    .select("id, title, exam_type, exam_date, target_score")
    .eq("id", prepId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!prep) notFound();

  const service = createServiceClient();
  if (await plusOnlyLocked(service, user.id)) {
    return (
      <ParitySorShell {...shell} chrome="focus" backHref={examPrepHomeHref(prepId)}>
        <PlusOnlyPage featureName={CRAM_SHEET_NAME} returnPath={examPrepCramSheetHref(prepId)} exitHref={examPrepHomeHref(prepId)} />
      </ParitySorShell>
    );
  }

  const sheet = await loadCramSheet(service, {
    prepId,
    userId: user.id,
    targetScore: typeof prep.target_score === "number" ? prep.target_score : null,
  });
  const prepTitle = (prep.title as string | null) ?? (prep.exam_type as string | null) ?? "Sınav hazırlığı";
  const examDay = formatDayLong((prep.exam_date as string | null) ?? null);
  const share = await cramShare(prepId, prepTitle);

  return (
    <ParitySorShell {...shell} chrome="focus" backHref={examPrepHomeHref(prepId)}>
      <CramSheetView sheet={sheet} prepTitle={prepTitle} examDay={examDay} homeHref={examPrepHomeHref(prepId)} share={share} />
    </ParitySorShell>
  );
}

/**
 * Paylaşım (15 Kasım 2026, ürün sahibi: "WhatsApp'ta paylaş, bağlantıyı kopyala, baskıda imza ve QR"). Kâğıdın kendi
 * adresi yalnız sahibine açık; paylaşılan bağlantı hazırlığın imzalı davetidir (`prep-invite.ts`): arkadaş aynı konu
 * sırasıyla kendi kopyasını alır, kimse kimsenin sonucunu görmez, belge içeriği gitmez. QR sunucuda üretilir (veri
 * dışarı çıkmaz). İmza sırrı yoksa paylaşım düğmeleri görünmez.
 */
async function cramShare(prepId: string, prepTitle: string): Promise<CramShare | null> {
  const token = createPrepInviteToken(prepId);
  if (!token) return null;
  const url = prepInviteUrl(token);
  if (!isAbsoluteHttpUrl(url)) return null;
  const qrSrc = await qrDataUri(url, 160).catch(() => null);
  return { url, whatsappHref: whatsappShareHref(cramShareText(prepTitle), url), qrSrc };
}
