import { redirect } from "next/navigation";

export const metadata = { title: "Ana Sayfa" };
export const dynamic = "force-dynamic";

/**
 * Ana Sayfa artık sohbet (30 Eylül 2026, Astra gibi): giriş, logo ve eski
 * bağlantılar buraya geliyor, buradan sohbete geçiliyor. Program panosu
 * Çalış sekmesinde (`ProgramHub`).
 */
export default function DashboardPage() {
  redirect("/ogretmen");
}
