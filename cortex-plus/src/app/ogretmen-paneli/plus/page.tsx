import Link from "next/link";
import { Suspense } from "react";
import { AstraSubscriptionCards } from "@/components/parity/astra-subscription-cards";
import { TeacherShell } from "@/components/layout/teacher-shell";
import { requireTeacher } from "@/lib/auth/session";
import {
  FREE_MAX_CLASSROOMS,
  FREE_MAX_STUDENTS,
} from "@/lib/teacher/entitlements";

export const metadata = { title: "Plus" };

export default async function OgretmenPlusPage() {
  const { supabase } = await requireTeacher();

  const { data: plans } = await supabase
    .from("plans")
    .select("id, name, description, price_try, credit_amount, is_premium")
    .eq("active", true)
    .order("sort_order");

  return (
    <TeacherShell title="Plus">
      <section className="astra-pay-card mb-6 space-y-3 p-5">
        <h1 className="text-lg font-semibold">Okul öğretmeni Plus</h1>
        <ul className="space-y-2 text-sm text-[var(--astra-muted)]">
          <li>
            Ücretsiz: {FREE_MAX_CLASSROOMS} sınıf, {FREE_MAX_STUDENTS} öğrenci,
            temel ödev
          </li>
          <li>Plus: sınırsız sınıf ve öğrenci, AI quiz, raporlar, quiz paylaşımı</li>
        </ul>
        <Link href="/ogretmen-paneli" className="text-xs underline">
          Panele dön
        </Link>
      </section>
      <Suspense fallback={<p className="text-sm">Yükleniyor…</p>}>
        <AstraSubscriptionCards
          plans={plans ?? []}
          closeHref="/ogretmen-paneli"
        />
      </Suspense>
    </TeacherShell>
  );
}
