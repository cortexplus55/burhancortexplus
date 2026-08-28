import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { SectionCard } from "@/components/ui-kit/empty-state";
import { SupportForm } from "@/components/support/support-form";
import { getPrimaryRole, requireUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Destek" };

const SUPPORT_STATUS: Record<string, string> = {
  open: "Açık",
  pending: "Bekliyor",
  closed: "Kapandı",
  resolved: "Çözüldü",
};

export default async function DestekPage() {
  const { supabase, user } = await requireUser();
  const role = await getPrimaryRole(user.id);
  const isParent = role === "parent";

  const { data: requests } = await supabase
    .from("support_requests")
    .select("id, subject, status, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);

  if (!isParent) {
    return (
      <AppShell title="Destek" creditHint="Destek talebi göndermek ücretsizdir.">
        <div className="space-y-6">
          <SectionCard
            title="Yeni destek talebi"
            description="Sorununu yaz; ekibimiz e-posta ile dönüş yapar."
          >
            <SupportForm />
          </SectionCard>

          {requests?.length ? (
            <SectionCard title="Taleplerin">
              <ul className="divide-y">
                {requests.map((request) => (
                  <li
                    key={request.id}
                    className="flex items-center justify-between gap-3 py-2 text-sm"
                  >
                    <span>{request.subject}</span>
                    <span className="text-xs text-muted-foreground">
                      {request.status} · {formatDate(request.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Yardım" accountStrip={false}>
      <section className="pt-2">
        <h1 className="text-xl font-semibold">Yardım</h1>
        <p className="mt-1 text-sm text-[var(--astra-muted)]">
          Ödeme, bağlantı veya hesap için ekibe yaz. Çocuğuna nasıl destek
          olacağını sormak için Destek AI’yı kullan.
        </p>
      </section>

      <Link
        href="/veli/sor"
        className="astra-btn-primary mt-5 flex w-full items-center justify-center rounded-full py-3 text-sm font-semibold"
      >
        Destek AI’ya git
      </Link>

      <section className="astra-pay-card mt-5 p-5">
        <h2 className="font-semibold">Ekibe yaz</h2>
        <p className="mt-1 text-xs text-[var(--astra-muted)]">
          Dönüş{" "}
          <a
            href="mailto:cortexplus@cortexplus.app"
            className="text-[var(--astra-primary)] underline-offset-2 hover:underline"
          >
            cortexplus@cortexplus.app
          </a>{" "}
          adresinden gelir.
        </p>
        <div className="mt-4">
          <SupportForm tone="astra" />
        </div>
      </section>

      {requests?.length ? (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-medium text-[var(--astra-muted)]">
            Taleplerin
          </h2>
          <ul className="space-y-2">
            {requests.map((request) => (
              <li key={request.id} className="astra-pay-card p-4 text-sm">
                <p className="font-medium">{request.subject}</p>
                <p className="mt-1 text-xs text-[var(--astra-muted)]">
                  {SUPPORT_STATUS[request.status] ?? request.status} ·{" "}
                  {formatDate(request.created_at)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </AppShell>
  );
}
