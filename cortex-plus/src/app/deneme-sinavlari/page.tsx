import { redirect } from "next/navigation";
import { ParityExamPrep } from "@/components/parity/exam-prep";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { loadPrepCards } from "@/lib/learning/prep-cards";
import { loadNearestExamCountdown } from "@/lib/learning/exam-countdown-load";

export const metadata = { title: "Sınav hazırlığı" };

/*
  Sayfa tümüyle dinamik çiziliyor. Aynı sebep `/calisma-plani`'ndaki gibi:
  sarmalanan istemci bileşeni `useSearchParams()` kullanıyor, Suspense sınırı
  da yayında açılmıyordu. Sayfa zaten oturum gerektiriyor.
*/
export const dynamic = "force-dynamic";

/** Eski sekme bağlantıları (`?tab=mufredat`) 17 Ekim 2026'dan beri ayrı sayfalar. */
const TAB_PAGES: Record<string, string> = {
  okul: "/deneme-sinavlari/okulum",
  mufredat: "/deneme-sinavlari/mufredat",
  resmi: "/deneme-sinavlari/resmi",
};

export default async function DenemeSinavlariPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  if (tab && TAB_PAGES[tab]) redirect(TAB_PAGES[tab]);

  const { supabase, user } = await requireStudentArea();
  const [shell, cards, countdown] = await Promise.all([
    loadParityShellProps(supabase, user.id, user.email),
    loadPrepCards(supabase, user.id, 24),
    loadNearestExamCountdown(supabase, user.id),
  ]);

  return (
    <ParitySorShell {...shell} countdown={countdown}>
      <ParityExamPrep cards={cards} />
    </ParitySorShell>
  );
}
