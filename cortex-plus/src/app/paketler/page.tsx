import { redirect } from "next/navigation";

export const metadata = { title: "Paketler" };

/** Eski rota — Astra `/pay` ile birleşti. */
export default function PaketlerPage() {
  redirect("/pay");
}
