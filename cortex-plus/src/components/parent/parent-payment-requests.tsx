"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

type RequestRow = {
  id: string;
  message: string | null;
  created_at: string;
  plan_id: string | null;
  student_id: string;
  profiles: { full_name: string | null } | null;
  plans: { name: string; price_try: number } | null;
};

export function ParentPaymentRequests({
  requests,
}: {
  requests: RequestRow[];
}) {
  if (!requests.length) return null;

  return (
    <section className="astra-pay-card mt-6 p-4">
      <h2 className="text-sm font-semibold">Ödeme istekleri</h2>
      <p className="mt-1 text-xs text-[var(--astra-muted)]">
        Çocuğun Plus paketi için gönderdiği istekler.
      </p>
      <ul className="mt-4 space-y-3">
        {requests.map((row) => (
          <li
            key={row.id}
            className="rounded-2xl border border-[var(--astra-border)] p-3 text-sm"
          >
            <p className="font-medium">
              {row.profiles?.full_name ?? "Öğrenci"} ·{" "}
              {row.plans?.name ?? "Plus paketi"}
            </p>
            {row.message ? (
              <p className="mt-1 text-xs text-[var(--astra-muted)]">
                {row.message}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={`/odemeler?plan=${row.plan_id ?? ""}`}
                className="astra-btn-primary rounded-full px-4 py-1.5 text-xs font-semibold"
              >
                Ödemeye git
              </Link>
              <DismissButton requestId={row.id} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DismissButton({ requestId }: { requestId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      disabled={pending}
      className="rounded-full px-4 py-1.5 text-xs text-[var(--astra-muted)] hover:bg-[var(--astra-pill)]"
      onClick={() => {
        startTransition(async () => {
          const supabase = createClient();
          const { error } = await supabase
            .from("parent_payment_requests")
            .update({
              status: "cancelled",
              resolved_at: new Date().toISOString(),
            })
            .eq("id", requestId);
          if (error) toast.error("Kapatılamadı.");
          else {
            toast.success("İstek kapatıldı.");
            router.refresh();
          }
        });
      }}
    >
      Kapat
    </button>
  );
}
