import { notFound } from "next/navigation";
import { PaymentActivation } from "@/components/billing/payment-activation";

export const dynamic = "force-dynamic";

/** Uçtan uca fikstür (Paket J denetimi #5): ödeme dönüşü yoklaması; durum ucu testte taklit edilir. */
export default function E2eOdemePage() {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  return <PaymentActivation signedIn homeHref="/e2e/odeme?bitti=1" />;
}
